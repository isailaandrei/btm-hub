import { describe, expect, it } from "vitest";
import { TwilioWhatsAppAdapter } from "./twilio-whatsapp";

describe("TwilioWhatsAppAdapter", () => {
  it("parses Twilio WhatsApp webhook form payloads into a source-agnostic message", () => {
    const payload = new URLSearchParams({
      MessageSid: "SM123",
      From: "whatsapp:+12133734253",
      To: "whatsapp:+15558675309",
      Body: "Hello from WhatsApp",
      NumMedia: "1",
      MediaUrl0: "https://api.twilio.com/media/1",
      MediaContentType0: "image/jpeg",
    });

    const message = new TwilioWhatsAppAdapter().parse(payload);

    expect(message).toEqual({
      source: "whatsapp",
      provider: "twilio",
      providerMessageId: "SM123",
      direction: "inbound",
      fromIdentifier: "+12133734253",
      toIdentifier: "+15558675309",
      body: "Hello from WhatsApp",
      media: [
        {
          url: "https://api.twilio.com/media/1",
          contentType: "image/jpeg",
        },
      ],
      happenedAt: expect.any(String),
      rawPayload: expect.objectContaining({
        MessageSid: "SM123",
        From: "whatsapp:+12133734253",
      }),
    });
  });

  it("fails loudly when Twilio omits the message id", () => {
    expect(() => new TwilioWhatsAppAdapter().parse(new URLSearchParams())).toThrow(
      /MessageSid/,
    );
  });
});
