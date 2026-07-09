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
  applyPlannedConstraints,
  extractHardConstraints,
  filterRecordsByHardConstraints,
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
import type { AdminAiProgressCallback } from "./progress";
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
  droppedProgramContactCount: number;
  constraints: AdminAiHardConstraints;
}): AdminAiResponse {
  const { budgetMin, tagCategory, otherTagCategories, program } = input.constraints;
  let response = input.response;

  if (program && input.droppedProgramContactCount > 0) {
    const label = contactCountLabel(input.droppedProgramContactCount);
    response = appendUncertainty(
      response,
      `${input.droppedProgramContactCount} ${label} excluded because they have no '${program}' application.`,
    );
  }

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
  options: {
    includeEvidence: boolean;
    // Reuse an existing registry so a second card batch (the rescue pool) shares
    // alias space with the confirmed cards — citation resolution spans both.
    evidenceAliases?: EvidenceAliasRegistry;
  },
): {
  cards: RenderedContactCard[];
  evidence: EvidenceItem[];
  evidenceAliases: EvidenceAliasRegistry;
} {
  const evidenceAliases = options.evidenceAliases ?? new EvidenceAliasRegistry();
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

// Code-driven disclosure injected into the reduce when the confirmed scan found
// only partial matches (near-miss tier).
const NEAR_MISS_ANALYSIS_NOTE =
  "A full chunked scan found NO contact fully matching the question; the supplied cards are the closest PARTIAL matches only. Do not shortlist anyone unless they genuinely meet the full bar of the question. Name the closest candidates and the specific aspect each one is missing in `uncertainty` or `additionalMatches`.";

// Code-driven disclosure injected into the reduce when contacts excluded by a
// deterministic field/budget filter were rescued because OTHER evidence suggests
// they may qualify. Admin makes the final call.
function buildRescueAnalysisNote(rescuedNames: string[]): string {
  const names = rescuedNames.join(", ");
  return `Contacts [${names}] did NOT satisfy the deterministic filter(s) via structured data, but a scan of their other evidence (notes, call logs, messages, essay answers) suggests they may qualify. Field-confirmed contacts are authoritative. Include rescued contacts only with explicit uncertainty stating that the structured field does not confirm them — the admin makes the final decision.`;
}

// Reduce-set cap for strength-graded map candidates (task 4, owner-approved
// 2026-07-08): strong evidence is NEVER trimmed, even past this cap; weak
// evidence fills the remaining capacity in corpus order and any overflow is
// counted and disclosed rather than silently dropped (see `assembleReduceSet`).
export const REDUCE_CANDIDATE_CAP = 60;

export type AssembleReduceSetInput = {
  // Ids the map scan graded "strong" — never trimmed, regardless of `cap`.
  strongIds: Set<string>;
  // Ids the map scan graded "weak" — fill the remaining capacity under `cap`,
  // in corpus order; any beyond that are trimmed (counted, never silently lost).
  weakIds: Set<string>;
  // Full corpus in the SAME order the cards were sent to the map (oldest-first),
  // so both tiers are appended in stable, deterministic order.
  corpusOrder: string[];
  cap?: number;
};

export type AssembleReduceSetResult = {
  // Corpus-ordered ids to send to the reduce: every strong id, then as many
  // weak ids (in corpus order) as fit under the cap.
  confirmedIds: string[];
  strongCount: number;
  // How many weak candidates the map flagged in total (before capping).
  weakFlaggedCount: number;
  // How many weak candidates actually made it into confirmedIds.
  weakIncludedCount: number;
  // weakFlaggedCount - weakIncludedCount — the disclosed, never-silent overflow.
  weakTrimmedCount: number;
};

/**
 * Pure assembly rule for the strength-graded map → reduce set. Kept separate
 * from the orchestrator's I/O so cap-boundary and ordering behavior can be
 * unit-tested directly, without mocking the whole pipeline.
 */
export function assembleReduceSet(
  input: AssembleReduceSetInput,
): AssembleReduceSetResult {
  const { strongIds, weakIds, corpusOrder, cap = REDUCE_CANDIDATE_CAP } = input;
  const strongOrdered: string[] = [];
  const weakOrdered: string[] = [];
  for (const id of corpusOrder) {
    if (strongIds.has(id)) strongOrdered.push(id);
    else if (weakIds.has(id)) weakOrdered.push(id);
  }
  const strongCount = strongOrdered.length;
  const weakFlaggedCount = weakOrdered.length;
  const remainingCapacity = Math.max(cap - strongCount, 0);
  const includedWeak = weakOrdered.slice(0, remainingCapacity);
  const weakIncludedCount = includedWeak.length;
  return {
    confirmedIds: [...strongOrdered, ...includedWeak],
    strongCount,
    weakFlaggedCount,
    weakIncludedCount,
    weakTrimmedCount: weakFlaggedCount - weakIncludedCount,
  };
}

// Code-driven disclosure injected into the reduce (composed with any near-miss/
// rescue note, exactly like `buildRescueAnalysisNote`) when the weak-tier cap
// trims candidates — a deterministic, always-true fact, never a judgment call.
function buildWeakCapAnalysisNote(trimmedCount: number): string {
  return `${trimmedCount} additional contacts showed weaker or partial evidence for this question and were not analyzed in depth — narrow the question to surface them.`;
}

/**
 * A prefilter outcome shared by both global-scope paths (constraint planner and
 * the legacy deterministic filters) so downstream synthesis, disclosure, the
 * response safety net, `structuredFilters`, and metadata are path-agnostic.
 */
type GlobalPrefilter = {
  records: ContactCardRecord[];
  // Records dropped by FIELD or BUDGET constraints (never by TAG — tag
  // membership is authoritative DB semantics other evidence cannot override).
  // Fed to the evidence rescue scan. Empty unless the planner path ran.
  rescuePool: ContactCardRecord[];
  structuredFilters: AdminAiStructuredFilter[];
  plan: PlannerOutput | null;
  droppedParts: string[];
  plannerUnavailable: boolean;
  disclose: (response: AdminAiResponse) => AdminAiResponse;
  // Guarantees enumeration completeness: appends any prefiltered member missing
  // from the answer. Identity (appended 0) except on a pure-enumeration tag path.
  completeEnumeration: (response: AdminAiResponse) => {
    response: AdminAiResponse;
    appended: number;
  };
  metadata: Record<string, unknown> | null;
};

function nullPrefilter(records: ContactCardRecord[]): GlobalPrefilter {
  return {
    records,
    rescuePool: [],
    structuredFilters: [],
    plan: null,
    droppedParts: [],
    plannerUnavailable: false,
    disclose: (response) => response,
    completeEnumeration: (response) => ({ response, appended: 0 }),
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
  if (plan.programConstraint) {
    filters.push({ field: "program", op: "eq", value: plan.programConstraint });
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
  if (constraints.program) {
    filters.push({ field: "program", op: "eq", value: constraints.program });
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

function describeFieldConstraintValue(value: string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : value;
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
  if (plan.programConstraint && applied.droppedByProgram.length > 0) {
    const label = contactCountLabel(applied.droppedByProgram.length);
    result = appendUncertainty(
      result,
      `${applied.droppedByProgram.length} ${label} excluded because they have no '${plan.programConstraint}' application.`,
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
      .map(
        (fieldConstraint) =>
          `${fieldConstraint.field} ${fieldConstraint.op} '${describeFieldConstraintValue(fieldConstraint.value)}'`,
      )
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

// For a pure-enumeration question grounded on a deterministic constraint (a tag
// cohort, a program cohort, OR one or more catalog field filters), the
// prefiltered records ARE the answer. Append any member the reduce tier
// dropped to the END of additionalMatches so recall is 1.0 by construction;
// ranking of what's already there stays model territory.
function buildEnumerationCompleter(
  records: ContactCardRecord[],
  plan: PlannerOutput,
): (response: AdminAiResponse) => { response: AdminAiResponse; appended: number } {
  const tagConstraint = plan.tagConstraint;
  const programConstraint = plan.programConstraint;
  const hasFieldConstraint = plan.fieldConstraints.length > 0;
  if (
    !plan.enumerationOnly ||
    (!tagConstraint && !programConstraint && !hasFieldConstraint)
  ) {
    return (response) => ({ response, appended: 0 });
  }
  const wanted =
    tagConstraint && tagConstraint.includeStatuses.length > 0
      ? new Set(tagConstraint.includeStatuses.map((status) => status.toLowerCase()))
      : null;
  const fieldReason = hasFieldConstraint
    ? `Matches ${plan.fieldConstraints
        .map(
          (constraint) =>
            `${constraint.field} ${constraint.op} '${describeFieldConstraintValue(constraint.value)}'`,
        )
        .join("; ")}`
    : "";
  const rosters = records.map((record) => {
    const reasons: string[] = [];
    if (tagConstraint) {
      const matches = (record.contactTags ?? []).filter((tag) => {
        if (tag.categoryName?.toLowerCase() !== tagConstraint.category.toLowerCase()) {
          return false;
        }
        const name = (tag.tagName ?? "").toLowerCase();
        return wanted ? wanted.has(name) : name !== "declined";
      });
      reasons.push(
        `Carries '${tagConstraint.category}: ${matches.map((tag) => tag.tagName).join(", ")}' tag`,
      );
    }
    if (programConstraint) {
      reasons.push(`Has a '${programConstraint}' application`);
    }
    if (fieldReason) reasons.push(fieldReason);
    return {
      contactId: record.contact.id,
      contactName: record.contact.name ?? "",
      reason: reasons.join("; "),
    };
  });

  return (response) => {
    const present = new Set<string>();
    for (const entry of response.shortlist ?? []) present.add(entry.contactId);
    for (const match of response.additionalMatches ?? []) present.add(match.contactId);
    const missing = rosters.filter((entry) => !present.has(entry.contactId));
    if (missing.length === 0) return { response, appended: 0 };
    adminAiDebugLog("enumeration-completeness-appended", { count: missing.length });
    const appended: AdminAiAdditionalMatch[] = missing.map((entry) => ({
      contactId: entry.contactId,
      contactName: entry.contactName,
      reason: entry.reason,
      matchStrength: 1,
    }));
    return {
      response: {
        ...response,
        additionalMatches: [...(response.additionalMatches ?? []), ...appended],
      },
      appended: appended.length,
    };
  };
}

function buildPlannerPrefilter(
  records: ContactCardRecord[],
  run: PlannerRun,
): GlobalPrefilter {
  const applied = applyPlannedConstraints(records, run.plan);
  // Rescue pool = contacts dropped by FIELD or BUDGET (not TAG, not PROGRAM).
  // Sequential filtering means these two lists are exactly the non-tag,
  // non-program drops. Program drops are definitive (not-having-applied is
  // never a "maybe") and must NEVER be rescued.
  const rescueIds = new Set([...applied.droppedByField, ...applied.droppedByBudget]);
  const rescuePool = records.filter((record) => rescueIds.has(record.contact.id));
  return {
    records: applied.records,
    rescuePool,
    structuredFilters: planToStructuredFilters(run.plan),
    plan: run.plan,
    droppedParts: run.droppedParts,
    plannerUnavailable: false,
    disclose: (response) =>
      disclosePlannerPrefilter(response, run.plan, applied, run.droppedParts),
    completeEnumeration: buildEnumerationCompleter(applied.records, run.plan),
    metadata: {
      planner: {
        plan: run.plan,
        droppedParts: run.droppedParts,
        droppedByTag: applied.droppedByTag.length,
        droppedByProgram: applied.droppedByProgram.length,
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
  const hasConstraints =
    filter.constraints.budgetMin !== undefined ||
    filter.constraints.tagCategory !== undefined ||
    filter.constraints.program !== undefined;
  return {
    records: filter.records,
    // No rescue on the legacy fallback path: it cannot separate budget-only
    // drops from tag drops, and rescue is a planner-path capability. Program
    // drops would never be rescued anyway (definitive, tag-class semantics).
    rescuePool: [],
    structuredFilters: legacyToStructuredFilters(filter.constraints),
    plan: null,
    droppedParts: [],
    plannerUnavailable: true,
    disclose: (response) => {
      // We are on the legacy path because the planner was unavailable — disclose
      // the degraded mode (fail loud, one sanctioned fallback).
      let result = appendUncertainty(response, PLANNER_UNAVAILABLE_NOTE);
      if (hasConstraints) {
        result = discloseHardConstraintPrefilter({
          response: result,
          droppedContactCount: filter.droppedContactIds.length,
          droppedDeclinedContactCount: filter.droppedDeclinedContactIds.length,
          droppedProgramContactCount: filter.droppedProgramContactIds.length,
          constraints: filter.constraints,
        });
      }
      return result;
    },
    completeEnumeration: (response) => ({ response, appended: 0 }),
    metadata: {
      plannerUnavailable: true,
      ...(hasConstraints
        ? {
            hardConstraints: {
              ...filter.constraints,
              prefilteredContactCount: filter.droppedContactIds.length,
              droppedContactIds: filter.droppedContactIds,
              droppedDeclinedContactIds: filter.droppedDeclinedContactIds,
              droppedProgramContactIds: filter.droppedProgramContactIds,
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

const PIPELINE_USAGE_KEYS = [
  "prompt_cache_hit_tokens",
  "prompt_cache_miss_tokens",
  "completion_tokens",
] as const;

type PipelineUsage = Record<(typeof PIPELINE_USAGE_KEYS)[number], number>;

function accumulatePipelineUsage(agg: PipelineUsage, usage: unknown): void {
  if (!usage || typeof usage !== "object") return;
  const record = usage as Record<string, unknown>;
  for (const key of PIPELINE_USAGE_KEYS) {
    const value = record[key];
    if (typeof value === "number") agg[key] += value;
  }
}

/**
 * ID-integrity repair. Models garble/fabricate 36-char UUIDs when enumerating
 * many contacts, but copy NAMES reliably. For every entry whose contactId is not
 * in the sent corpus, repair it via a UNIQUE case-insensitive name match against
 * the cards; if unresolvable, drop it (never fail the whole answer) and disclose.
 */
function repairContactIds(
  response: AdminAiResponse,
  cards: RenderedContactCard[],
): { response: AdminAiResponse; idRepairs: number; idDrops: number } {
  const corpusIds = new Set(cards.map((card) => card.contactId));
  const nameCounts = new Map<string, number>();
  for (const card of cards) {
    const key = card.contactName.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const uniqueNameToId = new Map<string, string>();
  for (const card of cards) {
    const key = card.contactName.trim().toLowerCase();
    if (nameCounts.get(key) === 1) uniqueNameToId.set(key, card.contactId);
  }

  let idRepairs = 0;
  let idDrops = 0;
  function repair<T extends { contactId: string; contactName: string }>(
    entry: T,
  ): T | null {
    if (corpusIds.has(entry.contactId)) return entry;
    const resolved = uniqueNameToId.get(entry.contactName.trim().toLowerCase());
    if (resolved) {
      idRepairs += 1;
      return { ...entry, contactId: resolved };
    }
    idDrops += 1;
    console.warn(
      "[admin-ai] dropping entry with unresolvable contact reference",
      { contactId: entry.contactId, contactName: entry.contactName },
    );
    return null;
  }

  const shortlist = response.shortlist
    ?.map(repair)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const additionalMatches = response.additionalMatches
    ?.map(repair)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  let repaired: AdminAiResponse = { ...response, shortlist, additionalMatches };
  if (idDrops > 0) {
    const note = `${idDrops} ${idDrops === 1 ? "entry" : "entries"} dropped: unresolvable contact references.`;
    repaired = {
      ...repaired,
      uncertainty: repaired.uncertainty.includes(note)
        ? repaired.uncertainty
        : [...repaired.uncertainty, note],
    };
  }
  return { response: repaired, idRepairs, idDrops };
}

export type GlobalSynthesisDiagnostics = {
  plan: PlannerOutput | null;
  droppedParts: string[];
  plannerUnavailable: boolean;
  prefilteredCount: number;
  mapUsed: boolean;
  candidateCount: number;
  // The map-union candidate ids fed to the reduce (forensics: whether a contact
  // was dropped by the map or the reduce). JSON-only; kept off the scorecard.
  candidateIds: string[];
  // Strength-graded reduce assembly (task 4): how many strong/weak candidates
  // the map flagged, and how many weak ones actually made it past the
  // REDUCE_CANDIDATE_CAP. strongCount is 0 when the map did not run (mapUsed
  // false) or the small-corpus path was taken. weakFlaggedCount > weakIncludedCount
  // means the cap trimmed candidates — always disclosed via `analysisNote`.
  strongCount: number;
  weakFlaggedCount: number;
  weakIncludedCount: number;
  // Near-miss tier (double-gated): how many partial-match ids the map surfaced,
  // and whether the reduce actually ran over them (full union was empty).
  nearMissCandidateCount: number;
  nearMissModeUsed: boolean;
  // Evidence rescue scan (field/budget-dropped contacts re-scanned for other
  // evidence): whether it ran, how many it rescued, and which ids.
  rescueScanUsed: boolean;
  rescuedCandidateCount: number;
  rescuedIds: string[];
  appendedByEnumeration: number;
  idRepairs: number;
  idDrops: number;
  // The code-composed near-miss/rescue/weak-cap disclosure sent to the reduce as
  // guidance (see NEAR_MISS_ANALYSIS_NOTE / buildRescueAnalysisNote /
  // buildWeakCapAnalysisNote). Undefined when no disclosure applied.
  analysisNote: string | undefined;
  usage: PipelineUsage;
};

export type GlobalSynthesisOutput = {
  status: "complete" | "insufficient";
  response: AdminAiResponse;
  citations: AdminAiCitationDraft[];
  modelMetadata: Record<string, unknown>;
  reason: string | null;
  diagnostics: GlobalSynthesisDiagnostics;
};

/**
 * The single global-scope LLM pipeline, shared verbatim by `runCardSynthesis`
 * (which adds persistence) and the eval harness (which scores) — no drift.
 * planner/legacy prefilter → render → map-skip/scan → generate → parse →
 * id-integrity repair → matchStrength sort/cap → enumeration completeness.
 * Assumes the provider is configured; throws on hard errors (caller persists a
 * failed message).
 */
export async function runGlobalSynthesis(input: {
  provider: AdminAiProvider;
  records: ContactCardRecord[];
  question: string;
  queryPlan: AdminAiQueryPlan;
  includeEvidence: boolean;
  /**
   * Optional stage-progress hook (planning → scanning chunk i/N → analyzing).
   * MUST be fire-and-forget on the caller's side: nothing here awaits it and
   * pipeline semantics are identical with or without it (eval passes none).
   */
  onProgress?: AdminAiProgressCallback;
}): Promise<GlobalSynthesisOutput> {
  const { provider, records, question, queryPlan, includeEvidence, onProgress } =
    input;
  onProgress?.({ stage: "planning" });
  const usage: PipelineUsage = {
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 0,
    completion_tokens: 0,
  };

  const prefilter = await computeGlobalPrefilter({
    provider,
    scope: "global",
    records,
    question,
  });
  queryPlan.structuredFilters = prefilter.structuredFilters;
  const prefilteredCount = prefilter.records.length;
  const diag = (extra: Partial<GlobalSynthesisDiagnostics> = {}): GlobalSynthesisDiagnostics => ({
    plan: prefilter.plan,
    droppedParts: prefilter.droppedParts,
    plannerUnavailable: prefilter.plannerUnavailable,
    prefilteredCount,
    mapUsed: false,
    candidateCount: 0,
    candidateIds: [],
    strongCount: 0,
    weakFlaggedCount: 0,
    weakIncludedCount: 0,
    nearMissCandidateCount: 0,
    nearMissModeUsed: false,
    rescueScanUsed: false,
    rescuedCandidateCount: 0,
    rescuedIds: [],
    appendedByEnumeration: 0,
    idRepairs: 0,
    idDrops: 0,
    analysisNote: undefined,
    usage,
    ...extra,
  });

  const { cards, evidence, evidenceAliases } = renderRecords(prefilter.records, {
    includeEvidence,
  });

  // Evidence rescue pool: contacts a FIELD/BUDGET filter excluded, re-scanned for
  // OTHER evidence they may qualify on. Gated to map_reduce with a
  // completeJson-capable provider and a non-empty pool (same guard as the main
  // map). Rendered with the shared alias registry so rescued citations resolve.
  const mapReduceMode = getAdminAiScanMode() === "map_reduce";
  const rescueEligible =
    mapReduceMode &&
    Boolean(provider.completeJson) &&
    prefilter.rescuePool.length > 0;
  const rescue = rescueEligible
    ? renderRecords(prefilter.rescuePool, { includeEvidence, evidenceAliases })
    : null;
  const rescueCards = rescue?.cards ?? [];

  let chatEvidence: EvidenceItem[] = [];
  let chatRetrievalUnavailable = false;
  if (includeEvidence) {
    try {
      chatEvidence = await retrieveConversationEvidence({
        question,
        contactId: null,
        limit: 40,
      });
    } catch (error) {
      chatRetrievalUnavailable = true;
      const message = error instanceof Error ? error.message : String(error);
      adminAiDebugLog("conversation-retrieval-unavailable", { scope: "global", error: message });
      console.warn("[admin-ai] conversation evidence retrieval unavailable", { error: message });
    }
  }
  const allowedEvidence = includeEvidence
    ? [...evidence, ...(rescue?.evidence ?? []), ...chatEvidence]
    : [];

  adminAiDebugLog("raw-cards-assembled", {
    scope: "global",
    cardCount: cards.length,
    evidenceCount: allowedEvidence.length,
    evidenceEnabled: includeEvidence,
    structuredFilters: prefilter.structuredFilters,
    prefilterDroppedCount: records.length - prefilter.records.length,
    chatEvidenceCount: chatEvidence.length,
    chatRetrievalUnavailable,
    promptCacheKey: ADMIN_AI_GLOBAL_PROMPT_CACHE_KEY,
  });

  if (
    (cards.length === 0 && rescueCards.length === 0) ||
    (includeEvidence && allowedEvidence.length === 0)
  ) {
    const response = discloseChatRetrievalUnavailable(
      buildInsufficientEvidenceResponse("global", {
        extra: prefilter.structuredFilters.length > 0
          ? "No contacts matched the deterministic hard filters for this question."
          : "No eligible contacts with raw application, note, tag, or conversation evidence are available.",
      }),
      chatRetrievalUnavailable,
    );
    return {
      status: "insufficient",
      response,
      citations: [],
      modelMetadata: { source: "system", reason: "no_raw_card_evidence" },
      reason: "no_raw_card_evidence",
      diagnostics: diag(),
    };
  }

  const timer = startAdminAiDebugTimer("raw-card-synthesis", {
    scope: "global",
    cardCount: cards.length,
    evidenceCount: allowedEvidence.length,
  });

  let synthesisCards = cards;
  let synthesisChatEvidence = chatEvidence;
  let scanMetadata: MapScanResult["scanMetadata"] | null = null;
  let mapUsed = false;
  let strongCount = 0;
  let weakFlaggedCount = 0;
  let weakIncludedCount = 0;
  let nearMissCandidateCount = 0;
  let nearMissModeUsed = false;
  let rescueScanUsed = false;
  let rescuedIds: string[] = [];
  let analysisNote: string | undefined;
  if (mapReduceMode) {
    if (!provider.completeJson) {
      throw new Error(
        "map_reduce scan mode currently requires ADMIN_AI_PROVIDER=deepseek",
      );
    }
    const runMain = cards.length > MAP_CHUNK_SIZE;
    const runRescue = rescueCards.length > 0;

    if (!runMain && !runRescue) {
      adminAiDebugLog("map-skipped-small-corpus", { cardCount: cards.length });
    } else {
      // Main scan (confirmed cards) and rescue scan (field/budget-dropped cards)
      // run CONCURRENTLY so latency stays flat. The main scan is skipped when the
      // confirmed corpus fits in one chunk; the rescue scan runs whenever the
      // pool is non-empty.
      // Progress: one shared counter across both scans (their chunks complete
      // interleaved), reported per successful chunk.
      const chunkTotal =
        (runMain ? Math.ceil(cards.length / MAP_CHUNK_SIZE) : 0) +
        (runRescue ? Math.ceil(rescueCards.length / MAP_CHUNK_SIZE) : 0);
      // Every contact reaching the scan — surfaced in the UI so "N flagged"
      // can never read as "only N examined".
      const scanContactTotal = cards.length + rescueCards.length;
      let chunksDone = 0;
      let candidatesSoFar = 0;
      const onChunkComplete = onProgress
        ? (info: { chunkIndex: number; candidateCount: number }) => {
            chunksDone += 1;
            candidatesSoFar += info.candidateCount;
            onProgress({
              stage: "scanning",
              chunksDone,
              chunkTotal,
              contactTotal: scanContactTotal,
              candidateCount: candidatesSoFar,
            });
          }
        : undefined;
      onProgress?.({
        stage: "scanning",
        chunksDone: 0,
        chunkTotal,
        contactTotal: scanContactTotal,
      });
      const [mainResult, rescueResult] = await Promise.all([
        runMain
          ? runMapScan({ provider, cards, question, onChunkComplete })
          : Promise.resolve(null),
        runRescue
          ? runMapScan({ provider, cards: rescueCards, question, onChunkComplete })
          : Promise.resolve(null),
      ]);

      if (mainResult) {
        mapUsed = true;
        scanMetadata = mainResult.scanMetadata;
        nearMissCandidateCount = mainResult.nearMissIds.size;
        accumulatePipelineUsage(usage, mainResult.scanMetadata.usage);
      }
      if (rescueResult) {
        rescueScanUsed = true;
        accumulatePipelineUsage(usage, rescueResult.scanMetadata.usage);
      }

      // Confirmed candidate cards.
      let confirmedCards: RenderedContactCard[];
      if (!mainResult) {
        // Small confirmed corpus: every confirmed card goes to the reduce.
        confirmedCards = cards;
      } else if (mainResult.candidateIds.size > 0) {
        // Strength-graded assembly (task 4): ALL strong candidates always reach
        // the reduce; weak candidates fill the remaining REDUCE_CANDIDATE_CAP
        // capacity in corpus order. Trimmed weaks are counted and disclosed via
        // `analysisNote`, never silently dropped.
        const corpusOrder = cards.map((card) => card.contactId);
        const assembled = assembleReduceSet({
          strongIds: mainResult.strongIds,
          weakIds: mainResult.weakIds,
          corpusOrder,
        });
        strongCount = assembled.strongCount;
        weakFlaggedCount = assembled.weakFlaggedCount;
        weakIncludedCount = assembled.weakIncludedCount;
        const confirmedIdSet = new Set(assembled.confirmedIds);
        confirmedCards = cards.filter((card) => confirmedIdSet.has(card.contactId));
        if (assembled.weakTrimmedCount > 0) {
          const weakCapNote = buildWeakCapAnalysisNote(assembled.weakTrimmedCount);
          analysisNote = analysisNote ? `${analysisNote}\n\n${weakCapNote}` : weakCapNote;
          adminAiDebugLog("map-weak-cap-trim", {
            strongCount,
            weakFlaggedCount,
            weakIncludedCount,
            weakTrimmedCount: assembled.weakTrimmedCount,
          });
        }
      } else if (mainResult.nearMissIds.size > 0) {
        // Near-miss tier: no full match among confirmed cards, only partials.
        nearMissModeUsed = true;
        const { nearMissIds } = mainResult;
        confirmedCards = cards.filter((card) => nearMissIds.has(card.contactId));
        analysisNote = NEAR_MISS_ANALYSIS_NOTE;
      } else {
        confirmedCards = [];
      }

      // Rescued cards: full matches only (rescue near-misses are ignored — the
      // rescue path is already a second chance).
      const rescuedSet = rescueResult
        ? rescueResult.candidateIds
        : new Set<string>();
      const rescuedCards = rescueCards.filter((card) =>
        rescuedSet.has(card.contactId),
      );
      rescuedIds = rescuedCards.map((card) => card.contactId);

      if (confirmedCards.length === 0 && rescuedCards.length === 0) {
        const insufficient = discloseChatRetrievalUnavailable(
          buildInsufficientEvidenceResponse("global", {
            extra: `A full chunked scan of all ${cards.length} eligible contacts found no candidates for this question.`,
          }),
          chatRetrievalUnavailable,
        );
        return {
          status: "insufficient",
          response: insufficient,
          citations: [],
          modelMetadata: { source: "system", reason: "map_scan_no_candidates" },
          reason: "map_scan_no_candidates",
          diagnostics: diag({
            mapUsed,
            nearMissCandidateCount: 0,
            rescueScanUsed,
          }),
        };
      }

      // Rescued cards MERGE AFTER confirmed cards; both are in the sent corpus so
      // the id-repair safety net keeps rescued response entries.
      synthesisCards = [...confirmedCards, ...rescuedCards];
      const synthIds = new Set(synthesisCards.map((card) => card.contactId));
      synthesisChatEvidence = chatEvidence.filter((item) =>
        synthIds.has(item.contactId),
      );

      if (rescuedCards.length > 0) {
        const rescueNote = buildRescueAnalysisNote(
          rescuedCards.map((card) => card.contactName || card.contactId),
        );
        // Compose with the near-miss note if both apply — clearly separated.
        analysisNote = analysisNote ? `${analysisNote}\n\n${rescueNote}` : rescueNote;
        adminAiDebugLog("evidence-rescue", {
          poolSize: prefilter.rescuePool.length,
          rescued: rescuedCards.length,
        });
      }
    }
  }

  const promptCacheKey = mapReduceMode ? null : ADMIN_AI_GLOBAL_PROMPT_CACHE_KEY;
  const aliasedChatEvidence = synthesisChatEvidence.map((item) => ({
    ...item,
    evidenceId: evidenceAliases.register(item.evidenceId),
  }));
  onProgress?.({
    stage: "analyzing",
    candidateCount: synthesisCards.length,
    contactTotal: cards.length + rescueCards.length,
  });
  const { response: rawResponse, modelMetadata } = await provider.generate({
    question,
    scope: "global",
    queryPlan,
    cards: synthesisCards,
    ...(analysisNote ? { analysisNote } : {}),
    evidence: includeEvidence ? aliasedChatEvidence : [],
    includeEvidence,
    promptCacheKey,
  });
  accumulatePipelineUsage(usage, modelMetadata.usage);

  let response = enforceShortlistRanking(
    translateCitationAliases(adminAiResponseSchema.parse(rawResponse), evidenceAliases),
  );
  const repaired = repairContactIds(response, synthesisCards);
  response = repaired.response;

  let citations: AdminAiCitationDraft[] = [];
  let droppedEvidenceIds: string[] = [];
  if (includeEvidence) {
    const resolved = resolveCitationDrafts(response, allowedEvidence);
    citations = resolved.drafts;
    droppedEvidenceIds = resolved.droppedEvidenceIds;
    response = applyDroppedEvidenceIdsToResponse(response, new Set(droppedEvidenceIds));
  } else {
    response = stripResponseCitations(response);
  }

  let droppedContactIds: string[] = [];
  if (includeEvidence) {
    const cleaned = pruneUncitedGlobalShortlistEntries({ response, droppedEvidenceIds });
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
      return {
        status: "insufficient",
        response: insufficient,
        citations: [],
        modelMetadata: { source: "system", reason: "ungrounded_raw_card_shortlist" },
        reason: "ungrounded_raw_card_shortlist",
        diagnostics: diag({
          mapUsed,
          candidateCount: synthesisCards.length,
          candidateIds: synthesisCards.map((card) => card.contactId),
          strongCount,
          weakFlaggedCount,
          weakIncludedCount,
          nearMissCandidateCount,
          nearMissModeUsed,
          rescueScanUsed,
          rescuedCandidateCount: rescuedIds.length,
          rescuedIds,
          idRepairs: repaired.idRepairs,
          idDrops: repaired.idDrops,
          analysisNote,
        }),
      };
    }
  }

  response = prefilter.disclose(response);
  const enumResult = prefilter.completeEnumeration(response);
  response = enumResult.response;
  response = discloseChatRetrievalUnavailable(response, chatRetrievalUnavailable);

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
    ...(strongCount > 0 || weakFlaggedCount > 0
      ? {
          weakCap: {
            cap: REDUCE_CANDIDATE_CAP,
            strongCount,
            weakFlaggedCount,
            weakIncludedCount,
          },
        }
      : {}),
    ...(nearMissModeUsed
      ? { nearMiss: { candidateCount: nearMissCandidateCount, modeUsed: true } }
      : {}),
    ...(rescueScanUsed
      ? {
          rescue: {
            poolSize: prefilter.rescuePool.length,
            candidateCount: rescuedIds.length,
          },
        }
      : {}),
    ...(prefilter.metadata ?? {}),
    idIntegrity: { repairs: repaired.idRepairs, drops: repaired.idDrops },
    ...(droppedEvidenceIds.length > 0 ? { droppedEvidenceIds } : {}),
  };
  timer.end({
    status: "complete",
    citationCount: citations.length,
    droppedEvidenceCount: droppedEvidenceIds.length,
  });

  return {
    status: "complete",
    response,
    citations,
    modelMetadata: mergedMetadata,
    reason: null,
    diagnostics: diag({
      mapUsed,
      candidateCount: synthesisCards.length,
      candidateIds: synthesisCards.map((card) => card.contactId),
      strongCount,
      weakFlaggedCount,
      weakIncludedCount,
      nearMissCandidateCount,
      nearMissModeUsed,
      rescueScanUsed,
      rescuedCandidateCount: rescuedIds.length,
      rescuedIds,
      appendedByEnumeration: enumResult.appended,
      idRepairs: repaired.idRepairs,
      idDrops: repaired.idDrops,
      analysisNote,
    }),
  };
}

async function persistSynthesisFailure(
  input: { scope: AdminAiScope; threadId: string; queryPlan: AdminAiQueryPlan },
  error: unknown,
): Promise<never> {
  adminAiDebugLog("raw-card-synthesis-failed", {
    scope: input.scope,
    error: error instanceof Error ? error.message : String(error),
  });
  const message = error instanceof Error ? error.message : "Admin AI analysis failed.";
  const assistantMessageId = await persistFailedAssistantMessage({
    threadId: input.threadId,
    content: message,
    queryPlan: input.queryPlan,
    modelMetadata: { source: "system", reason: "analysis_failed" },
  });
  throw Object.assign(error instanceof Error ? error : new Error(message), {
    assistantMessageId,
  });
}

async function runCardSynthesis(input: {
  scope: AdminAiScope;
  question: string;
  queryPlan: AdminAiQueryPlan;
  threadId: string;
  records: ContactCardRecord[];
  onProgress?: AdminAiProgressCallback;
}): Promise<RunAdminAiAnalysisResult> {
  const includeEvidence = isAdminAiEvidenceEnabled();
  const provider = getAdminAiProvider();
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

  if (input.scope === "global") {
    try {
      const result = await runGlobalSynthesis({
        provider,
        records: input.records,
        question: input.question,
        queryPlan: input.queryPlan,
        includeEvidence,
        onProgress: input.onProgress,
      });
      if (result.status === "insufficient") {
        return persistInsufficientResponse({
          threadId: input.threadId,
          queryPlan: input.queryPlan,
          response: result.response,
          reason: result.reason ?? "insufficient",
        });
      }
      const { id } = await createAdminAiMessage({
        threadId: input.threadId,
        role: "assistant",
        content: describeAssistantResponse(result.response),
        status: "complete",
        queryPlan: input.queryPlan,
        responseJson: result.response,
        modelMetadata: result.modelMetadata,
      });
      if (result.citations.length > 0) {
        await createAdminAiCitations({ messageId: id, citations: result.citations });
      }
      return {
        status: "complete",
        assistantMessageId: id,
        queryPlan: input.queryPlan,
        response: result.response,
        citations: result.citations,
        modelMetadata: result.modelMetadata,
        error: null,
      };
    } catch (error) {
      return persistSynthesisFailure(
        { scope: "global", threadId: input.threadId, queryPlan: input.queryPlan },
        error,
      );
    }
  }

  // Contact scope: single card, contact assessment; no prefilter/map/enumeration.
  const { cards, evidence, evidenceAliases } = renderRecords(input.records, {
    includeEvidence,
  });

  let chatEvidence: EvidenceItem[] = [];
  let chatRetrievalUnavailable = false;
  if (includeEvidence) {
    try {
      chatEvidence = await retrieveConversationEvidence({
        question: input.question,
        contactId: input.queryPlan.contactId ?? null,
        limit: 40,
      });
    } catch (error) {
      chatRetrievalUnavailable = true;
      const message = error instanceof Error ? error.message : String(error);
      adminAiDebugLog("conversation-retrieval-unavailable", {
        scope: "contact",
        contactId: input.queryPlan.contactId ?? null,
        error: message,
      });
      console.warn("[admin-ai] conversation evidence retrieval unavailable", {
        error: message,
      });
    }
  }
  const allowedEvidence = includeEvidence ? [...evidence, ...chatEvidence] : [];

  adminAiDebugLog("raw-cards-assembled", {
    scope: "contact",
    cardCount: cards.length,
    evidenceCount: allowedEvidence.length,
    evidenceEnabled: includeEvidence,
    chatEvidenceCount: chatEvidence.length,
    chatRetrievalUnavailable,
  });

  if (cards.length === 0 || (includeEvidence && allowedEvidence.length === 0)) {
    const response = discloseChatRetrievalUnavailable(
      buildInsufficientEvidenceResponse("contact", {
        extra:
          "No raw application, note, tag, or conversation evidence is available for this contact.",
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
    const timer = startAdminAiDebugTimer("raw-card-synthesis", {
      scope: "contact",
      cardCount: cards.length,
      evidenceCount: allowedEvidence.length,
    });
    const aliasedChatEvidence = chatEvidence.map((item) => ({
      ...item,
      evidenceId: evidenceAliases.register(item.evidenceId),
    }));
    const { response: rawResponse, modelMetadata } = await provider.generate({
      question: input.question,
      scope: "contact",
      queryPlan: input.queryPlan,
      cards,
      evidence: includeEvidence ? aliasedChatEvidence : [],
      includeEvidence,
      promptCacheKey: null,
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

    response = discloseChatRetrievalUnavailable(response, chatRetrievalUnavailable);

    const mergedMetadata: Record<string, unknown> = {
      ...modelMetadata,
      rawCards: {
        cardCount: cards.length,
        evidenceCount: allowedEvidence.length,
        evidenceEnabled: includeEvidence,
        chatEvidenceCount: chatEvidence.length,
        chatRetrievalUnavailable,
        promptCacheKey: null,
        droppedEvidenceIds,
        droppedShortlistContactIds: [],
      },
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
    return persistSynthesisFailure(
      { scope: "contact", threadId: input.threadId, queryPlan: input.queryPlan },
      error,
    );
  }
}

export async function runAdminAiAnalysis(input: {
  scope: AdminAiScope;
  question: string;
  threadId: string;
  contactId?: string;
  /** Stage-progress hook; only the global (map-reduce) path reports stages. */
  onProgress?: AdminAiProgressCallback;
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
    onProgress: input.onProgress,
  });
}
