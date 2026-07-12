import { describe, expect, it } from "vitest";
import {
  computeMessageAiVisibility,
  computeThreadAiVisibility,
  statusDigestExpiry,
  statusDigestExpiryParts,
  type AiVisibilityDigest,
  type AiVisibilityMessage,
} from "./ai-visibility";

const FRESHNESS_DAYS = 45;
const EVENT_GRACE_DAYS = 14;
const NOW = Date.parse("2026-07-07T12:00:00.000Z");

function msg(overrides: Partial<AiVisibilityMessage> = {}): AiVisibilityMessage {
  return {
    direction: "inbound",
    matchStatus: "matched",
    deactivatedAt: null,
    happenedAt: "2026-07-01T10:15:00.000Z",
    ...overrides,
  };
}

function digest(overrides: Partial<AiVisibilityDigest> = {}): AiVisibilityDigest {
  return {
    windowStart: "2026-07-01T10:00:00.000Z",
    windowEnd: "2026-07-01T10:30:00.000Z",
    isNoise: false,
    relevance: "profile",
    summary: "Wants to film a shark documentary.",
    eventDate: null,
    contentHash: "a".repeat(64),
    ...overrides,
  };
}

function compute(
  message: AiVisibilityMessage,
  digests: AiVisibilityDigest[],
  nowMs = NOW,
) {
  return computeMessageAiVisibility({
    message,
    digests,
    freshnessDays: FRESHNESS_DAYS,
    eventGraceDays: EVENT_GRACE_DAYS,
    nowMs,
  });
}

describe("computeMessageAiVisibility", () => {
  it("excludes outbound, unmatched, and removed messages regardless of digests", () => {
    const d = [digest()];
    expect(compute(msg({ direction: "outbound" }), d).state).toBe("excluded");
    expect(compute(msg({ matchStatus: "unmatched" }), d).state).toBe("excluded");
    expect(compute(msg({ matchStatus: "ambiguous" }), d).state).toBe("excluded");
    expect(
      compute(msg({ deactivatedAt: "2026-07-02T00:00:00.000Z" }), d).state,
    ).toBe("excluded");
  });

  it("maps a profile window to profile with the digest summary", () => {
    expect(compute(msg(), [digest()])).toEqual({
      state: "profile",
      digestSummary: "Wants to film a shark documentary.",
      expiresAt: null,
      eventDate: null,
      expiryEventDriven: false,
      digestContentHash: "a".repeat(64),
    });
  });

  it("maps a fresh status window to status-fresh with its expiry", () => {
    const result = compute(msg(), [digest({ relevance: "status" })]);
    expect(result.state).toBe("status-fresh");
    expect(result.expiresAt).toBe(
      statusDigestExpiry("2026-07-01T10:30:00.000Z", FRESHNESS_DAYS),
    );
    expect(result.digestSummary).toContain("shark");
  });

  it("ages a status window out after the freshness horizon", () => {
    const old = digest({
      relevance: "status",
      windowStart: "2026-01-01T10:00:00.000Z",
      windowEnd: "2026-01-01T10:30:00.000Z",
    });
    const result = compute(msg({ happenedAt: "2026-01-01T10:10:00.000Z" }), [old]);
    expect(result.state).toBe("status-aged");
    expect(result.expiresAt).toBe(
      statusDigestExpiry("2026-01-01T10:30:00.000Z", FRESHNESS_DAYS),
    );
  });

  it("attaches the covering digest summary to messages removed AFTER digestion", () => {
    const result = compute(
      msg({ deactivatedAt: "2026-07-05T00:00:00.000Z" }),
      [digest()],
    );
    expect(result.state).toBe("excluded");
    expect(result.digestSummary).toContain("shark");
  });

  it("never attaches a summary to outbound/unmatched messages inside a window", () => {
    const d = [digest()];
    expect(compute(msg({ direction: "outbound" }), d).digestSummary).toBeNull();
    expect(
      compute(msg({ matchStatus: "unmatched" }), d).digestSummary,
    ).toBeNull();
  });

  it("attaches no summary to a removed message covered only by a noise window", () => {
    const result = compute(
      msg({ deactivatedAt: "2026-07-05T00:00:00.000Z" }),
      [digest({ isNoise: true, summary: "" })],
    );
    // No summary leaks, but the covering window's hash is still exposed so its
    // (mis)label could be corrected — the excluded badge for it stays hidden.
    expect(result).toEqual({
      state: "excluded",
      digestSummary: null,
      expiresAt: null,
      eventDate: null,
      expiryEventDriven: false,
      digestContentHash: "a".repeat(64),
    });
  });

  it("maps a noise window to noise with no summary leak", () => {
    const result = compute(msg(), [digest({ isNoise: true, summary: "" })]);
    expect(result).toEqual({
      state: "noise",
      digestSummary: null,
      expiresAt: null,
      eventDate: null,
      expiryEventDriven: false,
      digestContentHash: "a".repeat(64),
    });
  });

  it("treats messages exactly on window bounds as inside the window", () => {
    const d = [digest()];
    expect(compute(msg({ happenedAt: "2026-07-01T10:00:00.000Z" }), d).state).toBe(
      "profile",
    );
    expect(compute(msg({ happenedAt: "2026-07-01T10:30:00.000Z" }), d).state).toBe(
      "profile",
    );
  });

  it("marks undigested messages (newer than every window) as pending", () => {
    const result = compute(msg({ happenedAt: "2026-07-06T09:00:00.000Z" }), [
      digest(),
    ]);
    expect(result.state).toBe("pending");
  });

  it("is pending when the contact has no digests at all", () => {
    expect(compute(msg(), []).state).toBe("pending");
  });
});

describe("statusDigestExpiry event-awareness", () => {
  const WINDOW_END = "2026-07-01T10:30:00.000Z";
  // window_end + 45d.
  const MESSAGE_EXPIRY = "2026-08-15T10:30:00.000Z";

  it("uses the 45-day message rule when there is no event date", () => {
    expect(statusDigestExpiry(WINDOW_END, FRESHNESS_DAYS, null, EVENT_GRACE_DAYS))
      .toBe(MESSAGE_EXPIRY);
    // Back-compat: the 2-arg form is the message-age rule.
    expect(statusDigestExpiry(WINDOW_END, FRESHNESS_DAYS)).toBe(MESSAGE_EXPIRY);
  });

  it("uses event_date + grace when it extends past the 45-day window", () => {
    const parts = statusDigestExpiryParts(
      WINDOW_END,
      FRESHNESS_DAYS,
      "2026-09-01",
      EVENT_GRACE_DAYS,
    );
    // 2026-09-01 + 14d.
    expect(parts.expiresAt).toBe("2026-09-15T00:00:00.000Z");
    expect(parts.eventDriven).toBe(true);
  });

  it("keeps the 45-day rule when the event is earlier than window_end + 45d", () => {
    const parts = statusDigestExpiryParts(
      WINDOW_END,
      FRESHNESS_DAYS,
      "2026-07-10",
      EVENT_GRACE_DAYS,
    );
    expect(parts.expiresAt).toBe(MESSAGE_EXPIRY);
    expect(parts.eventDriven).toBe(false);
  });

  it("keeps a status window visible when the event has not passed, though its window aged out", () => {
    // Old window (would age out 2026-02-15) but a future event pins it fresh.
    const result = compute(
      msg({ happenedAt: "2026-01-01T10:10:00.000Z" }),
      [
        digest({
          relevance: "status",
          windowStart: "2026-01-01T10:00:00.000Z",
          windowEnd: "2026-01-01T10:30:00.000Z",
          eventDate: "2026-08-01",
        }),
      ],
    );
    expect(result.state).toBe("status-fresh");
    expect(result.expiryEventDriven).toBe(true);
    expect(result.eventDate).toBe("2026-08-01");
    // 2026-08-01 + 14d.
    expect(result.expiresAt).toBe("2026-08-15T00:00:00.000Z");
  });

  it("ages out once even the event + grace has passed", () => {
    const result = compute(
      msg({ happenedAt: "2026-01-01T10:10:00.000Z" }),
      [
        digest({
          relevance: "status",
          windowStart: "2026-01-01T10:00:00.000Z",
          windowEnd: "2026-01-01T10:30:00.000Z",
          // Event + 14d = 2026-06-15, before NOW (2026-07-07).
          eventDate: "2026-06-01",
        }),
      ],
    );
    expect(result.state).toBe("status-aged");
    expect(result.expiryEventDriven).toBe(true);
  });
});

describe("computeThreadAiVisibility", () => {
  it("buckets every message by id, sharing the window's fate", () => {
    const messages = [
      { id: "a", ...msg({ happenedAt: "2026-07-01T10:05:00.000Z" }) },
      { id: "b", ...msg({ happenedAt: "2026-07-01T10:25:00.000Z" }) },
      { id: "c", ...msg({ direction: "outbound" as const }) },
      { id: "d", ...msg({ happenedAt: "2026-07-07T11:00:00.000Z" }) },
    ];
    const map = computeThreadAiVisibility({
      messages,
      digests: [digest()],
      freshnessDays: FRESHNESS_DAYS,
      eventGraceDays: EVENT_GRACE_DAYS,
      nowMs: NOW,
    });
    expect(map.get("a")?.state).toBe("profile");
    expect(map.get("b")?.state).toBe("profile");
    expect(map.get("c")?.state).toBe("excluded");
    expect(map.get("d")?.state).toBe("pending");
  });
});
