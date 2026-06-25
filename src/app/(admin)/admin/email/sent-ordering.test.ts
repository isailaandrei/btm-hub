import { describe, expect, it } from "vitest";
import type { EmailSend } from "@/types/database";
import { sendTriageRank, sortSendsForTriage } from "./sent-ordering";

function makeSend(overrides: Partial<EmailSend> & { id: string }): EmailSend {
  return {
    kind: "broadcast",
    status: "sent",
    name: "Send",
    subject_template: "Subject",
    preview_text: "",
    from_email: "hi@example.com",
    from_name: "Example",
    reply_to_email: "hi@example.com",
    template_version_id: null,
    public_token: "tok",
    builder_json_snapshot: {},
    html_preview_snapshot: "",
    text_preview_snapshot: "",
    created_by: "admin",
    updated_by: "admin",
    confirmed_by: null,
    confirmed_at: null,
    recipient_count: 10,
    skipped_count: 0,
    sent_count: 10,
    delivered_count: 10,
    opened_count: 0,
    proxy_opened_count: 0,
    clicked_count: 0,
    bounced_count: 0,
    complained_count: 0,
    failed_count: 0,
    deferred_count: 0,
    unsubscribed_count: 0,
    metadata: {},
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("sendTriageRank", () => {
  it("ranks delivery failures highest (0)", () => {
    expect(sendTriageRank(makeSend({ id: "a", failed_count: 2 }))).toBe(0);
    expect(sendTriageRank(makeSend({ id: "b", bounced_count: 1 }))).toBe(0);
    expect(sendTriageRank(makeSend({ id: "c", status: "failed" }))).toBe(0);
    expect(
      sendTriageRank(makeSend({ id: "d", status: "partially_failed" })),
    ).toBe(0);
  });

  it("ranks clean sends with unsubscribes next (1)", () => {
    expect(sendTriageRank(makeSend({ id: "a", unsubscribed_count: 3 }))).toBe(1);
  });

  it("ranks everything else last (2)", () => {
    expect(sendTriageRank(makeSend({ id: "a" }))).toBe(2);
  });

  it("treats failures as higher priority than unsubscribes", () => {
    const failedWithUnsubs = makeSend({
      id: "a",
      failed_count: 1,
      unsubscribed_count: 5,
    });
    expect(sendTriageRank(failedWithUnsubs)).toBe(0);
  });
});

describe("sortSendsForTriage", () => {
  it("orders failures, then unsubscribes, then the rest", () => {
    const clean = makeSend({ id: "clean" });
    const unsub = makeSend({ id: "unsub", unsubscribed_count: 2 });
    const failed = makeSend({ id: "failed", failed_count: 1 });

    const ordered = sortSendsForTriage([clean, unsub, failed]);

    expect(ordered.map((send) => send.id)).toEqual([
      "failed",
      "unsub",
      "clean",
    ]);
  });

  it("orders most-recent-first within a triage group", () => {
    const older = makeSend({
      id: "older",
      created_at: "2026-06-01T00:00:00.000Z",
    });
    const newer = makeSend({
      id: "newer",
      created_at: "2026-06-10T00:00:00.000Z",
    });

    expect(sortSendsForTriage([older, newer]).map((s) => s.id)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("prefers confirmed_at over created_at for recency", () => {
    const sentLaterConfirmedEarlier = makeSend({
      id: "a",
      created_at: "2026-06-20T00:00:00.000Z",
      confirmed_at: "2026-06-02T00:00:00.000Z",
    });
    const sentEarlierConfirmedLater = makeSend({
      id: "b",
      created_at: "2026-06-01T00:00:00.000Z",
      confirmed_at: "2026-06-15T00:00:00.000Z",
    });

    expect(
      sortSendsForTriage([
        sentLaterConfirmedEarlier,
        sentEarlierConfirmedLater,
      ]).map((s) => s.id),
    ).toEqual(["b", "a"]);
  });

  it("does not mutate the input array", () => {
    const sends = [
      makeSend({ id: "clean" }),
      makeSend({ id: "failed", failed_count: 1 }),
    ];
    const snapshot = sends.map((send) => send.id);

    sortSendsForTriage(sends);

    expect(sends.map((send) => send.id)).toEqual(snapshot);
  });
});
