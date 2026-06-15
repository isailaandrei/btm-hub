import { describe, expect, it } from "vitest";
import type { EmailSend } from "@/types/database";
import { buildEmailSendMetrics } from "./sent-metrics";

function send(overrides: Partial<EmailSend> = {}): EmailSend {
  return {
    id: "send-1",
    kind: "outreach",
    status: "sent",
    name: "Owner outreach",
    subject_template: "Hello",
    preview_text: "",
    from_email: "owner@example.com",
    from_name: "Behind The Mask",
    reply_to_email: "owner@example.com",
    template_version_id: null,
    builder_json_snapshot: {},
    html_preview_snapshot: "",
    text_preview_snapshot: "",
    created_by: "admin-1",
    updated_by: "admin-1",
    confirmed_by: "admin-1",
    confirmed_at: "2026-05-01T00:00:00.000Z",
    recipient_count: 12,
    skipped_count: 2,
    sent_count: 10,
    delivered_count: 9,
    opened_count: 5,
    clicked_count: 3,
    bounced_count: 1,
    complained_count: 1,
    failed_count: 1,
    unsubscribed_count: 2,
    metadata: {},
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildEmailSendMetrics", () => {
  it("surfaces owner-facing send metrics", () => {
    const metrics = buildEmailSendMetrics(send());

    expect(metrics.map((metric) => metric.label)).toEqual([
      "Sent",
      "Delivered",
      "Opened",
      "Button clicked",
      "Failed",
      "Skipped",
      "Unsubscribed",
    ]);
    expect(metrics.find((metric) => metric.label === "Sent")?.value).toBe(
      "10/12",
    );
    expect(metrics.find((metric) => metric.label === "Unsubscribed")?.value).toBe(
      "2",
    );
    expect(metrics.find((metric) => metric.label === "Opened")?.value).toBe("5");
    expect(metrics.find((metric) => metric.label === "Button clicked")?.value).toBe(
      "3",
    );
    expect(metrics.find((metric) => metric.label === "Failed")?.value).toBe(
      "2",
    );
    expect(metrics.some((metric) => metric.label === "Clicked")).toBe(false);
    expect(metrics.some((metric) => metric.label === "Clicked link")).toBe(false);
    expect(metrics.some((metric) => metric.label === "Bounced")).toBe(false);
    expect(metrics.some((metric) => metric.label === "Not received")).toBe(false);
    expect(metrics.some((metric) => metric.label === "Complaints")).toBe(false);
  });

  it("defaults missing newer counters to zero for older local rows", () => {
    const legacySend = send() as Partial<EmailSend>;
    delete legacySend.unsubscribed_count;
    delete legacySend.opened_count;

    const metrics = buildEmailSendMetrics(legacySend as EmailSend);

    expect(metrics.find((metric) => metric.label === "Unsubscribed")?.value).toBe(
      "0",
    );
    expect(metrics.find((metric) => metric.label === "Opened")?.value).toBe("0");
  });
});
