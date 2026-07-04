/**
 * Dev-only instrumentation: an exact token/segment breakdown of the OpenAI
 * request the admin AI is about to send. Loaded lazily (only when
 * ADMIN_AI_PRINT_OPENAI_PAYLOAD is on) so `gpt-tokenizer` never ships in the
 * production request path.
 *
 * gpt-5.x tokenizes with OpenAI's `o200k_base` BPE, so these local counts match
 * the model's *text* tokenization exactly. The billed `usage.input_tokens` adds
 * a small, fixed per-message framing overhead plus the structured-output schema,
 * so treat the API `usage` as ground truth for dollars and treat this report as
 * the map of *where* the tokens live and *how the prompt cache splits*.
 */
import { encode } from "gpt-tokenizer/encoding/o200k_base";

export type PayloadSegment = {
  label: string;
  chars: number;
  tokens: number;
};

export type CacheBucket = {
  label: string;
  chars: number;
  tokens: number;
};

export type CardStat = {
  contactId: string;
  contactName: string;
  chars: number;
  tokens: number;
};

export type AdminAiPayloadInspection = {
  model: string;
  scope: string;
  includeEvidence: boolean;
  /** Ordered, human-readable breakdown of every part of the request body. */
  segments: PayloadSegment[];
  /** System + rawContactCards + responseContract + scope — the cacheable prefix. */
  stablePrefix: CacheBucket;
  /** (evidence) + queryPlan + question — re-billed at full price every request. */
  volatileTail: CacheBucket;
  /** Structured-output JSON schema (sent in `text.format`, not in the messages). */
  schema: PayloadSegment;
  /** Exact token count of the two chat messages (system + user), text only. */
  messagesTokens: number;
  /** messagesTokens + schema tokens — the local estimate of billed input. */
  estimatedInputTokens: number;
  cardCount: number;
  /** Largest contact cards by token count (top 10). */
  largestCards: CardStat[];
};

// The user prompt is `JSON.stringify(obj, null, 2)`; top-level keys are printed
// at exactly two spaces of indentation, in this deliberate order (cacheable head
// first, per-question tail last).
const USER_PROMPT_KEY_ORDER = [
  "rawContactCards",
  "responseContract",
  "scope",
  "evidence",
  "queryPlan",
  "question",
] as const;

const PREFIX_KEYS = new Set(["rawContactCards", "responseContract", "scope"]);

const SEGMENT_LABELS: Record<string, string> = {
  rawContactCards: "user · rawContactCards (corpus)",
  responseContract: "user · responseContract",
  scope: "user · scope",
  evidence: "user · evidence",
  queryPlan: "user · queryPlan",
  question: "user · question",
};

function measure(label: string, text: string): PayloadSegment {
  return { label, chars: text.length, tokens: encode(text).length };
}

/**
 * Split the pretty-printed user-prompt string into contiguous slices keyed by
 * its top-level fields. Slices are exact substrings that concatenate back to the
 * whole prompt, so their char counts sum exactly; token sums differ from the
 * whole-string count only by a few tokens at slice seams (negligible at scale).
 */
function sliceUserPrompt(userPrompt: string): Array<{ key: string; text: string }> {
  const markers = USER_PROMPT_KEY_ORDER.map((key) => ({
    key,
    idx: userPrompt.indexOf(`\n  "${key}":`),
  }))
    .filter((m) => m.idx >= 0)
    .sort((a, b) => a.idx - b.idx);

  return markers.map((marker, i) => {
    const start = i === 0 ? 0 : marker.idx;
    const end = i + 1 < markers.length ? markers[i + 1].idx : userPrompt.length;
    return { key: marker.key, text: userPrompt.slice(start, end) };
  });
}

function summarizeCards(userPrompt: string): { cardCount: number; largestCards: CardStat[] } {
  try {
    const parsed = JSON.parse(userPrompt) as {
      rawContactCards?: Array<{ contactId: string; contactName: string; card: string }>;
    };
    const cards = parsed.rawContactCards ?? [];
    const stats: CardStat[] = cards.map((card) => ({
      contactId: card.contactId,
      contactName: card.contactName,
      chars: card.card.length,
      tokens: encode(card.card).length,
    }));
    stats.sort((a, b) => b.tokens - a.tokens);
    return { cardCount: cards.length, largestCards: stats.slice(0, 10) };
  } catch {
    return { cardCount: 0, largestCards: [] };
  }
}

export function inspectAdminAiPayload(input: {
  model: string;
  scope: string;
  includeEvidence: boolean;
  systemPrompt: string;
  userPrompt: string;
  schema: object;
}): AdminAiPayloadInspection {
  const systemSegment = measure("system prompt", input.systemPrompt);
  const userSlices = sliceUserPrompt(input.userPrompt);

  const segments: PayloadSegment[] = [
    systemSegment,
    ...userSlices.map((slice) =>
      measure(SEGMENT_LABELS[slice.key] ?? `user · ${slice.key}`, slice.text),
    ),
  ];

  const prefixText =
    input.systemPrompt +
    userSlices
      .filter((slice) => PREFIX_KEYS.has(slice.key))
      .map((slice) => slice.text)
      .join("");
  const tailText = userSlices
    .filter((slice) => !PREFIX_KEYS.has(slice.key))
    .map((slice) => slice.text)
    .join("");

  const stablePrefix: CacheBucket = {
    label: "STABLE PREFIX (system + cards + contract + scope) — cacheable",
    chars: prefixText.length,
    tokens: encode(prefixText).length,
  };
  const volatileTail: CacheBucket = {
    label: "VOLATILE TAIL (queryPlan + question) — re-billed every request",
    chars: tailText.length,
    tokens: encode(tailText).length,
  };

  const schemaJson = JSON.stringify(input.schema);
  const schema = measure("structured-output schema (text.format)", schemaJson);

  const messagesTokens = systemSegment.tokens + encode(input.userPrompt).length;
  const { cardCount, largestCards } = summarizeCards(input.userPrompt);

  return {
    model: input.model,
    scope: input.scope,
    includeEvidence: input.includeEvidence,
    segments,
    stablePrefix,
    volatileTail,
    schema,
    messagesTokens,
    estimatedInputTokens: messagesTokens + schema.tokens,
    cardCount,
    largestCards,
  };
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : " ".repeat(width - value.length) + value;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** Render the inspection as an aligned, terminal-friendly report. */
export function formatAdminAiPayloadReport(
  inspection: AdminAiPayloadInspection,
): string {
  const lines: string[] = [];
  const total = inspection.estimatedInputTokens;

  lines.push("=".repeat(78));
  lines.push(
    `ADMIN-AI OPENAI REQUEST · scope=${inspection.scope} · model=${inspection.model} · evidence=${inspection.includeEvidence ? "on" : "off"}`,
  );
  lines.push(
    `tokenizer=o200k_base (exact for gpt-5.x text, approximate for other models) · cards=${fmt(inspection.cardCount)}`,
  );
  lines.push("=".repeat(78));
  lines.push("");
  lines.push(
    `${pad("SEGMENT", 40)}${padStart("CHARS", 12)}${padStart("TOKENS", 12)}${padStart("% TOK", 8)}`,
  );
  lines.push("-".repeat(78));
  for (const seg of inspection.segments) {
    const pct = total > 0 ? ((seg.tokens / total) * 100).toFixed(1) : "0.0";
    lines.push(
      `${pad(seg.label, 40)}${padStart(fmt(seg.chars), 12)}${padStart(fmt(seg.tokens), 12)}${padStart(`${pct}%`, 8)}`,
    );
  }
  lines.push(
    `${pad(inspection.schema.label, 40)}${padStart(fmt(inspection.schema.chars), 12)}${padStart(fmt(inspection.schema.tokens), 12)}${padStart(total > 0 ? `${((inspection.schema.tokens / total) * 100).toFixed(1)}%` : "0.0%", 8)}`,
  );
  lines.push("-".repeat(78));
  lines.push(
    `${pad("TOTAL (messages + schema ≈ billed input)", 40)}${padStart("", 12)}${padStart(fmt(total), 12)}${padStart("100%", 8)}`,
  );
  lines.push("");
  lines.push("PROMPT-CACHE SPLIT");
  lines.push(
    `  ${pad(inspection.stablePrefix.label, 62)}${padStart(fmt(inspection.stablePrefix.tokens), 10)}`,
  );
  lines.push(
    `  ${pad(inspection.volatileTail.label, 62)}${padStart(fmt(inspection.volatileTail.tokens), 10)}`,
  );
  const cacheablePct =
    inspection.messagesTokens > 0
      ? (
          (inspection.stablePrefix.tokens / inspection.messagesTokens) *
          100
        ).toFixed(1)
      : "0.0";
  lines.push(
    `  → ${cacheablePct}% of the message tokens are a stable prefix (cache-eligible on warm calls).`,
  );
  lines.push("");
  if (inspection.largestCards.length > 0) {
    lines.push("LARGEST CONTACT CARDS (top 10 by tokens)");
    lines.push(
      `  ${pad("CONTACT", 44)}${padStart("CHARS", 12)}${padStart("TOKENS", 10)}`,
    );
    for (const card of inspection.largestCards) {
      const name = `${card.contactName} (${card.contactId.slice(0, 8)})`;
      lines.push(
        `  ${pad(name.slice(0, 44), 44)}${padStart(fmt(card.chars), 12)}${padStart(fmt(card.tokens), 10)}`,
      );
    }
    lines.push("");
  }
  lines.push(
    "NOTE: billed input = usage.input_tokens (adds ~3-8 msg-framing tokens + schema",
  );
  lines.push(
    "compile). On warm calls, usage.input_tokens_details.cached_tokens ≈ the STABLE",
  );
  lines.push("PREFIX above. Both are printed from the live response by DEBUG_ADMIN_AI.");
  lines.push("=".repeat(78));
  return lines.join("\n");
}
