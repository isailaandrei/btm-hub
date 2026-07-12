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
  /** Effective event date (YYYY-MM-DD) of the window, or null. Extends STATUS
   * visibility until the event (see statusDigestExpiry). */
  eventDate: string | null;
  /** Correction join key — lets the thread UI open a correction editor keyed to
   * the exact window a message maps to. */
  contentHash: string;
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
  /** Effective event date driving/extending status visibility, else null. */
  eventDate: string | null;
  /** True when the event date (not message age) set `expiresAt` — lets the UI
   * say WHY a status digest is visible until the date it shows. */
  expiryEventDriven: boolean;
  /** content_hash of the covering digest window when the message maps to one
   * (profile/status/noise, and removed-after-digestion) — the correction editor
   * key. null for pending/undigested and outbound/unmatched messages. */
  digestContentHash: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Effective status-digest expiry AND which rule set it. Visibility ends at
 * `max(windowEnd + freshnessDays, eventDate + eventGraceDays)`: the message-age
 * rule keeps recent no-date exchanges in view; the event rule keeps a distant
 * dated commitment in view until the event happens. Pure — the caller passes
 * `eventGraceDays` (STATUS_EVENT_GRACE_DAYS) so this module imports no server code.
 */
export function statusDigestExpiryParts(
  windowEnd: string,
  freshnessDays: number,
  eventDate: string | null,
  eventGraceDays: number,
): { expiresAt: string; eventDriven: boolean } {
  const messageExpiryMs = Date.parse(windowEnd) + freshnessDays * DAY_MS;
  const eventExpiryMs =
    eventDate !== null
      ? Date.parse(`${eventDate}T00:00:00.000Z`) + eventGraceDays * DAY_MS
      : Number.NaN;
  if (Number.isFinite(eventExpiryMs) && eventExpiryMs > messageExpiryMs) {
    return { expiresAt: new Date(eventExpiryMs).toISOString(), eventDriven: true };
  }
  return { expiresAt: new Date(messageExpiryMs).toISOString(), eventDriven: false };
}

/**
 * Effective status-digest expiry ISO. `eventDate`/`eventGraceDays` default to
 * the message-age-only rule so existing 2-arg callers are unchanged.
 */
export function statusDigestExpiry(
  windowEnd: string,
  freshnessDays: number,
  eventDate: string | null = null,
  eventGraceDays = 0,
): string {
  return statusDigestExpiryParts(
    windowEnd,
    freshnessDays,
    eventDate,
    eventGraceDays,
  ).expiresAt;
}

export function computeMessageAiVisibility(input: {
  message: AiVisibilityMessage;
  digests: AiVisibilityDigest[];
  freshnessDays: number;
  eventGraceDays: number;
  nowMs: number;
}): MessageAiVisibility {
  const { message, digests, freshnessDays, eventGraceDays, nowMs } = input;

  const happenedMs = Date.parse(message.happenedAt);
  // Window bounds are inclusive: they are derived from the first/last message
  // timestamps of the window, so edge messages sit exactly ON a bound.
  const findWindow = () =>
    digests.find(
      (candidate) =>
        happenedMs >= Date.parse(candidate.windowStart) &&
        happenedMs <= Date.parse(candidate.windowEnd),
    );

  const base = {
    digestSummary: null,
    expiresAt: null,
    eventDate: null,
    expiryEventDriven: false,
    digestContentHash: null,
  } satisfies Omit<MessageAiVisibility, "state">;

  if (message.direction !== "inbound" || message.matchStatus !== "matched") {
    // Outbound/unmatched messages were NEVER digested — a window merely
    // overlapping their timestamp read only the inbound side, so no summary
    // is attached (it would falsely imply the AI saw this message).
    return { state: "excluded", ...base };
  }

  if (message.deactivatedAt !== null) {
    // Removed AFTER digestion: the covering digest was built while this
    // message was active, so its content may still be referenced by the AI
    // until a recalibration wipe rebuilds digests without it. Attach the
    // summary so the tooltip can say so honestly, and the content hash so the
    // covering window can still be corrected.
    const covering = findWindow();
    return {
      state: "excluded",
      ...base,
      digestSummary: covering && !covering.isNoise ? covering.summary : null,
      digestContentHash: covering?.contentHash ?? null,
    };
  }

  const digest = findWindow();
  if (!digest) {
    return { state: "pending", ...base };
  }

  if (digest.isNoise) {
    return { state: "noise", ...base, digestContentHash: digest.contentHash };
  }
  if (digest.relevance === "profile") {
    return {
      state: "profile",
      ...base,
      digestSummary: digest.summary,
      digestContentHash: digest.contentHash,
    };
  }
  // Signal digests are 'profile' or 'status' by DB CHECK; treat anything else
  // as status so an unexpected value degrades to the more conservative state.
  const { expiresAt, eventDriven } = statusDigestExpiryParts(
    digest.windowEnd,
    freshnessDays,
    digest.eventDate,
    eventGraceDays,
  );
  return {
    state: Date.parse(expiresAt) > nowMs ? "status-fresh" : "status-aged",
    digestSummary: digest.summary,
    expiresAt,
    eventDate: digest.eventDate,
    expiryEventDriven: eventDriven,
    digestContentHash: digest.contentHash,
  };
}

/** Bucket a whole thread at once (keyed by any message id the caller uses). */
export function computeThreadAiVisibility<
  T extends AiVisibilityMessage & { id: string },
>(input: {
  messages: T[];
  digests: AiVisibilityDigest[];
  freshnessDays: number;
  eventGraceDays: number;
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
        eventGraceDays: input.eventGraceDays,
        nowMs: input.nowMs,
      }),
    );
  }
  return result;
}
