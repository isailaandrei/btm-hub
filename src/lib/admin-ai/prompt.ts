import type { RenderedContactCard } from "./contact-card";
import type {
  AdminAiQueryPlan,
  AdminAiResponse,
  AdminAiScope,
  EvidenceItem,
} from "@/types/admin-ai";

export function buildAdminAiSystemPrompt(
  scope: AdminAiScope,
  options: { includeEvidence?: boolean } = {},
): string {
  const includeEvidence = options.includeEvidence ?? true;
  const scopeInstruction =
    scope === "contact"
      ? [
          "This is a contact-scoped synthesis. Do not compare or mention other contacts.",
          "Return `contactAssessment` populated and `shortlist` as an empty array.",
        ].join(" ")
      : [
          "This is a global admin-AI response over the supplied eligible cohort.",
          "Return `shortlist` entries only for candidates who satisfy the user's explicit constraints, and return `contactAssessment` as null. Never emit a contactAssessment object on global-scope questions.",
        ].join(" ");

  const base = [
    "You are the BTM Hub Admin AI Analyst.",
    scopeInstruction,
    includeEvidence
      ? "Answer only from the supplied raw contact cards, conversation facts, conversation digests, and evidence."
      : "Answer only from the supplied raw contact cards, conversation facts, and conversation digests.",
    "The cards are verbatim CRM records, not summaries. Do not invent contacts or details outside them.",
    "Card note lines labeled `Contact note`, `Call note`, or `Message log` are admin-authored CRM entries (with author and date) and are reliable evidence about the contact. They carry the same weight as application answers: a single decisive call note or message log qualifies a contact exactly as an application answer would.",
    "Surface discrepancies and conflicts explicitly; do not resolve conflicting values away.",
    "Separate grounded facts from inferences.",
    "Be conservative. If evidence is weak, say so.",
    "Hard constraints are exclusionary. Explicit user requirements such as budget minimums, program, status, gender, location, certification, or required experience are filters, not ranking preferences.",
    "Contact tags are written as `Category: Tag` (for example `26 Coral Catch: Potential Candidate`). The category names a program, trip, or cohort; the tag names the contact's status within it.",
    "When the question targets a named program, trip, or cohort, tags in the matching tag category are the authoritative cohort marker: only contacts carrying a tag in that category qualify. Negative statuses such as `Declined` do not count as interested or potential.",
    "Do not include candidates who fail a hard constraint or whose data is missing for a required hard constraint.",
    "Return fewer results, or an empty shortlist, rather than padding the answer with near misses. An empty shortlist plus an explanation in `uncertainty` is the correct answer when nobody qualifies.",
    "First state your interpretive assumptions in `assumptions`: how you read the question's bar (what counts as a match, what you excluded). Be specific enough that a reader can spot a mismatch with their intent.",
    "Rank the `shortlist` by likelihood of matching the query, strongest evidence first, maximum 10 entries.",
    "Every further contact that genuinely meets the bar goes into `additionalMatches` (up to 40) with a one-line reason — never silently drop a qualifying contact.",
    "Prefer a tighter shortlist under a clearly stated bar over an inclusive one; borderline candidates that do NOT meet the bar are named in `uncertainty`, not in additionalMatches.",
    "Tier by strength: the `shortlist` holds STRONG fits only; moderate fits go to `additionalMatches`; weak or vague ones go to neither (mention the count in `uncertainty` if notable).",
    "Specific, quotable evidence supports a match: concrete facts, named things, explicit statements. Generic enthusiasm or broad aspiration is not evidence. When in doubt between moderate and weak, choose weak.",
    "Score every shortlist and additionalMatches entry with `matchStrength` 0-100 — your judged likelihood it matches the question. Scores must be comparable across entries.",
    "Never place a candidate in the shortlist if you describe them as borderline or unverified anywhere in your answer — borderline belongs in `uncertainty`.",
    "Every shortlist entry must include `concerns`; return an empty concerns array only when the evidence genuinely shows none — missing budget, availability, cohort-tag, or logistics information is itself a concern worth naming.",
    "Give each shortlist entry at least two `whyFit` items when the evidence supports them; do not compress justifications as the shortlist grows.",
  ];

  const evidenceInstructions = includeEvidence
    ? [
        "Evidence ids appear inline in each card in square brackets (e.g. `[e12]`); supplemental conversation evidence items are listed in `evidence` with their ids.",
        "Structured facts, tag lists, free-text answers, notes, conflicts, and conversation facts are citeable through their bracketed evidence ids.",
        "Use only supplied evidenceIds inside citations.",
        "Every shortlist entry and every contact assessment must include at least one supplied citation.",
      ]
    : [
        "Do not cite evidence ids and do not include evidence snippets.",
        "Return empty citation arrays for every shortlist entry and contact assessment.",
      ];

  return [
    ...base,
    ...evidenceInstructions,
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
  includeEvidence?: boolean;
  promptCacheKey?: string | null;
};

export function buildAdminAiUserPrompt(input: AdminAiSynthesisInput): string {
  // Key order is deliberate for OpenAI prompt caching, which caches the longest
  // stable *prefix* of the prompt. The large, stable `rawContactCards` block and
  // the static `responseContract`/`scope` come FIRST so they form a cacheable
  // prefix; the per-question `evidence` when enabled, `queryPlan`, and
  // `question` come LAST. Cards are ordered oldest-first by the loader, so new
  // contacts append to the tail and preserve the cached prefix.
  const includeEvidence = input.includeEvidence ?? true;
  return JSON.stringify(
    {
      rawContactCards: input.cards.map((card) => ({
        contactId: card.contactId,
        contactName: card.contactName,
        card: card.text,
      })),
      responseContract: {
        assumptions: ["string"],
        shortlist: [
          {
            contactId: "uuid",
            contactName: "string",
            whyFit: ["string"],
            concerns: ["string"],
            citations: includeEvidence
              ? [{ evidenceId: "string", claimKey: "string" }]
              : [],
            matchStrength: 0,
          },
        ],
        additionalMatches: [
          {
            contactId: "uuid",
            contactName: "string",
            reason: "string",
            matchStrength: 0,
          },
        ],
        contactAssessment: {
          inferredQualities: ["string"],
          concerns: ["string"],
          citations: includeEvidence
            ? [{ evidenceId: "string", claimKey: "string" }]
            : [],
        },
        uncertainty: ["string"],
      },
      scope: input.scope,
      ...(includeEvidence ? { evidence: input.evidence } : {}),
      queryPlan: input.queryPlan,
      question: input.question,
    },
    null,
    2,
  );
}

function citationArraySchema(includeEvidence: boolean) {
  return {
    type: "array",
    ...(includeEvidence ? { minItems: 1 } : {}),
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        evidenceId: { type: "string" },
        claimKey: { type: "string" },
      },
      required: ["evidenceId", "claimKey"],
    },
  };
}

/**
 * JSON schema for Structured Outputs. The provider normalizes `null` /
 * empty-array values back into the app's `AdminAiResponse` shape after parse.
 */
export function buildAdminAiResponseJsonSchema(
  options: { includeEvidence?: boolean } = {},
) {
  const includeEvidence = options.includeEvidence ?? true;
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      assumptions: {
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
            citations: citationArraySchema(includeEvidence),
            matchStrength: { type: "integer", minimum: 0, maximum: 100 },
          },
          required: [
            "contactId",
            "contactName",
            "whyFit",
            "concerns",
            "citations",
            "matchStrength",
          ],
        },
      },
      additionalMatches: {
        type: "array",
        maxItems: 40,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            contactId: { type: "string", format: "uuid" },
            contactName: { type: "string" },
            reason: { type: "string" },
            matchStrength: { type: "integer", minimum: 0, maximum: 100 },
          },
          required: ["contactId", "contactName", "reason", "matchStrength"],
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
              citations: citationArraySchema(includeEvidence),
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
    required: [
      "assumptions",
      "shortlist",
      "additionalMatches",
      "contactAssessment",
      "uncertainty",
    ],
  } as const;
}

export const ADMIN_AI_RESPONSE_JSON_SCHEMA = buildAdminAiResponseJsonSchema({
  includeEvidence: true,
});

export function normalizeProviderResponse(
  payload: {
    assumptions?: string[];
    shortlist: AdminAiResponse["shortlist"] | [];
    additionalMatches?: Array<{
      contactId: string;
      contactName: string;
      reason: string;
    }>;
    contactAssessment: AdminAiResponse["contactAssessment"] | null;
    uncertainty: string[];
  },
  scope: AdminAiScope,
): AdminAiResponse {
  return {
    assumptions: Array.isArray(payload.assumptions) ? payload.assumptions : [],
    shortlist:
      Array.isArray(payload.shortlist) && payload.shortlist.length > 0
        ? payload.shortlist
        : undefined,
    // Strip any stray fields (e.g. a model sneaking citations in) — additional
    // matches are lightweight name + reason only.
    additionalMatches:
      Array.isArray(payload.additionalMatches) &&
      payload.additionalMatches.length > 0
        ? payload.additionalMatches.map((match) => ({
            contactId: match.contactId,
            contactName: match.contactName,
            reason: match.reason,
          }))
        : undefined,
    contactAssessment:
      scope === "global" ? undefined : payload.contactAssessment ?? undefined,
    uncertainty: payload.uncertainty,
  };
}
