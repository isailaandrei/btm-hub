import { describe, expect, it } from "vitest";
import type { ContactEvent } from "@/types/database";
import { timelineEventBody } from "./timeline-event-body";

function event(partial: Partial<ContactEvent>): ContactEvent {
  return {
    id: "event-1",
    contact_id: "contact-1",
    type: "note",
    custom_label: null,
    body: "Regular note body",
    happened_at: "2026-05-01T00:00:00.000Z",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    author_id: "admin-1",
    author_name: "Admin",
    edited_at: null,
    resolved_at: null,
    resolved_by: null,
    metadata: {},
    ...partial,
  };
}

describe("timelineEventBody", () => {
  it("keeps regular timeline event bodies unchanged", () => {
    expect(timelineEventBody(event({ body: "Manual note" }))).toBe(
      "Manual note",
    );
  });

  it("renders sent email events as subject and pending delivery only", () => {
    expect(
      timelineEventBody(
        event({
          type: "custom",
          body: 'Sent email "Old body" to contact@example.com.',
          metadata: {
            source: "email_sends",
            subject: "Hello Maya",
            delivery_status: "pending",
          },
        }),
      ),
    ).toBe("Subject: Hello Maya\nDelivery: Not delivered yet");
  });

  it("shows delivered email events as delivered", () => {
    expect(
      timelineEventBody(
        event({
          type: "custom",
          metadata: {
            source: "email_sends",
            subject: "Hello Maya",
            delivery_status: "delivered",
          },
        }),
      ),
    ).toBe("Subject: Hello Maya\nDelivery: Delivered");
  });

  it("shows bounced email events as not delivered", () => {
    expect(
      timelineEventBody(
        event({
          type: "custom",
          metadata: {
            source: "email_sends",
            subject: "Hello Maya",
            delivery_status: "not_delivered",
          },
        }),
      ),
    ).toBe("Subject: Hello Maya\nDelivery: Not delivered");
  });
});
