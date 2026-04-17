/**
 * Memory-first admin AI orchestration.
 *
 * Global path (two-pass):
 *   1. plan -> structured filters
 *   2. assemble cohort ranking memory (cards only)
 *   3. ranking pass -> shortlisted contact ids
 *   4. expand finalist dossiers + raw evidence
 *   5. grounded synthesis pass
 *   6. persist assistant message + raw-evidence citations
 *
 * Contact path (one-pass):
 *   1. plan
 *   2. assemble dossier-first contact memory
 *   3. grounded synthesis pass
 *   4. persist assistant message + raw-evidence citations
 *
 * The final answer schema (`AdminAiResponse`) and the citation persistence
 * model are unchanged so the existing UI keeps working.
 */

import { buildAdminAiQueryPlan } from "./query-plan";
import {
  getAdminAiProvider,
  getAdminAiRankingProvider,
} from "./provider";
import { adminAiResponseSchema } from "./schemas";
import { getTags } from "@/lib/data/contacts";
import {
  createAdminAiCitations,
  createAdminAiMessage,
} from "@/lib/data/admin-ai";
import {
  assembleGlobalCohortMemory,
  expandFinalistEvidence,
} from "@/lib/admin-ai-memory/global-retrieval";
import { assembleContactScopedMemory } from "@/lib/admin-ai-memory/contact-retrieval";
import type {
  AdminAiCitationDraft,
  AdminAiQueryPlan,
  AdminAiResponse,
  AdminAiScope,
  ContactFactRow,
  EvidenceItem,
} from "@/types/admin-ai";
import type {
  CrmAiContactDossier,
} from "@/types/admin-ai-memory";

export type RunAdminAiAnalysisResult = {
  status: "complete" | "failed";
  assistantMessageId: string;
  queryPlan: AdminAiQueryPlan;
  response: AdminAiResponse | null;
  citations: AdminAiCitationDraft[];
  modelMetadata: Record<string, unknown> | null;
  error: string | null;
};

const RANKING_CARDS_FOR_RANKING_LIMIT = 250;
const SHORTLIST_FINALIST_CAP = 12;

function buildInsufficientEvidenceResponse(
  scope: AdminAiScope,
  options?: { extra?: string },
): AdminAiResponse {
  const base =
    scope === "contact"
      ? "The current CRM evidence for this contact is too thin to support a reliable synthesis."
      : "The current CRM evidence is too thin to support a reliable shortlist for this question.";
  const uncertainty = options?.extra ? [base, options.extra] : [base];
  return {
    summary: "There is not enough evidence to answer that reliably yet.",
    keyFindings: [],
    uncertainty,
  };
}

function collectCitationRefs(
  response: AdminAiResponse,
): Array<{ evidenceId: string; claimKey: string }> {
  const refs: Array<{ evidenceId: string; claimKey: string }> = [];
  for (const entry of response.shortlist ?? []) {
    refs.push(...entry.citations);
  }
  if (response.contactAssessment) {
    refs.push(...response.contactAssessment.citations);
  }
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.claimKey}:${ref.evidenceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveCitationDrafts(
  response: AdminAiResponse,
  evidence: EvidenceItem[],
): AdminAiCitationDraft[] {
  const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item] as const));
  return collectCitationRefs(response).map((ref) => {
    const item = evidenceById.get(ref.evidenceId);
    if (!item) {
      throw new Error(`Provider returned unknown evidence id: ${ref.evidenceId}`);
    }
    return {
      claim_key: ref.claimKey,
      source_type: item.sourceType,
      source_id: item.sourceId,
      contact_id: item.contactId,
      application_id: item.applicationId,
      source_label: item.sourceLabel,
      snippet: item.text,
    };
  });
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
    content: input.response.summary,
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

async function runFinalSynthesis(input: {
  scope: AdminAiScope;
  question: string;
  queryPlan: AdminAiQueryPlan;
  threadId: string;
  candidates: ContactFactRow[];
  dossiers: CrmAiContactDossier[];
  evidence: EvidenceItem[];
  rankingMetadata?: Record<string, unknown> | null;
}): Promise<RunAdminAiAnalysisResult> {
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

  try {
    const { response: rawResponse, modelMetadata } = await provider.generate({
      question: input.question,
      scope: input.scope,
      queryPlan: input.queryPlan,
      candidates: input.candidates,
      dossiers: input.dossiers,
      evidence: input.evidence,
    });

    let response: AdminAiResponse;
    try {
      response = adminAiResponseSchema.parse(rawResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`AdminAiResponse validation failed: ${message}`);
    }

    const citations = resolveCitationDrafts(response, input.evidence);

    const mergedMetadata: Record<string, unknown> = {
      ...modelMetadata,
      ...(input.rankingMetadata
        ? { rankingPass: input.rankingMetadata }
        : {}),
    };

    const { id } = await createAdminAiMessage({
      threadId: input.threadId,
      role: "assistant",
      content: response.summary,
      status: "complete",
      queryPlan: input.queryPlan,
      responseJson: response,
      modelMetadata: mergedMetadata,
    });

    await createAdminAiCitations({ messageId: id, citations });

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
    const message =
      error instanceof Error ? error.message : "Admin AI analysis failed.";
    const assistantMessageId = await persistFailedAssistantMessage({
      threadId: input.threadId,
      content: message,
      queryPlan: input.queryPlan,
      modelMetadata: { source: "system", reason: "analysis_failed" },
    });
    throw Object.assign(new Error(message), { assistantMessageId });
  }
}

async function runGlobalAnalysis(input: {
  threadId: string;
  question: string;
  queryPlan: AdminAiQueryPlan;
}): Promise<RunAdminAiAnalysisResult> {
  const cohort = await assembleGlobalCohortMemory({ plan: input.queryPlan });

  if (cohort.candidates.length === 0) {
    const response = buildInsufficientEvidenceResponse("global");
    return persistInsufficientResponse({
      threadId: input.threadId,
      queryPlan: input.queryPlan,
      response,
      reason: "no_candidates",
    });
  }

  // Even when a candidate's ranking memory is missing or flagged stale, we
  // still surface its id to the ranking pass via `candidatesMissingMemory`
  // so the model can flag weak coverage. The ranking pass itself can only
  // shortlist contacts whose ranking card is present in the current read.
  if (cohort.rankingCards.length === 0) {
    const response = buildInsufficientEvidenceResponse("global", {
      extra:
        "No persisted ranking memory exists for the cohort. Run the admin AI memory backfill to enable cohort ranking.",
    });
    return persistInsufficientResponse({
      threadId: input.threadId,
      queryPlan: input.queryPlan,
      response,
      reason: "no_ranking_memory",
    });
  }

  const rankingProvider = getAdminAiRankingProvider();
  if (!rankingProvider.isConfigured()) {
    const reason =
      rankingProvider.getUnavailableReason() ?? "Admin AI is unavailable.";
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

  let rankingResult;
  try {
    rankingResult = await rankingProvider.generateRanking({
      question: input.question,
      queryPlan: input.queryPlan,
      rankingCards: cohort.rankingCards.slice(0, RANKING_CARDS_FOR_RANKING_LIMIT),
      candidatesMissingMemory: cohort.contactsMissingRankingCards,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ranking pass failed.";
    const assistantMessageId = await persistFailedAssistantMessage({
      threadId: input.threadId,
      content: message,
      queryPlan: input.queryPlan,
      modelMetadata: { source: "system", reason: "ranking_failed" },
    });
    throw Object.assign(new Error(message), { assistantMessageId });
  }

  if (rankingResult.shortlistedContactIds.length === 0) {
    const response = buildInsufficientEvidenceResponse("global", {
      extra:
        rankingResult.cohortNotes?.trim() ||
        "Ranking pass returned no shortlist for this question.",
    });
    return persistInsufficientResponse({
      threadId: input.threadId,
      queryPlan: input.queryPlan,
      response,
      reason: "empty_shortlist",
    });
  }

  const shortlist = rankingResult.shortlistedContactIds.slice(
    0,
    SHORTLIST_FINALIST_CAP,
  );
  const finalists = await expandFinalistEvidence({
    question: input.question,
    shortlistedContactIds: shortlist,
    textFocus: input.queryPlan.textFocus,
  });

  if (finalists.evidence.length === 0) {
    const response = buildInsufficientEvidenceResponse("global", {
      extra:
        "No raw evidence could be retrieved for the shortlisted contacts, so I can't produce a cited shortlist yet.",
    });
    return persistInsufficientResponse({
      threadId: input.threadId,
      queryPlan: input.queryPlan,
      response,
      reason: "missing_finalist_evidence",
    });
  }

  const finalistCandidates = cohort.candidates.filter(
    (c) => c.contact_id && shortlist.includes(c.contact_id),
  );

  const rankingMetadata: Record<string, unknown> = {
    ...rankingResult.modelMetadata,
    ...(rankingResult.droppedContactIds &&
    rankingResult.droppedContactIds.length > 0
      ? { droppedContactIds: rankingResult.droppedContactIds }
      : {}),
  };

  return runFinalSynthesis({
    scope: "global",
    question: input.question,
    queryPlan: input.queryPlan,
    threadId: input.threadId,
    candidates: finalistCandidates,
    dossiers: finalists.dossiers,
    evidence: finalists.evidence,
    rankingMetadata,
  });
}

async function runContactAnalysis(input: {
  threadId: string;
  question: string;
  queryPlan: AdminAiQueryPlan;
  contactId: string;
}): Promise<RunAdminAiAnalysisResult> {
  const memory = await assembleContactScopedMemory({
    contactId: input.contactId,
    question: input.question,
    textFocus: input.queryPlan.textFocus,
  });

  if (!memory.dossier && memory.evidence.length === 0) {
    const response = buildInsufficientEvidenceResponse("contact", {
      extra: memory.fallbackUsed
        ? "No dossier exists for this contact yet. Run the admin AI memory backfill to enable richer analysis."
        : undefined,
    });
    return persistInsufficientResponse({
      threadId: input.threadId,
      queryPlan: input.queryPlan,
      response,
      reason: "insufficient_contact_memory",
    });
  }

  if (memory.evidence.length === 0) {
    const response = buildInsufficientEvidenceResponse("contact", {
      extra:
        "No raw evidence could be retrieved for this contact, so I can't provide a cited assessment yet.",
    });
    return persistInsufficientResponse({
      threadId: input.threadId,
      queryPlan: input.queryPlan,
      response,
      reason: "missing_contact_evidence",
    });
  }

  return runFinalSynthesis({
    scope: "contact",
    question: input.question,
    queryPlan: input.queryPlan,
    threadId: input.threadId,
    candidates: [],
    dossiers: memory.dossier ? [memory.dossier] : [],
    evidence: memory.evidence,
  });
}

export async function runAdminAiAnalysis(input: {
  scope: AdminAiScope;
  question: string;
  threadId: string;
  contactId?: string;
}): Promise<RunAdminAiAnalysisResult> {
  const tags = await getTags();
  const queryPlan = buildAdminAiQueryPlan({
    scope: input.scope,
    contactId: input.contactId,
    question: input.question,
    availableTags: tags.map((tag) => ({ id: tag.id, name: tag.name })),
  });

  if (input.scope === "contact" && input.contactId) {
    return runContactAnalysis({
      threadId: input.threadId,
      question: input.question,
      queryPlan,
      contactId: input.contactId,
    });
  }

  return runGlobalAnalysis({
    threadId: input.threadId,
    question: input.question,
    queryPlan,
  });
}
