import type {
  AdminAiQueryPlan,
  AdminAiResponse,
  AdminAiScope,
  ContactFactRow,
  EvidenceItem,
} from "@/types/admin-ai";
import type {
  CrmAiContactDossier,
  CrmAiContactRankingCard,
} from "@/types/admin-ai-memory";

export function buildAdminAiSystemPrompt(scope: AdminAiScope): string {
  const scopeInstruction =
    scope === "contact"
      ? "This is a contact-scoped synthesis. Do not compare or mention other contacts."
      : "This is the grounded-synthesis pass over a pre-shortlisted set of contacts.";

  return [
    "You are the BTM Hub Admin AI Analyst.",
    scopeInstruction,
    "Answer only from the supplied dossiers, candidate facts, and evidence.",
    "Separate grounded facts from inferences.",
    "Be conservative. If evidence is weak, say so.",
    "Never invent missing details or unsupported qualifications.",
    "Use only supplied evidenceIds inside citations — never cite dossier prose alone.",
    "Every shortlist entry and every contact assessment must include at least one citation from the supplied raw evidence.",
    "If you cannot support the answer with raw evidence, say so in uncertainty instead of answering from dossier memory alone.",
    "Return valid JSON matching the required schema.",
    "For global search, prefer shortlist output and leave contactAssessment null.",
    "For contact synthesis, prefer contactAssessment output and return an empty shortlist array.",
  ].join(" ");
}

export type AdminAiSynthesisInput = {
  question: string;
  scope: AdminAiScope;
  queryPlan: AdminAiQueryPlan;
  candidates: ContactFactRow[];
  dossiers: CrmAiContactDossier[];
  evidence: EvidenceItem[];
};

export function buildAdminAiUserPrompt(input: AdminAiSynthesisInput): string {
  return JSON.stringify(
    {
      question: input.question,
      scope: input.scope,
      queryPlan: input.queryPlan,
      candidates: input.candidates,
      dossiers: input.dossiers.map((d) => ({
        contactId: d.contact_id,
        facts: d.facts_json,
        signals: d.signals_json,
        contradictions: d.contradictions_json,
        unknowns: d.unknowns_json,
        summary: { short: d.short_summary, medium: d.medium_summary },
        sourceCoverage: d.source_coverage,
      })),
      evidence: input.evidence,
      responseContract: {
        summary: "string",
        keyFindings: ["string"],
        shortlist: [
          {
            contactId: "uuid",
            contactName: "string",
            whyFit: ["string"],
            concerns: ["string"],
            citations: [{ evidenceId: "string", claimKey: "string" }],
          },
        ],
        contactAssessment: {
          facts: ["string"],
          inferredQualities: ["string"],
          concerns: ["string"],
          citations: [{ evidenceId: "string", claimKey: "string" }],
        },
        uncertainty: ["string"],
      },
    },
    null,
    2,
  );
}

/**
 * JSON schema for Structured Outputs. The provider normalizes `null` /
 * empty-array values back into the app's `AdminAiResponse` shape after parse.
 */
export const ADMIN_AI_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    keyFindings: {
      type: "array",
      items: { type: "string" },
    },
    shortlist: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          contactId: { type: "string", format: "uuid" },
          contactName: { type: "string" },
          whyFit: { type: "array", items: { type: "string" } },
          concerns: { type: "array", items: { type: "string" } },
          citations: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                evidenceId: { type: "string" },
                claimKey: { type: "string" },
              },
              required: ["evidenceId", "claimKey"],
            },
          },
        },
        required: ["contactId", "contactName", "whyFit", "concerns", "citations"],
      },
    },
    contactAssessment: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            facts: { type: "array", items: { type: "string" } },
            inferredQualities: { type: "array", items: { type: "string" } },
            concerns: { type: "array", items: { type: "string" } },
            citations: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  evidenceId: { type: "string" },
                  claimKey: { type: "string" },
                },
                required: ["evidenceId", "claimKey"],
              },
            },
          },
          required: ["facts", "inferredQualities", "concerns", "citations"],
        },
        { type: "null" },
      ],
    },
    uncertainty: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "summary",
    "keyFindings",
    "shortlist",
    "contactAssessment",
    "uncertainty",
  ],
} as const;

export function normalizeProviderResponse(payload: {
  summary: string;
  keyFindings: string[];
  shortlist: AdminAiResponse["shortlist"] | [];
  contactAssessment: AdminAiResponse["contactAssessment"] | null;
  uncertainty: string[];
}): AdminAiResponse {
  return {
    summary: payload.summary,
    keyFindings: payload.keyFindings,
    shortlist:
      Array.isArray(payload.shortlist) && payload.shortlist.length > 0
        ? payload.shortlist
        : undefined,
    contactAssessment: payload.contactAssessment ?? undefined,
    uncertainty: payload.uncertainty,
  };
}

// ---------------------------------------------------------------------------
// Ranking pass
// ---------------------------------------------------------------------------

/**
 * Ranking pass — internal-only. Output is NOT a user-visible answer; it is
 * the shortlist of contact ids the synthesis pass will deeply evaluate.
 */

export function buildAdminAiRankingSystemPrompt(): string {
  return [
    "You are the BTM Hub Admin AI ranking pass.",
    "Use the supplied ranking cards to shortlist the most plausible candidates for the question.",
    "Do not invent contacts. Only use contactIds present in the input.",
    "Be conservative — fewer high-fit picks beat noisy long lists.",
    "If the cohort coverage looks insufficient, say so under `cohortNotes`.",
    "Return valid JSON matching the required schema.",
  ].join(" ");
}

export type AdminAiRankingInput = {
  question: string;
  queryPlan: AdminAiQueryPlan;
  rankingCards: CrmAiContactRankingCard[];
  candidatesMissingMemory: string[];
};

export function buildAdminAiRankingUserPrompt(
  input: AdminAiRankingInput,
): string {
  return JSON.stringify(
    {
      question: input.question,
      queryPlan: input.queryPlan,
      rankingCards: input.rankingCards.map((card) => ({
        contactId: card.contact_id,
        facts: card.facts_json,
        topFitSignals: card.top_fit_signals_json,
        topConcerns: card.top_concerns_json,
        confidenceNotes: card.confidence_notes_json,
        shortSummary: card.short_summary,
      })),
      candidatesMissingMemory: input.candidatesMissingMemory,
      responseContract: {
        shortlistedContactIds: ["uuid"],
        reasons: [{ contactId: "uuid", reason: "string" }],
        cohortNotes: "string | null",
      },
    },
    null,
    2,
  );
}

export const ADMIN_AI_RANKING_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    shortlistedContactIds: {
      type: "array",
      items: { type: "string", format: "uuid" },
    },
    reasons: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          contactId: { type: "string", format: "uuid" },
          reason: { type: "string" },
        },
        required: ["contactId", "reason"],
      },
    },
    cohortNotes: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["shortlistedContactIds", "reasons", "cohortNotes"],
} as const;
