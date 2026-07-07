import { z } from "zod/v4";

import { FIELD_REGISTRY } from "@/lib/admin/contacts/field-registry";
import { getAdminAiProvider } from "@/lib/admin-ai/provider";
import type { ExtractedConversationFact } from "./facts";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.4";
const REQUEST_TIMEOUT_MS = 60_000;

export type ConversationDigestRelevance = "profile" | "status";

export type ConversationDigestExtraction = {
  summary: string;
  // Signal windows are "profile" (durable) or "status" (short-lived); noise
  // windows (empty summary) are null.
  relevance: ConversationDigestRelevance | null;
  facts: ExtractedConversationFact[];
  model: string;
};

// Fact fieldKey allowlist surfaced to the model, derived from the shared field
// registry so a new curated column automatically joins it. Facts legitimately
// map to text fields too (languages, occupation), so this is the full key set;
// anything that maps to none of these gets fieldKey null.
const FACT_FIELD_KEYS: readonly string[] = Object.freeze(
  Array.from(new Set(FIELD_REGISTRY.map((entry) => entry.key))),
);

/**
 * Signal/noise digest contract shared by both provider paths. The model decides
 * signal vs noise; a window with NO signal returns an empty summary, which the
 * pipeline records as a noise-marker row.
 */
export function buildDigestSystemPrompt(): string {
  return [
    "You distill a WhatsApp conversation window into durable CRM memory about the contact. Classify the window into one of three kinds:",
    "PROFILE — durable, about the person: skills, preferences, aspirations, relationships or referrals, personality, and DECISIONS (joining, declining, postponing, confirming, commitments). A dated commitment (e.g. 'confirmed July 24-Aug 4') is PROFILE — it stays meaningful as history.",
    "STATUS — operational and short-lived: arrival times, flight/taxi/accommodation logistics, 'waiting on X', 'ready to book'. Useful for about a trip cycle, then it should leave the AI's view.",
    "NOISE — ignore entirely: greetings, thanks, emoji-only messages, link drops without discussion, broadcast/campaign-style outbound with no reply. CALL/MEETING SCHEDULING IS ALWAYS NOISE, however specific (e.g. 'free Monday afternoon', 'let's talk Tuesday'). 'Availability' counts as SIGNAL only when it is about joining a trip or program, never about scheduling a chat.",
    'If the window is entirely NOISE, return {"summary": "", "relevance": null, "facts": []} — this is a valid, expected outcome.',
    'When there IS signal, write a concise `summary` (2-4 sentences) of what an admin should remember, and set `relevance` to "profile" or "status" by the DOMINANT content of the window. When a window mixes a durable kernel with logistics, put the durable kernel into `facts` and tag the summary by what remains.',
    "Extract `facts` ONLY for PROFILE-grade content (skills, preferences, decisions, constraints, relationships). STATUS content yields a summary line but NEVER a fact.",
    "Write the `summary` and every fact's `valueText` in ENGLISH, regardless of the language the conversation is in (translate non-English content). Preserve proper nouns as written.",
    "Facts are append-only. If values conflict, keep both facts with the same `conflictGroup`.",
    `Set each fact's \`fieldKey\` to one of these known keys when the fact maps to one, else null: ${FACT_FIELD_KEYS.join(", ")}.`,
    "Each fact has `valueText` (the stated value), `valueJson` (always null), `confidence` (\"high\" | \"medium\" | \"low\"), and `conflictGroup` (a stable grouping key, or null).",
    "Return JSON matching this contract: {\"summary\": \"string\", \"relevance\": \"profile|status|null\", \"facts\": [{\"fieldKey\": \"string|null\", \"valueText\": \"string\", \"valueJson\": null, \"confidence\": \"high|medium|low\", \"conflictGroup\": \"string|null\"}]}.",
  ].join(" ");
}

const factSchema = z.object({
  fieldKey: z.string().nullable().default(null),
  valueText: z.string(),
  valueJson: z.unknown().nullable().default(null),
  confidence: z.enum(["high", "medium", "low"]),
  conflictGroup: z.string().nullable().default(null),
});

const digestExtractionSchema = z.object({
  summary: z.string(),
  relevance: z.enum(["profile", "status"]).nullable().default(null),
  facts: z.array(factSchema).default([]),
});

function toExtractedFacts(
  facts: z.infer<typeof digestExtractionSchema>["facts"],
): ExtractedConversationFact[] {
  return facts.map((fact) => ({
    fieldKey: fact.fieldKey,
    valueText: fact.valueText,
    valueJson: fact.valueJson ?? null,
    confidence: fact.confidence,
    conflictGroup: fact.conflictGroup,
  }));
}

// ---------------------------------------------------------------------------
// DeepSeek path (json_object via the shared admin-AI provider's completeJson —
// temperature 0, retry-once, and a bounded timeout come for free).
// ---------------------------------------------------------------------------

async function extractViaCompleteJson(
  completeJson: NonNullable<
    ReturnType<typeof getAdminAiProvider>["completeJson"]
  >,
  transcript: string,
): Promise<ConversationDigestExtraction> {
  const { json, modelMetadata } = await completeJson({
    systemPrompt: buildDigestSystemPrompt(),
    userPrompt: transcript,
    scope: "global",
  });
  const parsed = digestExtractionSchema.safeParse(json);
  if (!parsed.success) {
    // Fail loud: completeJson already retried once for parseability, so a
    // shape mismatch here is a genuine contract violation, not transient.
    throw new Error(
      `Conversation digest returned JSON that failed schema validation: ${parsed.error.message}`,
    );
  }
  const model =
    typeof modelMetadata.model === "string" ? modelMetadata.model : "deepseek";
  return {
    summary: parsed.data.summary,
    relevance: parsed.data.relevance,
    facts: toExtractedFacts(parsed.data.facts),
    model,
  };
}

// ---------------------------------------------------------------------------
// OpenAI Responses fallback (strict json_schema) — used when the resolved
// provider has no completeJson (ADMIN_AI_PROVIDER=openai).
// ---------------------------------------------------------------------------

const DIGEST_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    relevance: {
      anyOf: [{ type: "string", enum: ["profile", "status"] }, { type: "null" }],
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fieldKey: { anyOf: [{ type: "string" }, { type: "null" }] },
          valueText: { type: "string" },
          valueJson: { type: "null" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          conflictGroup: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: [
          "fieldKey",
          "valueText",
          "valueJson",
          "confidence",
          "conflictGroup",
        ],
      },
    },
  },
  required: ["summary", "relevance", "facts"],
} as const;

type OpenAiResponsePayload = {
  id?: string;
  model?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
};

function getOpenAiApiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

function getOpenAiModel(): string {
  return (
    process.env.OPENAI_CONVERSATION_DIGEST_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    DEFAULT_MODEL
  );
}

function extractText(payload: OpenAiResponsePayload): string {
  const text: string[] = [];
  const refusals: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        text.push(content.text);
      }
      if (content.type === "refusal" && typeof content.refusal === "string") {
        refusals.push(content.refusal);
      }
    }
  }
  if (text.length > 0) return text.join("\n");
  if (refusals.length > 0) {
    throw new Error(`Conversation digest model refused: ${refusals.join(" ")}`);
  }
  throw new Error("Conversation digest model returned no structured text.");
}

async function extractViaOpenAi(
  transcript: string,
): Promise<ConversationDigestExtraction> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) throw new Error("OpenAI conversation digest is not configured.");
  const model = getOpenAiModel();
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: buildDigestSystemPrompt() },
        { role: "user", content: transcript },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "conversation_digest",
          strict: true,
          schema: DIGEST_JSON_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Conversation digest model failed: ${response.statusText}`);
  }
  const payload = (await response.json()) as OpenAiResponsePayload;
  const parsed = digestExtractionSchema.safeParse(
    JSON.parse(extractText(payload)),
  );
  if (!parsed.success) {
    throw new Error(
      `Conversation digest returned JSON that failed schema validation: ${parsed.error.message}`,
    );
  }
  return {
    summary: parsed.data.summary,
    relevance: parsed.data.relevance,
    facts: toExtractedFacts(parsed.data.facts),
    model: payload.model ?? model,
  };
}

/**
 * Extract a conversation-window digest. Routes through the shared admin-AI
 * provider: DeepSeek (via `completeJson`, json_object) when available, otherwise
 * the OpenAI Responses json_schema path. Fails loud on invalid output.
 */
export async function extractConversationDigest(input: {
  transcript: string;
}): Promise<ConversationDigestExtraction> {
  const provider = getAdminAiProvider();
  if (provider.completeJson) {
    return extractViaCompleteJson(
      provider.completeJson.bind(provider),
      input.transcript,
    );
  }
  return extractViaOpenAi(input.transcript);
}
