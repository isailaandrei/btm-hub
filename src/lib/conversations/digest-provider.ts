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
  // The calendar date (YYYY-MM-DD) of the future event the window references —
  // how STATUS content stays visible until the trip happens rather than aging
  // out 45 days after the message. null when the window references no concrete
  // upcoming date. Clamped deterministically (see clampEventDate).
  eventDate: string | null;
  facts: ExtractedConversationFact[];
  model: string;
};

// A model-emitted event_date is coerced to null unless it is a real calendar
// date at most this far in the future — a fail-safe against a hallucinated or
// absurd date silently pinning a digest visible for years. Past dates pass
// (they simply don't extend visibility). Owner-approved 2026-07-12.
const EVENT_DATE_MAX_FUTURE_DAYS = 548; // 18 months
const EVENT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deterministic clamp shared by both provider paths: returns the date only when
 * it is a strict `YYYY-MM-DD` that round-trips to a real calendar day and is no
 * more than 18 months ahead of `nowMs`; otherwise null.
 */
export function clampEventDate(
  raw: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!EVENT_DATE_PATTERN.test(trimmed)) return null;
  const parsed = Date.parse(`${trimmed}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  // Reject overflow dates JS silently rolls forward (e.g. 2026-02-30 -> Mar 2).
  if (new Date(parsed).toISOString().slice(0, 10) !== trimmed) return null;
  if (parsed - nowMs > EVENT_DATE_MAX_FUTURE_DAYS * DAY_MS) return null;
  return trimmed;
}

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
    "If the exchange references a concrete calendar date for an upcoming trip, arrival, booking, or event, return the LATEST such date as `event_date` in YYYY-MM-DD form; otherwise null. STATUS content about a trip stays relevant until the trip happens — `event_date` is how it stays in view instead of aging out on message date.",
    "Clothing and gear sizes (t-shirt, rashguard, wetsuit size, etc.) are PROFILE-grade durable facts: classify such a window PROFILE and emit a fact with fieldKey `apparel_sizes`.",
    "Extract `facts` ONLY for PROFILE-grade content (skills, preferences, decisions, constraints, relationships). STATUS content yields a summary line but NEVER a fact.",
    "Write the `summary` and every fact's `valueText` in ENGLISH, regardless of the language the conversation is in (translate non-English content). Preserve proper nouns as written.",
    "Facts are append-only. If values conflict, keep both facts with the same `conflictGroup`.",
    `Set each fact's \`fieldKey\` to one of these known keys when the fact maps to one, else null: ${FACT_FIELD_KEYS.join(", ")}.`,
    "Each fact has `valueText` (the stated value), `valueJson` (always null), `confidence` (\"high\" | \"medium\" | \"low\"), and `conflictGroup` (a stable grouping key, or null).",
    "Return JSON matching this contract: {\"summary\": \"string\", \"relevance\": \"profile|status|null\", \"event_date\": \"YYYY-MM-DD|null\", \"facts\": [{\"fieldKey\": \"string|null\", \"valueText\": \"string\", \"valueJson\": null, \"confidence\": \"high|medium|low\", \"conflictGroup\": \"string|null\"}]}.",
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
  // Raw model output; clamped to a valid, bounded date in buildExtraction.
  event_date: z.string().nullable().default(null),
  facts: z.array(factSchema).default([]),
});

/**
 * Shared provider-return normalization: applies the deterministic event-date
 * clamp so both the DeepSeek completeJson path and the OpenAI json_schema path
 * yield identical, validated shapes.
 */
function buildExtraction(
  parsed: z.infer<typeof digestExtractionSchema>,
  model: string,
): ConversationDigestExtraction {
  return {
    summary: parsed.summary,
    relevance: parsed.relevance,
    eventDate: clampEventDate(parsed.event_date),
    facts: toExtractedFacts(parsed.facts),
    model,
  };
}

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
  return buildExtraction(parsed.data, model);
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
    event_date: {
      anyOf: [{ type: "string" }, { type: "null" }],
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
  required: ["summary", "relevance", "event_date", "facts"],
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
  return buildExtraction(parsed.data, payload.model ?? model);
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
