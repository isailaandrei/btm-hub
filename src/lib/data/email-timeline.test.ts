import { describe, expect, it } from "vitest";
import { buildEmailTimelineItems } from "./email-timeline";

describe("email timeline projection", () => {
  it("orders sent email and reply items by happened_at descending", () => {
    const items = buildEmailTimelineItems({
      recipients: [
        {
          id: "recipient-1",
          campaign_id: "campaign-1",
          contact_id: "contact-1",
          email: "alex@example.com",
          contact_name_snapshot: "Alex",
          status: "sent",
          sent_at: "2026-04-28T10:00:00.000Z",
        },
      ],
      replies: [
        {
          id: "reply-1",
          recipient_id: "recipient-1",
          contact_id: "contact-1",
          subject: "Re: Hello",
          body_preview: "Thanks",
          received_at: "2026-04-28T11:00:00.000Z",
          forward_status: "forwarded",
        },
      ],
    });

    expect(items.map((item) => item.type)).toEqual(["email_reply", "email_sent"]);
  });
});
