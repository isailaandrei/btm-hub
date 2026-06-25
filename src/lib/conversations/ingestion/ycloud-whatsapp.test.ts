import { describe, expect, it } from "vitest";
import {
  parseYCloudHistoryEvent,
  YCloudWhatsAppAdapter,
} from "./ycloud-whatsapp";

describe("YCloudWhatsAppAdapter", () => {
  it("parses a YCloud inbound text event into a source-agnostic message", () => {
    const event = {
      id: "evt_eEkn26qar3nOB8md",
      type: "whatsapp.inbound_message.received",
      apiVersion: "v2",
      createTime: "2026-06-25T12:00:00.000Z",
      whatsappInboundMessage: {
        id: "63f872f6741c165b4342a751",
        wamid: "wamid.HBgNODi",
        wabaId: "WABA-ID",
        from: "+12133734253",
        to: "+351939054063",
        sendTime: "2026-06-25T12:00:00.000Z",
        type: "text",
        text: { body: "Hello from WhatsApp" },
      },
    };

    const message = new YCloudWhatsAppAdapter().parse(event);

    expect(message).toEqual({
      source: "whatsapp",
      provider: "ycloud",
      providerMessageId: "63f872f6741c165b4342a751",
      direction: "inbound",
      fromIdentifier: "+12133734253",
      toIdentifier: "+351939054063",
      body: "Hello from WhatsApp",
      media: [],
      happenedAt: "2026-06-25T12:00:00.000Z",
      rawPayload: expect.objectContaining({
        type: "whatsapp.inbound_message.received",
      }),
    });
  });

  it("maps media link/mime_type and uses the caption as the body", () => {
    const event = {
      type: "whatsapp.inbound_message.received",
      whatsappInboundMessage: {
        id: "63f87878509703399f3fd3d0",
        from: "+12133734253",
        to: "+351939054063",
        type: "image",
        sendTime: "2026-06-25T12:00:00.000Z",
        image: {
          id: "592623615738103",
          link: "https://api.ycloud.com/v2/whatsapp/media/download/abc",
          caption: "Go for a walk.",
          mime_type: "image/jpeg",
        },
      },
    };

    const message = new YCloudWhatsAppAdapter().parse(event);

    expect(message.body).toBe("Go for a walk.");
    expect(message.media).toEqual([
      {
        url: "https://api.ycloud.com/v2/whatsapp/media/download/abc",
        contentType: "image/jpeg",
      },
    ]);
  });

  it("falls back to wamid when the YCloud message id is absent", () => {
    const message = new YCloudWhatsAppAdapter().parse({
      type: "whatsapp.inbound_message.received",
      whatsappInboundMessage: {
        wamid: "wamid.only",
        from: "+12133734253",
        to: "+351939054063",
        type: "text",
        text: { body: "hi" },
      },
    });

    expect(message.providerMessageId).toBe("wamid.only");
  });

  it("fails loudly when the sender is missing", () => {
    expect(() =>
      new YCloudWhatsAppAdapter().parse({
        whatsappInboundMessage: { id: "m1", to: "+351939054063" },
      }),
    ).toThrow(/from/);
  });

  it("fails loudly when the inbound message container is missing", () => {
    expect(() => new YCloudWhatsAppAdapter().parse({ type: "x" })).toThrow(
      /whatsappInboundMessage/,
    );
  });
});

describe("parseYCloudHistoryEvent", () => {
  it("parses an inbound history message (customer -> business)", () => {
    const message = parseYCloudHistoryEvent({
      id: "evt_h1",
      type: "whatsapp.smb.history",
      whatsappInboundMessage: {
        id: "h-in-1",
        from: "+12133734253",
        to: "+351939054063",
        sendTime: "2026-01-10T09:00:00.000Z",
        type: "text",
        text: { body: "old inbound" },
      },
    });

    expect(message).toEqual(
      expect.objectContaining({
        provider: "ycloud",
        providerMessageId: "h-in-1",
        direction: "inbound",
        fromIdentifier: "+12133734253",
        toIdentifier: "+351939054063",
        body: "old inbound",
        happenedAt: "2026-01-10T09:00:00.000Z",
      }),
    );
  });

  it("parses an outbound history message (business -> customer)", () => {
    const message = parseYCloudHistoryEvent({
      type: "whatsapp.smb.history",
      whatsappMessage: {
        id: "h-out-1",
        from: "+351939054063",
        to: "+12133734253",
        sendTime: "2026-01-10T09:05:00.000Z",
        type: "text",
        text: { body: "old reply" },
      },
    });

    expect(message).toEqual(
      expect.objectContaining({
        providerMessageId: "h-out-1",
        direction: "outbound",
        fromIdentifier: "+351939054063",
        toIdentifier: "+12133734253",
        body: "old reply",
      }),
    );
  });

  it("fails loudly when neither message container is present", () => {
    expect(() =>
      parseYCloudHistoryEvent({ type: "whatsapp.smb.history" }),
    ).toThrow(/whatsappInboundMessage\/whatsappMessage/);
  });
});
