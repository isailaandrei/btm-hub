import { describe, expect, it } from "vitest";
import { buildDigestContentHash, buildDigestWindow } from "./digests";

describe("conversation digests", () => {
  it("builds deterministic content hashes from covered message ids", () => {
    expect(buildDigestContentHash(["m2", "m1"])).toBe(
      buildDigestContentHash(["m1", "m2"]),
    );
    expect(buildDigestContentHash(["m1"])).not.toBe(
      buildDigestContentHash(["m1", "m2"]),
    );
  });

  it("builds digest windows from chronological messages", () => {
    const window = buildDigestWindow([
      {
        id: "m1",
        contactId: "contact-1",
        direction: "inbound",
        body: "Hello",
        happenedAt: "2026-06-11T10:00:00Z",
      },
      {
        id: "m2",
        contactId: "contact-1",
        direction: "outbound",
        body: "Budget is around $5k",
        happenedAt: "2026-06-11T10:10:00Z",
      },
    ]);

    expect(window).toEqual({
      contactId: "contact-1",
      source: "whatsapp",
      windowStart: "2026-06-11T10:00:00Z",
      windowEnd: "2026-06-11T10:10:00Z",
      firstMessageId: "m1",
      lastMessageId: "m2",
      sourceMessageCount: 2,
      contentHash: buildDigestContentHash(["m1", "m2"]),
      transcript:
        "2026-06-11T10:00:00Z inbound m1: Hello\n2026-06-11T10:10:00Z outbound m2: Budget is around $5k",
    });
  });

  it("fails loudly for empty digest windows", () => {
    expect(() => buildDigestWindow([])).toThrow(/at least one message/);
  });
});
