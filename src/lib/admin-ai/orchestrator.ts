/**
 * Raw-card admin AI orchestration.
 *
 * The CRM corpus is small enough to stuff directly. This path renders eligible
 * contacts as verbatim cards, sends those cards plus raw citation anchors to
 * the model, then strips any citation that is not backed by supplied evidence
 * before persistence.
 */

import { createHash } from "node:crypto";
import { renderContactCard, type RenderedContactCard } from "./contact-card";
import { adminAiDebugLog, startAdminAiDebugTimer } from "./debug";
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
  return {
    mode: input.scope === "contact" ? "contact_synthesis" : "global_search",
    contactId: input.scope === "contact" ? input.contactId : undefined,
    structuredFilters: [],
    textFocus: input.question.trim() ? [input.question.trim()] : [],
    requestedLimit: input.scope === "contact" ? 1 : 25,
  };
}

function buildPromptCacheKey(cards: RenderedContactCard[]): string {
  const hash = createHash("sha256");
  for (const card of [...cards].sort((a, b) => a.contactId.localeCompare(b.contactId))) {
    hash.update(card.contactId);
    hash.update("\0");
    hash.update(card.text);
    hash.update("\0");
  }
  return `admin-ai-cards:${hash.digest("hex").slice(0, 32)}`;
}

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

function renderRecords(records: ContactCardRecord[]): {
  cards: RenderedContactCard[];
  evidence: EvidenceItem[];
} {
  const cards = records.map(renderContactCard);
  return {
    cards,
    evidence: cards.flatMap((card) => card.evidence),
  };
}

async function runCardSynthesis(input: {
  scope: AdminAiScope;
  question: string;
  queryPlan: AdminAiQueryPlan;
  threadId: string;
  records: ContactCardRecord[];
}): Promise<RunAdminAiAnalysisResult> {
  const { cards, evidence } = renderRecords(input.records);
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

  const chatEvidence = await retrieveConversationEvidence({
    question: input.question,
    contactId:
      input.scope === "contact" ? input.queryPlan.contactId ?? null : null,
    limit: 40,
  });
  const allowedEvidence = [...evidence, ...chatEvidence];

  adminAiDebugLog("raw-cards-assembled", {
    scope: input.scope,
    cardCount: cards.length,
    evidenceCount: allowedEvidence.length,
    chatEvidenceCount: chatEvidence.length,
    promptCacheKey: input.scope === "global" ? buildPromptCacheKey(cards) : null,
  });

  if (cards.length === 0 || allowedEvidence.length === 0) {
    const response = buildInsufficientEvidenceResponse(input.scope, {
      extra:
        input.scope === "contact"
          ? "No raw application, note, tag, or conversation evidence is available for this contact."
          : "No eligible contacts with raw application, note, tag, or conversation evidence are available.",
    });
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
      input.scope === "global" ? buildPromptCacheKey(cards) : null;
    const { response: rawResponse, modelMetadata } = await provider.generate({
      question: input.question,
      scope: input.scope,
      queryPlan: input.queryPlan,
      cards,
      evidence: allowedEvidence,
      promptCacheKey,
    });

    let response = adminAiResponseSchema.parse(rawResponse);
    const { drafts: citations, droppedEvidenceIds } = resolveCitationDrafts(
      response,
      allowedEvidence,
    );
    response = applyDroppedEvidenceIdsToResponse(
      response,
      new Set(droppedEvidenceIds),
    );

    let droppedContactIds: string[] = [];
    if (input.scope === "global") {
      const cleaned = pruneUncitedGlobalShortlistEntries({
        response,
        droppedEvidenceIds,
      });
      response = cleaned.response;
      droppedContactIds = cleaned.droppedContactIds;

      if ((response.shortlist?.length ?? 0) === 0) {
        const insufficient = buildInsufficientEvidenceResponse("global", {
          extra:
            response.uncertainty.at(-1) ??
            "The model did not return any grounded shortlist entries for this question.",
        });
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

    const mergedMetadata: Record<string, unknown> = {
      ...modelMetadata,
      rawCards: {
        cardCount: cards.length,
        evidenceCount: allowedEvidence.length,
        chatEvidenceCount: chatEvidence.length,
        promptCacheKey,
        droppedEvidenceIds,
        droppedShortlistContactIds: droppedContactIds,
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

    await createAdminAiCitations({ messageId: id, citations });
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
