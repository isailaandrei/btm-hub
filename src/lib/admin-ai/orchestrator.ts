/**
 * Raw-card admin AI orchestration.
 *
 * The CRM corpus is small enough to stuff directly. This path renders eligible
 * contacts as verbatim cards, sends those cards plus raw citation anchors to
 * the model, then strips any citation that is not backed by supplied evidence
 * before persistence.
 */

import { renderContactCard, type RenderedContactCard } from "./contact-card";
import { adminAiDebugLog, startAdminAiDebugTimer } from "./debug";
import { EvidenceAliasRegistry } from "./evidence-alias";
import { isAdminAiEvidenceEnabled } from "./feature-flags";
import {
  applyHardConstraintsToResponse,
  applyPlannedConstraints,
  extractHardConstraints,
  filterRecordsByHardConstraints,
  filterResponseToAllowedContacts,
  type AdminAiHardConstraints,
  type PlannedFilterResult,
} from "./hard-constraints";
import {
  runConstraintPlanner,
  type PlannerRun,
} from "./constraint-planner";
import {
  getAdminAiProvider,
  getAdminAiScanMode,
  type AdminAiProvider,
} from "./provider";
import { MAP_CHUNK_SIZE, runMapScan, type MapScanResult } from "./map-scan";
import type { PlannerOutput } from "./schemas";
import { adminAiResponseSchema } from "./schemas";
import { retrieveConversationEvidence } from "@/lib/conversations/retrieval";
import {
  createAdminAiCitations,
  createAdminAiMessage,
} from "@/lib/data/admin-ai";
import {
  loadContactCardRecords,
  loadEligibleContactCardRecords,
  type ContactCardRecord,
} from "@/lib/data/contact-cards";
import type {
  AdminAiAdditionalMatch,
  AdminAiCitationDraft,
  AdminAiQueryPlan,
  AdminAiResponse,
  AdminAiScope,
  AdminAiStructuredFilter,
  EvidenceItem,
} from "@/types/admin-ai";

export type RunAdminAiAnalysisResult = {
  status: "complete" | "failed";
  assistantMessageId: string;
  queryPlan: AdminAiQueryPlan;
  response: AdminAiResponse | null;
  citations: AdminAiCitationDraft[];
  modelMetadata: Record<string, unknown> | null;
  error: string | null;
};

const CHAT_RETRIEVAL_UNAVAILABLE_NOTE =
  "Conversation evidence retrieval was unavailable for this answer.";

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function appendUncertainty(
  response: AdminAiResponse,
  note: string,
): AdminAiResponse {
  if (response.uncertainty.includes(note)) return response;
  return {
    ...response,
    uncertainty: [...response.uncertainty, note],
  };
}

function buildInsufficientEvidenceResponse(
  scope: AdminAiScope,
  options?: { extra?: string },
): AdminAiResponse {
  const base =
    scope === "contact"
      ? "The current CRM evidence for this contact is too thin to support a reliable synthesis."
      : "The current CRM evidence is too thin to support a reliable shortlist for this question.";
  const uncertainty = options?.extra ? [base, options.extra] : [base];
  return { assumptions: [], uncertainty };
}

function discloseChatRetrievalUnavailable(
  response: AdminAiResponse,
  unavailable: boolean,
): AdminAiResponse {
  return unavailable
    ? appendUncertainty(response, CHAT_RETRIEVAL_UNAVAILABLE_NOTE)
    : response;
}

function contactCountLabel(count: number): string {
  return count === 1 ? "contact was" : "contacts were";
}

function discloseHardConstraintPrefilter(input: {
  response: AdminAiResponse;
  droppedContactCount: number;
  droppedDeclinedContactCount: number;
  constraints: AdminAiHardConstraints;
}): AdminAiResponse {
  const { budgetMin, tagCategory, otherTagCategories } = input.constraints;
  let response = input.response;

  if (input.droppedContactCount > 0) {
    const label = contactCountLabel(input.droppedContactCount);
    if (tagCategory) {
      const others =
        otherTagCategories && otherTagCategories.length > 0
          ? ` (other matched tag categories were not applied: ${otherTagCategories.join(", ")})`
          : "";
      response = appendUncertainty(
        response,
        `${input.droppedContactCount} ${label} excluded because they carry no '${tagCategory}' tag${others}.`,
      );
    } else {
      const budgetText =
        budgetMin === undefined
          ? "the deterministic hard filters"
          : `the deterministic budget filter (${formatMoney(budgetMin)} minimum)`;
      response = appendUncertainty(
        response,
        `${input.droppedContactCount} ${label} excluded by ${budgetText} before synthesis because the available CRM data did not satisfy the user's hard constraint.`,
      );
    }
  }

  if (tagCategory && input.droppedDeclinedContactCount > 0) {
    const label = contactCountLabel(input.droppedDeclinedContactCount);
    response = appendUncertainty(
      response,
      `${input.droppedDeclinedContactCount} ${label} excluded because their only '${tagCategory}' tag is 'Declined'. To review declined contacts, use the Tags filter in the Contacts panel.`,
    );
  }

  return response;
}

export function describeAssistantResponse(response: AdminAiResponse): string {
  if (response.shortlist && response.shortlist.length > 0) {
    const names = response.shortlist.map((entry) => entry.contactName);
    const preview = names.slice(0, 3).join(", ");
    const tail = names.length > 3 ? `, +${names.length - 3} more` : "";
    const label =
      names.length === 1 ? "Shortlisted 1 contact" : `Shortlisted ${names.length} contacts`;
    const additionalCount = response.additionalMatches?.length ?? 0;
    const additionalLabel =
      additionalCount > 0
        ? ` (+${additionalCount} more ${additionalCount === 1 ? "match" : "matches"})`
        : "";
    return `${label}${additionalLabel}: ${preview}${tail}.`;
  }
  if (response.contactAssessment) return "Contact assessment returned.";
  if (response.uncertainty.length > 0) return response.uncertainty[0]!;
  return "Admin AI response.";
}

const SHORTLIST_CAP = 10;

function byMatchStrengthDesc(
  a: { matchStrength?: number },
  b: { matchStrength?: number },
): number {
  return (b.matchStrength ?? 0) - (a.matchStrength ?? 0);
}

/**
 * Code-enforced ranking. The model is asked to rank the shortlist by
 * `matchStrength`, but has been observed emitting corpus (created_at) order and
 * overflowing the 10-entry cap. Sort deterministically (Array.sort is stable),
 * cap the shortlist at 10, and push the overflow to the FRONT of
 * additionalMatches so order and cap hold regardless of model behavior.
 */
export function enforceShortlistRanking(response: AdminAiResponse): AdminAiResponse {
  const shortlist = response.shortlist;
  if (!shortlist || shortlist.length === 0) {
    if (!response.additionalMatches || response.additionalMatches.length === 0) {
      return response;
    }
    return {
      ...response,
      additionalMatches: [...response.additionalMatches].sort(byMatchStrengthDesc),
    };
  }

  const ranked = [...shortlist].sort(byMatchStrengthDesc);
  const kept = ranked.slice(0, SHORTLIST_CAP);
  const overflow: AdminAiAdditionalMatch[] = ranked
    .slice(SHORTLIST_CAP)
    .map((entry) => ({
      contactId: entry.contactId,
      contactName: entry.contactName,
      reason: entry.whyFit[0] ?? "",
      matchStrength: entry.matchStrength,
    }));
  const combined = [...overflow, ...(response.additionalMatches ?? [])];
  return {
    ...response,
    shortlist: kept,
    additionalMatches:
      combined.length > 0 ? combined.sort(byMatchStrengthDesc) : undefined,
  };
}

function buildCardQueryPlan(input: {
  scope: AdminAiScope;
  question: string;
  contactId?: string;
}): AdminAiQueryPlan {
  const plan: AdminAiQueryPlan = {
    mode: input.scope === "contact" ? "contact_synthesis" : "global_search",
    contactId: input.scope === "contact" ? input.contactId : undefined,
    structuredFilters: [],
    textFocus: input.question.trim() ? [input.question.trim()] : [],
    requestedLimit: input.scope === "contact" ? 1 : 10,
  };

  return plan;
}

// Stable per-scope prompt-cache key. OpenAI prompt caching matches on the
// prompt *prefix*, so correctness across cohort changes is already guaranteed
// by that prefix match. A constant key (rather than a content hash that changes
// on every data change) routes all global questions to the same cache node so
// they share the long, stable card prefix and maximize hit rate.
const ADMIN_AI_GLOBAL_PROMPT_CACHE_KEY = "admin-ai-cards:global";

function collectCitationRefs(
  response: AdminAiResponse,
): Array<{ evidenceId: string; claimKey: string }> {
  const refs: Array<{ evidenceId: string; claimKey: string }> = [];
  for (const entry of response.shortlist ?? []) refs.push(...entry.citations);
  if (response.contactAssessment) refs.push(...response.contactAssessment.citations);

  const seen = new Set<string>();
  return refs.filter((ref) => {
    if (seen.has(ref.evidenceId)) return false;
    seen.add(ref.evidenceId);
    return true;
  });
}

type CitationResolution = {
  drafts: AdminAiCitationDraft[];
  droppedEvidenceIds: string[];
};

function resolveCitationDrafts(
  response: AdminAiResponse,
  evidence: EvidenceItem[],
): CitationResolution {
  const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item] as const));
  const drafts: AdminAiCitationDraft[] = [];
  const droppedEvidenceIds: string[] = [];

  for (const ref of collectCitationRefs(response)) {
    const item = evidenceById.get(ref.evidenceId);
    if (!item) {
      droppedEvidenceIds.push(ref.evidenceId);
      continue;
    }
    drafts.push({
      claim_key: ref.claimKey,
      source_type: item.sourceType,
      source_id: item.sourceId,
      contact_id: item.contactId,
      application_id: item.applicationId,
      source_label: item.sourceLabel,
      snippet: item.text,
    });
  }

  if (droppedEvidenceIds.length > 0) {
    console.warn(
      "[admin-ai] synthesis returned citations outside the evidence pack — dropping",
      { droppedEvidenceIds, keptCount: drafts.length },
    );
  }
  return { drafts, droppedEvidenceIds };
}

function pruneUncitedGlobalShortlistEntries(input: {
  response: AdminAiResponse;
  droppedEvidenceIds: string[];
}): {
  response: AdminAiResponse;
  droppedContactIds: string[];
} {
  const droppedContactIds: string[] = [];
  const shortlist = input.response.shortlist?.filter((entry) => {
    if (entry.citations.length > 0) return true;
    droppedContactIds.push(entry.contactId);
    return false;
  });

  if (input.droppedEvidenceIds.length === 0 && droppedContactIds.length === 0) {
    return { response: input.response, droppedContactIds };
  }

  const uncertainty = [...input.response.uncertainty];
  const note =
    shortlist && shortlist.length > 0
      ? "Some model-returned shortlist entries were dropped because their citations could not be resolved to raw evidence."
      : "The model returned shortlist entries, but their citations could not be resolved to raw evidence, so no grounded shortlist could be kept.";
  if (!uncertainty.includes(note)) uncertainty.push(note);

  return {
    response: {
      ...input.response,
      shortlist,
      uncertainty,
    },
    droppedContactIds,
  };
}

function applyDroppedEvidenceIdsToResponse(
  response: AdminAiResponse,
  droppedEvidenceIds: Set<string>,
): AdminAiResponse {
  if (droppedEvidenceIds.size === 0) return response;
  return {
    ...response,
    shortlist: response.shortlist?.map((entry) => ({
      ...entry,
      citations: entry.citations.filter(
        (citation) => !droppedEvidenceIds.has(citation.evidenceId),
      ),
    })),
    contactAssessment: response.contactAssessment
      ? {
          ...response.contactAssessment,
          citations: response.contactAssessment.citations.filter(
            (citation) => !droppedEvidenceIds.has(citation.evidenceId),
          ),
        }
      : undefined,
  };
}

function translateCitationAliases(
  response: AdminAiResponse,
  registry: EvidenceAliasRegistry,
): AdminAiResponse {
  return {
    ...response,
    shortlist: response.shortlist?.map((entry) => ({
      ...entry,
      citations: entry.citations.map((citation) => ({
        ...citation,
        evidenceId: registry.toRealId(citation.evidenceId) ?? citation.evidenceId,
      })),
    })),
    contactAssessment: response.contactAssessment
      ? {
          ...response.contactAssessment,
          citations: response.contactAssessment.citations.map((citation) => ({
            ...citation,
            evidenceId:
              registry.toRealId(citation.evidenceId) ?? citation.evidenceId,
          })),
        }
      : undefined,
  };
}

function stripResponseCitations(response: AdminAiResponse): AdminAiResponse {
  return {
    ...response,
    shortlist: response.shortlist?.map((entry) => ({
      ...entry,
      citations: [],
    })),
    contactAssessment: response.contactAssessment
      ? {
          ...response.contactAssessment,
          citations: [],
        }
      : undefined,
  };
}

function stripEvidenceAnchors(text: string): string {
  return text.replace(/\s+\[e\d+\]/g, "");
}

async function persistFailedAssistantMessage(input: {
  threadId: string;
  content: string;
  queryPlan: AdminAiQueryPlan;
  modelMetadata?: Record<string, unknown> | null;
}): Promise<string> {
  const { id } = await createAdminAiMessage({
    threadId: input.threadId,
    role: "assistant",
    content: input.content,
    status: "failed",
    queryPlan: input.queryPlan,
    responseJson: null,
    modelMetadata: input.modelMetadata ?? null,
  });
  return id;
}

async function persistInsufficientResponse(input: {
  threadId: string;
  queryPlan: AdminAiQueryPlan;
  response: AdminAiResponse;
  reason: string;
}): Promise<RunAdminAiAnalysisResult> {
  const metadata = { source: "system", reason: input.reason };
  const { id } = await createAdminAiMessage({
    threadId: input.threadId,
    role: "assistant",
    content: describeAssistantResponse(input.response),
    status: "complete",
    queryPlan: input.queryPlan,
    responseJson: input.response,
    modelMetadata: metadata,
  });
  return {
    status: "complete",
    assistantMessageId: id,
    queryPlan: input.queryPlan,
    response: input.response,
    citations: [],
    modelMetadata: metadata,
    error: null,
  };
}

function renderRecords(
  records: ContactCardRecord[],
  options: { includeEvidence: boolean },
): {
  cards: RenderedContactCard[];
  evidence: EvidenceItem[];
  evidenceAliases: EvidenceAliasRegistry;
} {
  const evidenceAliases = new EvidenceAliasRegistry();
  const cards = records.map((record) =>
    renderContactCard(record, evidenceAliases),
  );
  if (!options.includeEvidence) {
    return {
      cards: cards.map((card) => ({
        ...card,
        text: stripEvidenceAnchors(card.text),
        evidence: [],
      })),
      evidence: [],
      evidenceAliases,
    };
  }
  return {
    cards,
    evidence: cards.flatMap((card) => card.evidence),
    evidenceAliases,
  };
}

const PLANNER_UNAVAILABLE_NOTE =
  "AI constraint planning was unavailable for this answer; only basic deterministic filters were applied.";

/**
 * A prefilter outcome shared by both global-scope paths (constraint planner and
 * the legacy deterministic filters) so downstream synthesis, disclosure, the
 * response safety net, `structuredFilters`, and metadata are path-agnostic.
 */
type GlobalPrefilter = {
  records: ContactCardRecord[];
  structuredFilters: AdminAiStructuredFilter[];
  disclose: (response: AdminAiResponse) => AdminAiResponse;
  enforce: (response: AdminAiResponse) => {
    response: AdminAiResponse;
    droppedContactIds: string[];
  };
  // Guarantees enumeration completeness: appends any prefiltered member missing
  // from the answer. Identity except on a pure-enumeration planner tag path.
  completeEnumeration: (response: AdminAiResponse) => AdminAiResponse;
  metadata: Record<string, unknown> | null;
};

function nullPrefilter(records: ContactCardRecord[]): GlobalPrefilter {
  return {
    records,
    structuredFilters: [],
    disclose: (response) => response,
    enforce: (response) => ({ response, droppedContactIds: [] }),
    completeEnumeration: (response) => response,
    metadata: null,
  };
}

function planToStructuredFilters(plan: PlannerOutput): AdminAiStructuredFilter[] {
  const filters: AdminAiStructuredFilter[] = [];
  if (plan.tagConstraint) {
    filters.push({
      field: plan.tagConstraint.category,
      op: "in",
      value: plan.tagConstraint.includeStatuses,
    });
  }
  if (plan.budgetMin !== null) {
    filters.push({ field: "budget", op: "eq", value: String(plan.budgetMin) });
  }
  for (const fieldConstraint of plan.fieldConstraints) {
    filters.push({
      field: fieldConstraint.field,
      op: fieldConstraint.op,
      value: fieldConstraint.value,
    });
  }
  return filters;
}

function legacyToStructuredFilters(
  constraints: AdminAiHardConstraints,
): AdminAiStructuredFilter[] {
  const filters: AdminAiStructuredFilter[] = [];
  if (constraints.tagCategory) {
    filters.push({ field: constraints.tagCategory, op: "in", value: [] });
  }
  if (constraints.budgetMin !== undefined) {
    filters.push({
      field: "budget",
      op: "eq",
      value: String(constraints.budgetMin),
    });
  }
  return filters;
}

function disclosePlannerPrefilter(
  response: AdminAiResponse,
  plan: PlannerOutput,
  applied: PlannedFilterResult,
  droppedParts: string[],
): AdminAiResponse {
  let result = response;
  if (plan.tagConstraint && applied.droppedByTag.length > 0) {
    const statuses =
      plan.tagConstraint.includeStatuses.length > 0
        ? `[${plan.tagConstraint.includeStatuses.join(", ")}]`
        : "[any status except Declined]";
    result = appendUncertainty(
      result,
      `Applied filter: '${plan.tagConstraint.category}' tags ${statuses} — ${applied.droppedByTag.length} contact(s) excluded.`,
    );
  }
  if (plan.budgetMin !== null && applied.droppedByBudget.length > 0) {
    result = appendUncertainty(
      result,
      `Applied filter: budget at least ${formatMoney(plan.budgetMin)} — ${applied.droppedByBudget.length} contact(s) excluded.`,
    );
  }
  if (plan.fieldConstraints.length > 0 && applied.droppedByField.length > 0) {
    const fields = plan.fieldConstraints
      .map((fieldConstraint) => `${fieldConstraint.field} ${fieldConstraint.op} '${fieldConstraint.value}'`)
      .join("; ");
    result = appendUncertainty(
      result,
      `Applied field filter(s) (${fields}) — ${applied.droppedByField.length} contact(s) excluded.`,
    );
  }
  if (droppedParts.length > 0) {
    result = appendUncertainty(
      result,
      `Some planned filters were ignored as unrecognized: ${droppedParts.join("; ")}.`,
    );
  }
  return result;
}

// For a pure-enumeration tag question, the prefiltered records ARE the answer.
// Append any member the reduce tier dropped to the END of additionalMatches so
// recall is 1.0 by construction; ranking of what's already there stays model
// territory.
function buildEnumerationCompleter(
  records: ContactCardRecord[],
  plan: PlannerOutput,
): (response: AdminAiResponse) => AdminAiResponse {
  if (!plan.enumerationOnly || !plan.tagConstraint) {
    return (response) => response;
  }
  const tagConstraint = plan.tagConstraint;
  const wanted =
    tagConstraint.includeStatuses.length > 0
      ? new Set(tagConstraint.includeStatuses.map((status) => status.toLowerCase()))
      : null;
  const rosters = records.map((record) => {
    const matches = (record.contactTags ?? []).filter((tag) => {
      if (tag.categoryName?.toLowerCase() !== tagConstraint.category.toLowerCase()) {
        return false;
      }
      const name = (tag.tagName ?? "").toLowerCase();
      return wanted ? wanted.has(name) : name !== "declined";
    });
    return {
      contactId: record.contact.id,
      contactName: record.contact.name ?? "",
      status: matches.map((tag) => tag.tagName).join(", "),
    };
  });

  return (response) => {
    const present = new Set<string>();
    for (const entry of response.shortlist ?? []) present.add(entry.contactId);
    for (const match of response.additionalMatches ?? []) present.add(match.contactId);
    const missing = rosters.filter((entry) => !present.has(entry.contactId));
    if (missing.length === 0) return response;
    adminAiDebugLog("enumeration-completeness-appended", { count: missing.length });
    const appended: AdminAiAdditionalMatch[] = missing.map((entry) => ({
      contactId: entry.contactId,
      contactName: entry.contactName,
      reason: `Carries '${tagConstraint.category}: ${entry.status}' tag`,
      matchStrength: 1,
    }));
    return {
      ...response,
      additionalMatches: [...(response.additionalMatches ?? []), ...appended],
    };
  };
}

function buildPlannerPrefilter(
  records: ContactCardRecord[],
  run: PlannerRun,
): GlobalPrefilter {
  const applied = applyPlannedConstraints(records, run.plan);
  const allowedContactIds = new Set(
    applied.records.map((record) => record.contact.id),
  );
  return {
    records: applied.records,
    structuredFilters: planToStructuredFilters(run.plan),
    disclose: (response) =>
      disclosePlannerPrefilter(response, run.plan, applied, run.droppedParts),
    enforce: (response) =>
      filterResponseToAllowedContacts(response, allowedContactIds),
    completeEnumeration: buildEnumerationCompleter(applied.records, run.plan),
    metadata: {
      planner: {
        plan: run.plan,
        droppedParts: run.droppedParts,
        droppedByTag: applied.droppedByTag.length,
        droppedByBudget: applied.droppedByBudget.length,
        droppedByField: applied.droppedByField.length,
      },
    },
  };
}

function buildLegacyPrefilter(
  records: ContactCardRecord[],
  question: string,
): GlobalPrefilter {
  const filter = filterRecordsByHardConstraints(
    records,
    extractHardConstraints(question, records),
  );
  const allowedContactIds = new Set(
    filter.records.map((record) => record.contact.id),
  );
  const hasConstraints =
    filter.constraints.budgetMin !== undefined ||
    filter.constraints.tagCategory !== undefined;
  return {
    records: filter.records,
    structuredFilters: legacyToStructuredFilters(filter.constraints),
    disclose: (response) => {
      // We are on the legacy path because the planner was unavailable — disclose
      // the degraded mode (fail loud, one sanctioned fallback).
      let result = appendUncertainty(response, PLANNER_UNAVAILABLE_NOTE);
      if (hasConstraints) {
        result = discloseHardConstraintPrefilter({
          response: result,
          droppedContactCount: filter.droppedContactIds.length,
          droppedDeclinedContactCount: filter.droppedDeclinedContactIds.length,
          constraints: filter.constraints,
        });
      }
      return result;
    },
    enforce: (response) => {
      if (!hasConstraints) return { response, droppedContactIds: [] };
      return applyHardConstraintsToResponse({
        response,
        allowedContactIds,
        constraints: filter.constraints,
      });
    },
    completeEnumeration: (response) => response,
    metadata: {
      plannerUnavailable: true,
      ...(hasConstraints
        ? {
            hardConstraints: {
              ...filter.constraints,
              prefilteredContactCount: filter.droppedContactIds.length,
              droppedContactIds: filter.droppedContactIds,
              droppedDeclinedContactIds: filter.droppedDeclinedContactIds,
            },
          }
        : {}),
    },
  };
}

async function computeGlobalPrefilter(input: {
  provider: AdminAiProvider;
  scope: AdminAiScope;
  records: ContactCardRecord[];
  question: string;
}): Promise<GlobalPrefilter> {
  if (input.scope !== "global") return nullPrefilter(input.records);
  const run = input.provider.isConfigured()
    ? await runConstraintPlanner({
        provider: input.provider,
        records: input.records,
        question: input.question,
      })
    : null;
  if (run) return buildPlannerPrefilter(input.records, run);
  return buildLegacyPrefilter(input.records, input.question);
}

async function runCardSynthesis(input: {
  scope: AdminAiScope;
  question: string;
  queryPlan: AdminAiQueryPlan;
  threadId: string;
  records: ContactCardRecord[];
}): Promise<RunAdminAiAnalysisResult> {
  const includeEvidence = isAdminAiEvidenceEnabled();
  const provider = getAdminAiProvider();
  const prefilter = await computeGlobalPrefilter({
    provider,
    scope: input.scope,
    records: input.records,
    question: input.question,
  });
  input.queryPlan.structuredFilters = prefilter.structuredFilters;
  const { cards, evidence, evidenceAliases } = renderRecords(prefilter.records, {
    includeEvidence,
  });
  if (!provider.isConfigured()) {
    const reason = provider.getUnavailableReason() ?? "Admin AI is unavailable.";
    const assistantMessageId = await persistFailedAssistantMessage({
      threadId: input.threadId,
      content: reason,
      queryPlan: input.queryPlan,
      modelMetadata: { source: "system", reason: "provider_not_configured" },
    });
    return {
      status: "failed",
      assistantMessageId,
      queryPlan: input.queryPlan,
      response: null,
      citations: [],
      modelMetadata: { source: "system", reason: "provider_not_configured" },
      error: reason,
    };
  }

  let chatEvidence: EvidenceItem[] = [];
  let chatRetrievalUnavailable = false;
  if (includeEvidence) {
    try {
      chatEvidence = await retrieveConversationEvidence({
        question: input.question,
        contactId:
          input.scope === "contact" ? input.queryPlan.contactId ?? null : null,
        limit: 40,
      });
    } catch (error) {
      chatRetrievalUnavailable = true;
      const message = error instanceof Error ? error.message : String(error);
      adminAiDebugLog("conversation-retrieval-unavailable", {
        scope: input.scope,
        contactId: input.scope === "contact" ? input.queryPlan.contactId ?? null : null,
        error: message,
      });
      console.warn("[admin-ai] conversation evidence retrieval unavailable", {
        error: message,
      });
    }
  }
  const allowedEvidence = includeEvidence ? [...evidence, ...chatEvidence] : [];

  const prefilterApplied = prefilter.structuredFilters.length > 0;

  adminAiDebugLog("raw-cards-assembled", {
    scope: input.scope,
    cardCount: cards.length,
    evidenceCount: allowedEvidence.length,
    evidenceEnabled: includeEvidence,
    structuredFilters: prefilter.structuredFilters,
    prefilterDroppedCount: input.records.length - prefilter.records.length,
    chatEvidenceCount: chatEvidence.length,
    chatRetrievalUnavailable,
    promptCacheKey: input.scope === "global" ? ADMIN_AI_GLOBAL_PROMPT_CACHE_KEY : null,
  });

  if (cards.length === 0 || (includeEvidence && allowedEvidence.length === 0)) {
    const response = discloseChatRetrievalUnavailable(
      buildInsufficientEvidenceResponse(input.scope, {
        extra:
          prefilterApplied
            ? "No contacts matched the deterministic hard filters for this question."
            : input.scope === "contact"
            ? "No raw application, note, tag, or conversation evidence is available for this contact."
            : "No eligible contacts with raw application, note, tag, or conversation evidence are available.",
      }),
      chatRetrievalUnavailable,
    );
    return persistInsufficientResponse({
      threadId: input.threadId,
      queryPlan: input.queryPlan,
      response,
      reason: "no_raw_card_evidence",
    });
  }

  try {
    // Map stage (global scope + map_reduce mode only): run a chunked recall
    // pass and narrow the corpus to the surfaced candidates before synthesis.
    // Single mode and contact scope skip this and stay byte-identical.
    let synthesisCards = cards;
    let synthesisChatEvidence = chatEvidence;
    let scanMetadata: MapScanResult["scanMetadata"] | null = null;
    let mapReduceMode = false;

    if (input.scope === "global" && getAdminAiScanMode() === "map_reduce") {
      mapReduceMode = true;
      if (!provider.completeJson) {
        throw new Error(
          "map_reduce scan mode currently requires ADMIN_AI_PROVIDER=deepseek",
        );
      }
      if (cards.length <= MAP_CHUNK_SIZE) {
        // Small (often tag-prefiltered) cohort: the map stage can only drop
        // members it fails to re-flag, so skip it and let reduce judge every
        // card directly. Also cheaper for small questions.
        adminAiDebugLog("map-skipped-small-corpus", { cardCount: cards.length });
      } else {
        const mapResult = await runMapScan({
          provider,
          cards,
          question: input.question,
        });
        scanMetadata = mapResult.scanMetadata;
        if (mapResult.candidateIds.size === 0) {
          const insufficient = discloseChatRetrievalUnavailable(
            buildInsufficientEvidenceResponse("global", {
              extra: `A full chunked scan of all ${cards.length} eligible contacts found no candidates for this question.`,
            }),
            chatRetrievalUnavailable,
          );
          return persistInsufficientResponse({
            threadId: input.threadId,
            queryPlan: input.queryPlan,
            response: insufficient,
            reason: "map_scan_no_candidates",
          });
        }
        const { candidateIds } = mapResult;
        synthesisCards = cards.filter((card) => candidateIds.has(card.contactId));
        synthesisChatEvidence = chatEvidence.filter((item) =>
          candidateIds.has(item.contactId),
        );
      }
    }

    const timer = startAdminAiDebugTimer("raw-card-synthesis", {
      scope: input.scope,
      cardCount: synthesisCards.length,
      evidenceCount: allowedEvidence.length,
    });
    // In map_reduce mode the card set is question-dependent (candidate subset, or
    // a tag-prefiltered cohort when the map was skipped), so the shared global
    // prompt-cache key would poison the prefix match — send none.
    const promptCacheKey = mapReduceMode
      ? null
      : input.scope === "global"
        ? ADMIN_AI_GLOBAL_PROMPT_CACHE_KEY
        : null;
    const aliasedChatEvidence = synthesisChatEvidence.map((item) => ({
      ...item,
      evidenceId: evidenceAliases.register(item.evidenceId),
    }));
    const { response: rawResponse, modelMetadata } = await provider.generate({
      question: input.question,
      scope: input.scope,
      queryPlan: input.queryPlan,
      cards: synthesisCards,
      // Send only conversation-retrieval evidence to the model. Card-derived
      // evidence ids are already inline in the card text, and duplicating the
      // full items here once made global prompts exceed provider size limits
      // (~74% of a 10.6MB payload). `allowedEvidence` still validates
      // citations server-side below.
      evidence: includeEvidence ? aliasedChatEvidence : [],
      includeEvidence,
      promptCacheKey,
    });

    let response = enforceShortlistRanking(
      translateCitationAliases(
        adminAiResponseSchema.parse(rawResponse),
        evidenceAliases,
      ),
    );
    let citations: AdminAiCitationDraft[] = [];
    let droppedEvidenceIds: string[] = [];

    if (includeEvidence) {
      const resolved = resolveCitationDrafts(response, allowedEvidence);
      citations = resolved.drafts;
      droppedEvidenceIds = resolved.droppedEvidenceIds;
      response = applyDroppedEvidenceIdsToResponse(
        response,
        new Set(droppedEvidenceIds),
      );
    } else {
      response = stripResponseCitations(response);
    }

    if (
      includeEvidence &&
      input.scope === "contact" &&
      response.contactAssessment &&
      response.contactAssessment.citations.length === 0
    ) {
      const insufficient = discloseChatRetrievalUnavailable(
        buildInsufficientEvidenceResponse("contact", {
          extra:
            droppedEvidenceIds.length > 0
              ? "The model returned a contact assessment, but its citations could not be resolved to raw evidence, so no grounded assessment could be kept."
              : "The model did not return a grounded contact assessment for this question.",
        }),
        chatRetrievalUnavailable,
      );
      timer.end({
        status: "insufficient_after_evidence_cleanup",
        droppedEvidenceCount: droppedEvidenceIds.length,
      });
      return persistInsufficientResponse({
        threadId: input.threadId,
        queryPlan: input.queryPlan,
        response: insufficient,
        reason: "ungrounded_raw_card_contact_assessment",
      });
    }

    let droppedContactIds: string[] = [];
    if (includeEvidence && input.scope === "global") {
      const cleaned = pruneUncitedGlobalShortlistEntries({
        response,
        droppedEvidenceIds,
      });
      response = cleaned.response;
      droppedContactIds = cleaned.droppedContactIds;

      if ((response.shortlist?.length ?? 0) === 0) {
        const insufficient = discloseChatRetrievalUnavailable(
          buildInsufficientEvidenceResponse("global", {
            extra:
              response.uncertainty.at(-1) ??
              "The model did not return any grounded shortlist entries for this question.",
          }),
          chatRetrievalUnavailable,
        );
        timer.end({
          status: "insufficient_after_evidence_cleanup",
          droppedEvidenceCount: droppedEvidenceIds.length,
          droppedShortlistCount: droppedContactIds.length,
        });
        return persistInsufficientResponse({
          threadId: input.threadId,
          queryPlan: input.queryPlan,
          response: insufficient,
          reason: "ungrounded_raw_card_shortlist",
        });
      }
    }

    // Response safety net + disclosure are path-agnostic (planner or legacy).
    const enforced = prefilter.enforce(response);
    response = enforced.response;
    const prefilterDroppedShortlistContactIds = enforced.droppedContactIds;
    response = prefilter.disclose(response);
    // Enumeration completeness runs AFTER the code-sort so appended members land
    // at the end of additionalMatches (recall 1.0 by construction).
    response = prefilter.completeEnumeration(response);

    response = discloseChatRetrievalUnavailable(
      response,
      chatRetrievalUnavailable,
    );

    const mergedMetadata: Record<string, unknown> = {
      ...modelMetadata,
      rawCards: {
        cardCount: synthesisCards.length,
        evidenceCount: allowedEvidence.length,
        evidenceEnabled: includeEvidence,
        chatEvidenceCount: chatEvidence.length,
        chatRetrievalUnavailable,
        promptCacheKey,
        droppedEvidenceIds,
        droppedShortlistContactIds: droppedContactIds,
      },
      ...(scanMetadata ? { scan: scanMetadata } : {}),
      ...(prefilter.metadata ?? {}),
      ...(prefilterDroppedShortlistContactIds.length > 0
        ? { prefilterDroppedShortlistContactIds }
        : {}),
      ...(droppedEvidenceIds.length > 0 ? { droppedEvidenceIds } : {}),
    };

    const { id } = await createAdminAiMessage({
      threadId: input.threadId,
      role: "assistant",
      content: describeAssistantResponse(response),
      status: "complete",
      queryPlan: input.queryPlan,
      responseJson: response,
      modelMetadata: mergedMetadata,
    });

    if (includeEvidence && citations.length > 0) {
      await createAdminAiCitations({ messageId: id, citations });
    }
    timer.end({
      status: "complete",
      citationCount: citations.length,
      droppedEvidenceCount: droppedEvidenceIds.length,
    });

    return {
      status: "complete",
      assistantMessageId: id,
      queryPlan: input.queryPlan,
      response,
      citations,
      modelMetadata: mergedMetadata,
      error: null,
    };
  } catch (error) {
    adminAiDebugLog("raw-card-synthesis-failed", {
      scope: input.scope,
      error: error instanceof Error ? error.message : String(error),
    });
    const message =
      error instanceof Error ? error.message : "Admin AI analysis failed.";
    const assistantMessageId = await persistFailedAssistantMessage({
      threadId: input.threadId,
      content: message,
      queryPlan: input.queryPlan,
      modelMetadata: { source: "system", reason: "analysis_failed" },
    });
    throw Object.assign(
      error instanceof Error ? error : new Error(message),
      { assistantMessageId },
    );
  }
}

export async function runAdminAiAnalysis(input: {
  scope: AdminAiScope;
  question: string;
  threadId: string;
  contactId?: string;
}): Promise<RunAdminAiAnalysisResult> {
  const queryPlan = buildCardQueryPlan({
    scope: input.scope,
    question: input.question,
    contactId: input.contactId,
  });

  if (input.scope === "contact") {
    if (!input.contactId) {
      throw new Error("contactId is required when scope is 'contact'");
    }
    const records = await loadContactCardRecords({
      contactIds: [input.contactId],
    });
    return runCardSynthesis({
      scope: "contact",
      question: input.question,
      queryPlan,
      threadId: input.threadId,
      records,
    });
  }

  const records = await loadEligibleContactCardRecords();
  return runCardSynthesis({
    scope: "global",
    question: input.question,
    queryPlan,
    threadId: input.threadId,
    records,
  });
}
