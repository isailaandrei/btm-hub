import { buildAdminAiQueryPlan } from "./query-plan";
import { assembleAdminAiEvidence } from "./retrieval";
import { getAdminAiProvider } from "./provider";
import { adminAiResponseSchema } from "./schemas";
import { getTags } from "@/lib/data/contacts";
import {
  createAdminAiCitations,
  createAdminAiMessage,
} from "@/lib/data/admin-ai";
import type {
  AdminAiCitationDraft,
  AdminAiCitationRow,
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

function buildInsufficientEvidenceResponse(scope: AdminAiScope): AdminAiResponse {
  return {
    summary: "There is not enough evidence to answer that reliably yet.",
    keyFindings: [],
    uncertainty: [
      scope === "contact"
        ? "The current CRM evidence for this contact is too thin to support a reliable synthesis."
        : "The current CRM evidence is too thin to support a reliable shortlist for this question.",
    ],
  };
}

function collectCitationRefs(response: AdminAiResponse): Array<{
  evidenceId: string;
  claimKey: string;
}> {
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

  const assembled = await assembleAdminAiEvidence({ plan: queryPlan });

  if (assembled.insufficientEvidence) {
    const response = buildInsufficientEvidenceResponse(input.scope);
    const { id } = await createAdminAiMessage({
      threadId: input.threadId,
      role: "assistant",
      content: response.summary,
      status: "complete",
      queryPlan,
      responseJson: response,
      modelMetadata: { source: "system", reason: "insufficient_evidence" },
    });

    return {
      status: "complete",
      assistantMessageId: id,
      queryPlan,
      response,
      citations: [],
      modelMetadata: { source: "system", reason: "insufficient_evidence" },
      error: null,
    };
  }

  const provider = getAdminAiProvider();
  if (!provider.isConfigured()) {
    const reason = provider.getUnavailableReason() ?? "Admin AI is unavailable.";
    const assistantMessageId = await persistFailedAssistantMessage({
      threadId: input.threadId,
      content: reason,
      queryPlan,
      modelMetadata: { source: "system", reason: "provider_not_configured" },
    });

    return {
      status: "failed",
      assistantMessageId,
      queryPlan,
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
      queryPlan,
      candidates: assembled.candidates,
      evidence: assembled.evidence,
    });

    let response: AdminAiResponse;
    try {
      response = adminAiResponseSchema.parse(rawResponse);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      throw new Error(`AdminAiResponse validation failed: ${message}`);
    }
    const citations = resolveCitationDrafts(response, assembled.evidence);

    const { id } = await createAdminAiMessage({
      threadId: input.threadId,
      role: "assistant",
      content: response.summary,
      status: "complete",
      queryPlan,
      responseJson: response,
      modelMetadata,
    });

    await createAdminAiCitations({
      messageId: id,
      citations,
    });

    return {
      status: "complete",
      assistantMessageId: id,
      queryPlan,
      response,
      citations,
      modelMetadata,
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Admin AI analysis failed.";

    const assistantMessageId = await persistFailedAssistantMessage({
      threadId: input.threadId,
      content: message,
      queryPlan,
      modelMetadata: { source: "system", reason: "analysis_failed" },
    });

    throw Object.assign(
      new Error(message),
      { assistantMessageId },
    );
  }
}
