import type { RenderedContactCard } from "./contact-card";
import type {
  AdminAiQueryPlan,
  AdminAiResponse,
  AdminAiScope,
  EvidenceItem,
} from "@/types/admin-ai";

export function buildAdminAiSystemPrompt(scope: AdminAiScope): string {
  const scopeInstruction =
    scope === "contact"
      ? [
          "This is a contact-scoped synthesis. Do not compare or mention other contacts.",
          "Return `contactAssessment` populated and `shortlist` as an empty array.",
        ].join(" ")
      : [
          "This is a global admin-AI response over the supplied eligible cohort.",
          "Return `shortlist` populated and `contactAssessment` as null. Never emit a contactAssessment object on global-scope questions.",
        ].join(" ");

  return [
    "You are the BTM Hub Admin AI Analyst.",
    scopeInstruction,
    "Answer only from the supplied raw contact cards, conversation facts, conversation digests, and evidence.",
    "The cards are verbatim CRM records, not summaries. Do not invent contacts or details outside them.",
    "Surface discrepancies and conflicts explicitly; do not resolve conflicting values away.",
    "Separate grounded facts from inferences.",
    "Be conservative. If evidence is weak, say so.",
    "Use only supplied evidenceIds inside citations.",
    "Every shortlist entry and every contact assessment must include at least one supplied citation.",
    "If you cannot support the answer with supplied raw evidence, say so in `uncertainty`.",
    "Return valid JSON matching the required schema.",
  ].join(" ");
}

export type AdminAiSynthesisInput = {
  question: string;
  scope: AdminAiScope;
  queryPlan: AdminAiQueryPlan;
  cards: RenderedContactCard[];
  evidence: EvidenceItem[];
  promptCacheKey?: string | null;
};

export function buildAdminAiUserPrompt(input: AdminAiSynthesisInput): string {
  return JSON.stringify(
    {
      question: input.question,
      scope: input.scope,
      queryPlan: input.queryPlan,
      rawContactCards: input.cards.map((card) => ({
        contactId: card.contactId,
        contactName: card.contactName,
        card: card.text,
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
    contactAssessment:
      scope === "global" ? undefined : payload.contactAssessment ?? undefined,
    uncertainty: payload.uncertainty,
  };
}
