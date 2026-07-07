/**
 * Per-message AI-visibility bucketing — the calibration surface for the digest
 * taxonomy. The AI never reads raw WhatsApp messages; it reads
 * `conversation_digests` (window summaries) + `conversation_facts`. This maps
 * each thread message to what the AI actually holds for it.
 *
 * PURE and client-safe by design: no server imports. Callers pass the
 * freshness horizon (`STATUS_DIGEST_FRESHNESS_DAYS` from the card loader) and
 * `nowMs` explicitly.
 *
 * All messages inside a digest window share its fate — the digest summarizes
 * the whole exchange, not individual lines.
 */

export type MessageAiState =
  | "profile" // in AI memory permanently (durable profile signal)
  | "status-fresh" // in AI memory until windowEnd + freshnessDays
  | "status-aged" // was status signal; aged out of AI memory
  | "noise" // digested and filtered — AI never sees it
  | "pending" // inbound + matched but not yet digested
  | "excluded"; // outbound / unmatched / removed — never shared with AI

export interface AiVisibilityDigest {
  windowStart: string;
  windowEnd: string;
  isNoise: boolean;
  relevance: "profile" | "status" | null;
  summary: string;
}

export interface AiVisibilityMessage {
  direction: "inbound" | "outbound";
  matchStatus: "matched" | "unmatched" | "ambiguous";
  deactivatedAt: string | null;
  happenedAt: string;
}

export interface MessageAiVisibility {
  state: MessageAiState;
  /** What the AI holds for this exchange (signal digests only). */
  digestSummary: string | null;
  /** status-fresh: when it ages out; status-aged: when it aged out. */
  expiresAt: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function statusDigestExpiry(
  windowEnd: string,
  freshnessDays: number,
): string {
  return new Date(Date.parse(windowEnd) + freshnessDays * DAY_MS).toISOString();
}

export function computeMessageAiVisibility(input: {
  message: AiVisibilityMessage;
  digests: AiVisibilityDigest[];
  freshnessDays: number;
  nowMs: number;
}): MessageAiVisibility {
  const { message, digests, freshnessDays, nowMs } = input;

  if (
    message.direction !== "inbound" ||
    message.matchStatus !== "matched" ||
    message.deactivatedAt !== null
  ) {
    return { state: "excluded", digestSummary: null, expiresAt: null };
  }

  const happenedMs = Date.parse(message.happenedAt);
  // Window bounds are inclusive: they are derived from the first/last message
  // timestamps of the window, so edge messages sit exactly ON a bound.
  const digest = digests.find(
    (candidate) =>
      happenedMs >= Date.parse(candidate.windowStart) &&
      happenedMs <= Date.parse(candidate.windowEnd),
  );
  if (!digest) {
    return { state: "pending", digestSummary: null, expiresAt: null };
  }

  if (digest.isNoise) {
    return { state: "noise", digestSummary: null, expiresAt: null };
  }
  if (digest.relevance === "profile") {
    return { state: "profile", digestSummary: digest.summary, expiresAt: null };
  }
  // Signal digests are 'profile' or 'status' by DB CHECK; treat anything else
  // as status so an unexpected value degrades to the more conservative state.
  const expiresAt = statusDigestExpiry(digest.windowEnd, freshnessDays);
  return {
    state: Date.parse(expiresAt) > nowMs ? "status-fresh" : "status-aged",
    digestSummary: digest.summary,
    expiresAt,
  };
}

/** Bucket a whole thread at once (keyed by any message id the caller uses). */
export function computeThreadAiVisibility<
  T extends AiVisibilityMessage & { id: string },
>(input: {
  messages: T[];
  digests: AiVisibilityDigest[];
  freshnessDays: number;
  nowMs: number;
}): Map<string, MessageAiVisibility> {
  const result = new Map<string, MessageAiVisibility>();
  for (const message of input.messages) {
    result.set(
      message.id,
      computeMessageAiVisibility({
        message,
        digests: input.digests,
        freshnessDays: input.freshnessDays,
        nowMs: input.nowMs,
      }),
    );
  }
  return result;
}
