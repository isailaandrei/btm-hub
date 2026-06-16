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
  extractHardConstraints,
  filterRecordsByHardConstraints,
} from "./hard-constraints";
import { getAdminAiProvider } from "./provider";
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
  AdminAiCitationDraft,
  AdminAiQueryPlan,
  AdminAiResponse,
  AdminAiScope,
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
  return { uncertainty };
}

function discloseChatRetrievalUnavailable(
  response: AdminAiResponse,
  unavailable: boolean,
): AdminAiResponse {
  return unavailable
    ? appendUncertainty(response, CHAT_RETRIEVAL_UNAVAILABLE_NOTE)
    : response;
}

function discloseHardConstraintPrefilter(input: {
  response: AdminAiResponse;
  droppedContactCount: number;
  budgetMin?: number;
}): AdminAiResponse {
  if (input.droppedContactCount === 0) return input.response;
  const budgetText =
    input.budgetMin === undefined
      ? "the deterministic hard filters"
      : `the deterministic budget filter (${formatMoney(input.budgetMin)} minimum)`;
  const contactLabel =
    input.droppedContactCount === 1 ? "contact was" : "contacts were";
  return appendUncertainty(
    input.response,
    `${input.droppedContactCount} ${contactLabel} excluded by ${budgetText} before synthesis because the available CRM data did not satisfy the user's hard constraint.`,
  );
}

export function describeAssistantResponse(response: AdminAiResponse): string {
  if (response.shortlist && response.shortlist.length > 0) {
    const names = response.shortlist.map((entry) => entry.contactName);
    const preview = names.slice(0, 3).join(", ");
    const tail = names.length > 3 ? `, +${names.length - 3} more` : "";
    const label =
      names.length === 1 ? "Shortlisted 1 contact" : `Shortlisted ${names.length} contacts`;
    return `${label}: ${preview}${tail}.`;
  }
  if (response.contactAssessment) return "Contact assessment returned.";
  if (response.uncertainty.length > 0) return response.uncertainty[0]!;
  return "Admin AI response.";
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
    requestedLimit: input.scope === "contact" ? 1 : 25,
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

async function runCardSynthesis(input: {
  scope: AdminAiScope;
  question: string;
  queryPlan: AdminAiQueryPlan;
  threadId: string;
  records: ContactCardRecord[];
}): Promise<RunAdminAiAnalysisResult> {
  const includeEvidence = isAdminAiEvidenceEnabled();
  const hardConstraintFilter =
    input.scope === "global"
      ? filterRecordsByHardConstraints(
          input.records,
          extractHardConstraints(input.question),
        )
      : {
          constraints: {},
          records: input.records,
          droppedContactIds: [],
        };
  const hasHardConstraints =
    hardConstraintFilter.constraints.budgetMin !== undefined;
  const allowedHardConstraintContactIds = new Set(
    hardConstraintFilter.records.map((record) => record.contact.id),
  );
  const { cards, evidence, evidenceAliases } = renderRecords(hardConstraintFilter.records, {
    includeEvidence,
  });
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

  adminAiDebugLog("raw-cards-assembled", {
    scope: input.scope,
    cardCount: cards.length,
    evidenceCount: allowedEvidence.length,
    evidenceEnabled: includeEvidence,
    hardConstraints: hardConstraintFilter.constraints,
    hardConstraintDroppedCount: hardConstraintFilter.droppedContactIds.length,
    chatEvidenceCount: chatEvidence.length,
    chatRetrievalUnavailable,
    promptCacheKey: input.scope === "global" ? ADMIN_AI_GLOBAL_PROMPT_CACHE_KEY : null,
  });

  if (cards.length === 0 || (includeEvidence && allowedEvidence.length === 0)) {
    const response = discloseChatRetrievalUnavailable(
      buildInsufficientEvidenceResponse(input.scope, {
        extra:
          hasHardConstraints
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
    const timer = startAdminAiDebugTimer("raw-card-synthesis", {
      scope: input.scope,
      cardCount: cards.length,
      evidenceCount: allowedEvidence.length,
    });
    const promptCacheKey =
      input.scope === "global" ? ADMIN_AI_GLOBAL_PROMPT_CACHE_KEY : null;
    const aliasedChatEvidence = chatEvidence.map((item) => ({
      ...item,
      evidenceId: evidenceAliases.register(item.evidenceId),
    }));
    const { response: rawResponse, modelMetadata } = await provider.generate({
      question: input.question,
      scope: input.scope,
      queryPlan: input.queryPlan,
      cards,
      // Send only conversation-retrieval evidence to the model. Card-derived
      // evidence ids are already inline in the card text, and duplicating the
      // full items here once made global prompts exceed provider size limits
      // (~74% of a 10.6MB payload). `allowedEvidence` still validates
      // citations server-side below.
      evidence: includeEvidence ? aliasedChatEvidence : [],
      includeEvidence,
      promptCacheKey,
    });

    let response = translateCitationAliases(
      adminAiResponseSchema.parse(rawResponse),
      evidenceAliases,
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

    let hardConstraintDroppedShortlistContactIds: string[] = [];
    if (hasHardConstraints && input.scope === "global") {
      const constrained = applyHardConstraintsToResponse({
        response,
        allowedContactIds: allowedHardConstraintContactIds,
        constraints: hardConstraintFilter.constraints,
      });
      response = constrained.response;
      hardConstraintDroppedShortlistContactIds = constrained.droppedContactIds;
    }

    if (hasHardConstraints && input.scope === "global") {
      response = discloseHardConstraintPrefilter({
        response,
        droppedContactCount: hardConstraintFilter.droppedContactIds.length,
        budgetMin: hardConstraintFilter.constraints.budgetMin,
      });
    }

    response = discloseChatRetrievalUnavailable(
      response,
      chatRetrievalUnavailable,
    );

    const mergedMetadata: Record<string, unknown> = {
      ...modelMetadata,
      rawCards: {
        cardCount: cards.length,
        evidenceCount: allowedEvidence.length,
        evidenceEnabled: includeEvidence,
        chatEvidenceCount: chatEvidence.length,
        chatRetrievalUnavailable,
        promptCacheKey,
        droppedEvidenceIds,
        droppedShortlistContactIds: droppedContactIds,
      },
      ...(hasHardConstraints
        ? {
            hardConstraints: {
              ...hardConstraintFilter.constraints,
              prefilteredContactCount:
                hardConstraintFilter.droppedContactIds.length,
              droppedContactIds: hardConstraintFilter.droppedContactIds,
              droppedShortlistContactIds:
                hardConstraintDroppedShortlistContactIds,
            },
          }
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
