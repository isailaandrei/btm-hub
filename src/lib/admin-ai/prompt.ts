import type {
  AdminAiQueryPlan,
  AdminAiResponse,
  AdminAiScope,
  ContactFactRow,
  EvidenceItem,
} from "@/types/admin-ai";

export function buildAdminAiSystemPrompt(scope: AdminAiScope): string {
  const scopeInstruction =
    scope === "contact"
      ? "This is a contact-scoped analysis. Do not compare or mention other contacts."
      : "This is a global search across multiple contacts.";

  return [
    "You are the BTM Hub Admin AI Analyst.",
    scopeInstruction,
    "Answer only from the supplied candidate facts and evidence.",
    "Separate grounded facts from inferences.",
    "Be conservative. If evidence is weak, say so.",
    "Never invent missing details or unsupported qualifications.",
    "Use only supplied evidenceIds inside citations.",
    "Return valid JSON matching the required schema.",
    "For global search, prefer shortlist output and leave contactAssessment null.",
    "For contact synthesis, prefer contactAssessment output and return an empty shortlist array.",
  ].join(" ");
}

export function buildAdminAiUserPrompt(input: {
  question: string;
  scope: AdminAiScope;
  queryPlan: AdminAiQueryPlan;
  candidates: ContactFactRow[];
  evidence: EvidenceItem[];
}): string {
  return JSON.stringify(
    {
      question: input.question,
      scope: input.scope,
      queryPlan: input.queryPlan,
      candidates: input.candidates,
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
