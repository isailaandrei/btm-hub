/**
 * Memory-first admin AI orchestration.
 *
 * Global path:
 *   1. plan -> structured filters
 *   2. assemble whole-cohort dossier projections
 *   3. single global reasoning call over the cohort
 *   4. resolve support refs back to raw chunk citations
 *   5. persist assistant message + raw-evidence citations
 *
 * Contact path:
 *   1. plan
 *   2. assemble dossier-first contact memory
 *   3. grounded synthesis pass
 *   4. persist assistant message + raw-evidence citations
 *
 * The final answer schema (`AdminAiResponse`) and citation persistence model
 * are unchanged so the existing UI keeps working.
 */

import { buildAdminAiQueryPlan } from "./query-plan";
import { adminAiDebugLog, startAdminAiDebugTimer } from "./debug";
import { getAdminAiProvider } from "./provider";
import { adminAiResponseSchema } from "./schemas";
import { getTags } from "@/lib/data/contacts";
import {
  createAdminAiCitations,
  createAdminAiMessage,
} from "@/lib/data/admin-ai";
import {
  assembleGlobalSinglePassCohort,
  type GlobalSupportRefResolution,
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
    uncertainty,
  };
}

/**
 * One-line description of an assistant response. Used for `admin_ai_messages.content`
 * (where the structured response_json carries the real payload that drives
 * the UI). Keeping `content` human-readable makes log scans and future
 * message-history search work without re-deriving the shape.
 */
export function describeAssistantResponse(response: AdminAiResponse): string {
  if (response.shortlist && response.shortlist.length > 0) {
    const names = response.shortlist.map((entry) => entry.contactName);
    const preview = names.slice(0, 3).join(", ");
    const tail =
      names.length > 3 ? `, +${names.length - 3} more` : "";
    const label =
      names.length === 1 ? "Shortlisted 1 contact" : `Shortlisted ${names.length} contacts`;
    return `${label}: ${preview}${tail}.`;
  }
  if (response.contactAssessment) {
    return "Contact assessment returned.";
  }
  if (response.uncertainty.length > 0) {
    return response.uncertainty[0]!;
  }
  return "Admin AI response.";
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
  // Dedupe on evidenceId alone. The UI surfaces citations as "pieces of
  // evidence" grouped by contact — it does not render claim_key — so two
  // refs that point at the same evidence under different claims would
  // render as duplicate snippets. Keep the first ref per evidenceId as
  // the representative attribution.
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

function hydrateSupportRefsInGlobalResponse(input: {
  response: AdminAiResponse;
  supportRefMap: Map<string, GlobalSupportRefResolution>;
  evidence: EvidenceItem[];
}): {
  response: AdminAiResponse;
  unresolvedSupportRefs: string[];
} {
  const evidenceById = new Map(
    input.evidence.map((item) => [item.evidenceId, item] as const),
  );
  const unresolvedSupportRefs: string[] = [];

  const shortlist = input.response.shortlist?.map((entry) => {
    const expanded: typeof entry.citations = [];
    const seenEvidenceIds = new Set<string>();

    for (const citation of entry.citations) {
      const support = input.supportRefMap.get(citation.evidenceId);
      if (!support || support.contactId !== entry.contactId) {
        unresolvedSupportRefs.push(citation.evidenceId);
        continue;
      }

      for (const chunkId of support.chunkIds) {
        const evidence = evidenceById.get(chunkId);
        if (!evidence || evidence.contactId !== entry.contactId) {
          unresolvedSupportRefs.push(citation.evidenceId);
          continue;
        }
        if (seenEvidenceIds.has(evidence.evidenceId)) continue;
        seenEvidenceIds.add(evidence.evidenceId);
        expanded.push({
          evidenceId: evidence.evidenceId,
          claimKey: citation.claimKey,
        });
      }
    }

    return {
      ...entry,
      citations: expanded,
    };
  });

  return {
    response: {
      ...input.response,
      shortlist,
    },
    unresolvedSupportRefs,
  };
}

function pruneUncitedGlobalShortlistEntries(input: {
  response: AdminAiResponse;
  unresolvedSupportRefs: string[];
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

  if (
    input.unresolvedSupportRefs.length === 0 &&
    droppedContactIds.length === 0
  ) {
    return {
      response: input.response,
      droppedContactIds,
    };
  }

  const uncertainty = [...input.response.uncertainty];
  const note =
    shortlist && shortlist.length > 0
      ? "Some model-returned shortlist entries were dropped because their citations could not be resolved to raw evidence."
      : "The model returned shortlist entries, but their citations could not be resolved to raw evidence, so no grounded shortlist could be kept.";
  if (!uncertainty.includes(note)) {
    uncertainty.push(note);
  }

  return {
    response: {
      ...input.response,
      shortlist,
      uncertainty,
    },
    droppedContactIds,
  };
}

/**
 * Rebuild the response payload with foreign citations stripped so the
 * persisted `response_json` and the persisted citation rows agree on
 * what actually got cited. Entries / assessments whose citations were
 * all foreign end up with an empty citations array — acceptable as a
 * degradation mode; the UI still renders the entry with a gap.
 */
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
        (c) => !droppedEvidenceIds.has(c.evidenceId),
      ),
    })),
    contactAssessment: response.contactAssessment
      ? {
          ...response.contactAssessment,
          citations: response.contactAssessment.citations.filter(
            (c) => !droppedEvidenceIds.has(c.evidenceId),
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

async function runFinalSynthesis(input: {
  scope: AdminAiScope;
  question: string;
  queryPlan: AdminAiQueryPlan;
  threadId: string;
  candidates: ContactFactRow[];
  dossiers: CrmAiContactDossier[];
  evidence: EvidenceItem[];
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
    const synthesisTimer = startAdminAiDebugTimer("final-synthesis", {
      scope: input.scope,
      candidateCount: input.candidates.length,
      dossierCount: input.dossiers.length,
      evidenceCount: input.evidence.length,
    });
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

    const { drafts: citations, droppedEvidenceIds } = resolveCitationDrafts(
      response,
      input.evidence,
    );
    const cleanedResponse = applyDroppedEvidenceIdsToResponse(
      response,
      new Set(droppedEvidenceIds),
    );

    const mergedMetadata: Record<string, unknown> = {
      ...modelMetadata,
      ...(droppedEvidenceIds.length > 0 ? { droppedEvidenceIds } : {}),
    };

    const { id } = await createAdminAiMessage({
      threadId: input.threadId,
      role: "assistant",
      content: describeAssistantResponse(cleanedResponse),
      status: "complete",
      queryPlan: input.queryPlan,
      responseJson: cleanedResponse,
      modelMetadata: mergedMetadata,
    });

    await createAdminAiCitations({ messageId: id, citations });

    synthesisTimer.end({
      status: "complete",
      citationCount: citations.length,
      model: (modelMetadata.model as string | undefined) ?? null,
      responseId: (modelMetadata.responseId as string | undefined) ?? null,
    });

    return {
      status: "complete",
      assistantMessageId: id,
      queryPlan: input.queryPlan,
      response: cleanedResponse,
      citations,
      modelMetadata: mergedMetadata,
      error: null,
    };
  } catch (error) {
    adminAiDebugLog("final-synthesis-failed", {
      scope: input.scope,
      candidateCount: input.candidates.length,
      dossierCount: input.dossiers.length,
      evidenceCount: input.evidence.length,
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
    // Preserve the original error's stack so downstream logs can point at
    // the actual failure (Zod validation, timeout, JSON parse, etc.)
    // rather than this re-throw site.
    throw Object.assign(
      error instanceof Error ? error : new Error(message),
      { assistantMessageId },
    );
  }
}

async function runGlobalAnalysis(input: {
  threadId: string;
  question: string;
  queryPlan: AdminAiQueryPlan;
}): Promise<RunAdminAiAnalysisResult> {
  const cohort = await assembleGlobalSinglePassCohort({
    plan: input.queryPlan,
  });
  adminAiDebugLog("global-single-pass-assembled", {
    candidateCount: cohort.candidates.length,
    projectionCount: cohort.projections.length,
    supportRefCount: cohort.supportRefMap.size,
    evidenceCount: cohort.evidence.length,
    contactsMissingDossiers: cohort.contactsMissingDossiers.length,
    contactsServingStaleDossiers: cohort.contactsServingStaleDossiers.length,
    compressionLevel: cohort.compressionLevel,
    wasCompressed: cohort.wasCompressed,
    cohortTokenEstimate: cohort.cohortTokenEstimate,
    cohortTokenBudget: cohort.cohortTokenBudget,
  });

  if (cohort.candidates.length === 0 || cohort.projections.length === 0) {
    const response = buildInsufficientEvidenceResponse("global");
    return persistInsufficientResponse({
      threadId: input.threadId,
      queryPlan: input.queryPlan,
      response,
      reason: "no_candidates",
    });
  }

  if (cohort.supportRefMap.size === 0 || cohort.evidence.length === 0) {
    const response = buildInsufficientEvidenceResponse("global", {
      extra:
        "No anchor-backed dossier evidence is available for the current cohort yet.",
    });
    return persistInsufficientResponse({
      threadId: input.threadId,
      queryPlan: input.queryPlan,
      response,
      reason: "no_anchor_backed_memory",
    });
  }

  const provider = getAdminAiProvider();
  if (!provider.isConfigured()) {
    const reason =
      provider.getUnavailableReason() ?? "Admin AI is unavailable.";
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
    const timer = startAdminAiDebugTimer("global-single-pass", {
      candidateCount: cohort.candidates.length,
      projectionCount: cohort.projections.length,
      supportRefCount: cohort.supportRefMap.size,
      evidenceCount: cohort.evidence.length,
      compressionLevel: cohort.compressionLevel,
      wasCompressed: cohort.wasCompressed,
    });
    const { response: rawResponse, modelMetadata } =
      await provider.generateGlobalCohortResponse({
        question: input.question,
        queryPlan: input.queryPlan,
        cohort: cohort.projections,
        coverage: {
          totalCandidates: cohort.candidates.length,
          candidatesWithoutDossierCount:
            cohort.contactsMissingDossiers.length,
          staleDossierCount: cohort.contactsServingStaleDossiers.length,
          compressionLevel: cohort.compressionLevel,
          wasCompressed: cohort.wasCompressed,
        },
      });

    const response = adminAiResponseSchema.parse(rawResponse);
    const hydrated = hydrateSupportRefsInGlobalResponse({
      response,
      supportRefMap: cohort.supportRefMap,
      evidence: cohort.evidence,
    });

    const cleaned = pruneUncitedGlobalShortlistEntries({
      response: hydrated.response,
      unresolvedSupportRefs: hydrated.unresolvedSupportRefs,
    });
    const unresolvedSupportRefs = Array.from(
      new Set(hydrated.unresolvedSupportRefs),
    );
    if (
      unresolvedSupportRefs.length > 0 ||
      cleaned.droppedContactIds.length > 0
    ) {
      console.warn(
        "[admin-ai] single-pass global response contained unresolved support refs — dropping unsupported shortlist entries",
        {
          unresolvedSupportRefs,
          droppedContactIds: cleaned.droppedContactIds,
          keptCount: cleaned.response.shortlist?.length ?? 0,
        },
      );
      adminAiDebugLog("global-support-ref-cleanup", {
        unresolvedSupportRefs,
        droppedContactIds: cleaned.droppedContactIds,
        keptCount: cleaned.response.shortlist?.length ?? 0,
      });
    }

    if ((cleaned.response.shortlist?.length ?? 0) === 0) {
      const response = buildInsufficientEvidenceResponse("global", {
        extra:
          cleaned.response.uncertainty.at(-1) ??
          "The model did not return any grounded shortlist entries for this question.",
      });
      timer.end({
        status: "insufficient_after_support_ref_cleanup",
        unresolvedSupportRefCount: unresolvedSupportRefs.length,
        droppedShortlistCount: cleaned.droppedContactIds.length,
      });
      return persistInsufficientResponse({
        threadId: input.threadId,
        queryPlan: input.queryPlan,
        response,
        reason: "ungrounded_single_pass_shortlist",
      });
    }

    const { drafts: citations } = resolveCitationDrafts(
      cleaned.response,
      cohort.evidence,
    );

    const mergedMetadata: Record<string, unknown> = {
      ...modelMetadata,
      globalSinglePass: {
        supportRefCount: cohort.supportRefMap.size,
        evidenceCount: cohort.evidence.length,
        contactsMissingDossiers: cohort.contactsMissingDossiers.length,
        contactsServingStaleDossiers:
          cohort.contactsServingStaleDossiers.length,
        compressionLevel: cohort.compressionLevel,
        wasCompressed: cohort.wasCompressed,
        cohortTokenEstimate: cohort.cohortTokenEstimate,
        cohortTokenBudget: cohort.cohortTokenBudget,
        unresolvedSupportRefs,
        droppedShortlistContactIds: cleaned.droppedContactIds,
      },
    };

    const { id } = await createAdminAiMessage({
      threadId: input.threadId,
      role: "assistant",
      content: describeAssistantResponse(cleaned.response),
      status: "complete",
      queryPlan: input.queryPlan,
      responseJson: cleaned.response,
      modelMetadata: mergedMetadata,
    });

    await createAdminAiCitations({ messageId: id, citations });
    timer.end({
      status: "complete",
      shortlistCount: cleaned.response.shortlist?.length ?? 0,
      citationCount: citations.length,
    });

    return {
      status: "complete",
      assistantMessageId: id,
      queryPlan: input.queryPlan,
      response: cleaned.response,
      citations,
      modelMetadata: mergedMetadata,
      error: null,
    };
  } catch (error) {
    adminAiDebugLog("global-single-pass-failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    const message =
      error instanceof Error ? error.message : "Global single-pass analysis failed.";
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
  adminAiDebugLog("contact-memory-assembled", {
    contactId: input.contactId,
    hasDossier: Boolean(memory.dossier),
    evidenceCount: memory.evidence.length,
    fallbackUsed: memory.fallbackUsed,
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
  adminAiDebugLog("query-plan", {
    scope: input.scope,
    contactId: input.contactId ?? null,
    mode: queryPlan.mode,
    structuredFilterCount: queryPlan.structuredFilters.length,
    textFocus: queryPlan.textFocus,
    requestedLimit: queryPlan.requestedLimit,
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
