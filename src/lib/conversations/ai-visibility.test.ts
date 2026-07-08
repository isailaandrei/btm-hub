import { describe, expect, it } from "vitest";
import {
  computeMessageAiVisibility,
  computeThreadAiVisibility,
  statusDigestExpiry,
  type AiVisibilityDigest,
  type AiVisibilityMessage,
} from "./ai-visibility";

const FRESHNESS_DAYS = 45;
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
    expect(result).toEqual({
      state: "excluded",
      digestSummary: null,
      expiresAt: null,
    });
  });

  it("maps a noise window to noise with no summary leak", () => {
    const result = compute(msg(), [digest({ isNoise: true, summary: "" })]);
    expect(result).toEqual({ state: "noise", digestSummary: null, expiresAt: null });
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
      nowMs: NOW,
    });
    expect(map.get("a")?.state).toBe("profile");
    expect(map.get("b")?.state).toBe("profile");
    expect(map.get("c")?.state).toBe("excluded");
    expect(map.get("d")?.state).toBe("pending");
  });
});
