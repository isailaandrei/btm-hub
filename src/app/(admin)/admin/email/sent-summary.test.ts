import { describe, expect, it } from "vitest";
import type { EmailSend } from "@/types/database";
import { buildSentRowSummary, getSendAudienceName } from "./sent-summary";

function makeSend(overrides: Partial<EmailSend>): EmailSend {
  return {
    id: "send-1",
    kind: "outreach",
    status: "sent",
    name: "Hello {{contact.name}}",
    subject_template: "Hello {{contact.name}}",
    preview_text: "",
    from_email: "hello@example.com",
    from_name: "BTM",
    reply_to_email: "hello@example.com",
    template_version_id: null,
    public_token: "tok-test",
    builder_json_snapshot: {},
    html_preview_snapshot: "",
    text_preview_snapshot: "",
    created_by: "admin",
    updated_by: "admin",
    confirmed_by: null,
    confirmed_at: null,
    recipient_count: 0,
    skipped_count: 0,
    sent_count: 0,
    delivered_count: 0,
    opened_count: 0,
    clicked_count: 0,
    bounced_count: 0,
    complained_count: 0,
    failed_count: 0,
    deferred_count: 0,
    unsubscribed_count: 0,
    metadata: {},
    created_at: "2026-06-18T12:00:00.000Z",
    updated_at: "2026-06-18T12:00:00.000Z",
    ...overrides,
  };
}

describe("buildSentRowSummary", () => {
  it("pluralizes the recipient count", () => {
    expect(buildSentRowSummary(makeSend({ recipient_count: 1 })).recipientText).toBe(
      "1 recipient",
    );
    expect(buildSentRowSummary(makeSend({ recipient_count: 142 })).recipientText).toBe(
      "142 recipients",
    );
    expect(buildSentRowSummary(makeSend({ recipient_count: 0 })).recipientText).toBe(
      "0 recipients",
    );
  });

  it("labels the send kind", () => {
    expect(buildSentRowSummary(makeSend({ kind: "broadcast" })).kindLabel).toBe(
      "Newsletter",
    );
    expect(buildSentRowSummary(makeSend({ kind: "outreach" })).kindLabel).toBe(
      "Targeted",
    );
  });

  it("surfaces a saved audience name from metadata", () => {
    const send = makeSend({
      metadata: { editor: "maily", audience: { label: "Beginners segment" } },
    });
    expect(buildSentRowSummary(send).audienceName).toBe("Beginners segment");
  });

  it("returns null audience name for ad-hoc or legacy sends", () => {
    expect(getSendAudienceName(makeSend({ metadata: {} }))).toBeNull();
    expect(
      getSendAudienceName(makeSend({ metadata: { audience: { kind: "outreach" } } })),
    ).toBeNull();
    expect(
      getSendAudienceName(makeSend({ metadata: { audience: { label: "  " } } })),
    ).toBeNull();
  });
});
