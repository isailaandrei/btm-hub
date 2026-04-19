import type {
  GlobalCohortProjection,
  AdminAiQueryPlan,
  AdminAiResponse,
  AdminAiScope,
  ContactFactRow,
  EvidenceItem,
} from "@/types/admin-ai";
import type {
  CrmAiContactDossier,
} from "@/types/admin-ai-memory";

export function buildAdminAiSystemPrompt(scope: AdminAiScope): string {
  const scopeInstruction =
    scope === "contact"
      ? [
          "This is a contact-scoped synthesis. Do not compare or mention other contacts.",
          "Return `contactAssessment` populated and `shortlist` as an empty array.",
        ].join(" ")
      : [
          "This is the grounded-synthesis pass over a pre-shortlisted set of contacts.",
          "Return `shortlist` populated and `contactAssessment` as null. Never emit a contactAssessment object on global-scope questions — it will be stripped server-side regardless.",
        ].join(" ");

  return [
    "You are the BTM Hub Admin AI Analyst.",
    scopeInstruction,
    "Answer only from the supplied dossiers, candidate facts, and evidence.",
    "Separate grounded facts from inferences.",
    "Be conservative. If evidence is weak, say so.",
    "Never invent missing details or unsupported qualifications.",
    "Use only supplied evidenceIds inside citations — never cite dossier prose alone.",
    "Every shortlist entry and every contact assessment must include at least one citation from the supplied raw evidence.",
    "If you cannot support the answer with raw evidence, say so in `uncertainty` instead of answering from dossier memory alone.",
    "Return valid JSON matching the required schema.",
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
          required: ["inferredQualities", "concerns", "citations"],
        },
        { type: "null" },
      ],
    },
    uncertainty: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["shortlist", "contactAssessment", "uncertainty"],
} as const;

export function normalizeProviderResponse(
  payload: {
    shortlist: AdminAiResponse["shortlist"] | [];
    contactAssessment: AdminAiResponse["contactAssessment"] | null;
    uncertainty: string[];
  },
  scope: AdminAiScope,
): AdminAiResponse {
  return {
    shortlist:
      Array.isArray(payload.shortlist) && payload.shortlist.length > 0
        ? payload.shortlist
        : undefined,
    // Defense against the model emitting a contactAssessment on global
    // questions — the prompt + schema tell it to return null, but we
    // strip here too so the persisted response never has cross-scope
    // clutter.
    contactAssessment:
      scope === "global" ? undefined : payload.contactAssessment ?? undefined,
    uncertainty: payload.uncertainty,
  };
}

// ---------------------------------------------------------------------------
// Global single-pass cohort response
// ---------------------------------------------------------------------------

export type AdminAiGlobalCohortInput = {
  question: string;
  queryPlan: AdminAiQueryPlan;
  cohort: GlobalCohortProjection[];
  coverage: {
    totalCandidates: number;
    candidatesWithoutDossierCount: number;
    staleDossierCount: number;
    compressionLevel: "full" | "compact" | "minimal";
    wasCompressed: boolean;
  };
};

export function buildAdminAiGlobalCohortSystemPrompt(): string {
  return [
    "You are the BTM Hub Admin AI Analyst.",
    "This is a single-pass global cohort reasoning call over dossier projections.",
    "You must reason over the full supplied cohort directly. Do not invent contacts outside the cohort.",
    "Each citation must use only the supplied supportRef ids. Never invent support refs. Never cite dossier prose directly.",
    "A contact can appear in the shortlist only if you can support that entry with at least one supplied supportRef citation.",
    "Contacts marked stale or missing may still be considered, but you must reflect lower confidence in `concerns` or `uncertainty` when evidence is thin.",
    "Return valid JSON matching the required schema.",
  ].join(" ");
}

export function buildAdminAiGlobalCohortUserPrompt(
  input: AdminAiGlobalCohortInput,
): string {
  return JSON.stringify(
    {
      question: input.question,
      queryPlan: input.queryPlan,
      coverage: input.coverage,
      cohort: input.cohort,
      responseContract: {
        shortlist: [
          {
            contactId: "uuid",
            contactName: "string",
            whyFit: ["string"],
            concerns: ["string"],
            citations: [{ evidenceId: "support_1", claimKey: "string" }],
          },
        ],
        contactAssessment: null,
        uncertainty: ["string"],
      },
    },
    null,
    2,
  );
}
