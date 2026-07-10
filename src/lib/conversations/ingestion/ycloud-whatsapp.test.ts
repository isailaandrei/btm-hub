import { describe, expect, it } from "vitest";
import {
  parseYCloudEchoEvent,
  parseYCloudHistoryEvent,
  whatsappMessageIdFromWamid,
  YCloudWhatsAppAdapter,
} from "./ycloud-whatsapp";

// Real wamids captured from production. The two outbound ones are the SAME
// logical message delivered twice by YCloud — their only difference is the
// embedded peer phone (echo encodes the customer, history the business), while
// the trailing message id is identical.
const WAMID_OUTBOUND_ECHO =
  "wamid.HBgMMzUxOTYzNDk1NjAyFQIAERgUMkEzNkU1RDUzNkE0NEIzODI1RjgA";
const WAMID_OUTBOUND_HISTORY =
  "wamid.HBgMMzUxOTM5MDU0MDYzFQIAERgUMkEzNkU1RDUzNkE0NEIzODI1RjgA";
const OUTBOUND_MESSAGE_ID = "2A36E5D536A44B3825F8";
const WAMID_INBOUND =
  "wamid.HBgMMzUxOTE4NTMzODUyFQIAEhgUM0FEMDY2Rjc3ODE5M0YyQkVDMUQA";
const INBOUND_MESSAGE_ID = "3AD066F778193F2BEC1D";

describe("whatsappMessageIdFromWamid", () => {
  it("extracts the trailing message id, ignoring the embedded peer phone", () => {
    expect(whatsappMessageIdFromWamid(WAMID_INBOUND)).toBe(INBOUND_MESSAGE_ID);
  });

  it("yields the same id for an echo and its history copy of one message", () => {
    // The core dedupe invariant: two different full wamids -> one identity.
    expect(whatsappMessageIdFromWamid(WAMID_OUTBOUND_ECHO)).toBe(
      OUTBOUND_MESSAGE_ID,
    );
    expect(whatsappMessageIdFromWamid(WAMID_OUTBOUND_HISTORY)).toBe(
      OUTBOUND_MESSAGE_ID,
    );
  });

  it("handles varying phone and message-id lengths", () => {
    // US number (11 digits) + 22-char id
    expect(
      whatsappMessageIdFromWamid(
        "wamid.HBgLMTg0NzM0MDk5OTQVAgASGBYzRUIwRTczRTU1NDlCQUY4NDI1Q0U0AA==",
      ),
    ).toBe("3EB0E73E5549BAF8425CE4");
    // 32-char id
    expect(
      whatsappMessageIdFromWamid(
        "wamid.HBgKOTYwNzUwMTAyNRUCABIYIEFDQTkwMkIwMDlFOEEzRTA2QkQxNzMzODhFQ0IwMzNEAA==",
      ),
    ).toBe("ACA902B009E8A3E06BD173388ECB033D");
    // id ending in ASCII "0" (the byte that tripped a naive NUL-strip)
    expect(
      whatsappMessageIdFromWamid(
        "wamid.HBgMNDQ3OTcxMjgzNzM0FQIAEhgUM0ExRkZFQ0U2M0VFQjI1MEExQjAA",
      ),
    ).toBe("3A1FFECE63EEB250A1B0");
  });

  it("returns null for a non-wamid or an unparseable envelope", () => {
    expect(whatsappMessageIdFromWamid("63f872f6741c165b4342a751")).toBeNull();
    expect(whatsappMessageIdFromWamid("wamid.only")).toBeNull();
    expect(whatsappMessageIdFromWamid("")).toBeNull();
  });
});

describe("YCloudWhatsAppAdapter", () => {
  it("parses a YCloud inbound text event into a source-agnostic message", () => {
    const event = {
      id: "evt_eEkn26qar3nOB8md",
      type: "whatsapp.inbound_message.received",
      apiVersion: "v2",
      createTime: "2026-06-25T12:00:00.000Z",
      whatsappInboundMessage: {
        id: "63f872f6741c165b4342a751",
        wamid: WAMID_INBOUND,
        wabaId: "WABA-ID",
        from: "+351918533852",
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
      // Keyed on the stable wamid message id, NOT YCloud's ephemeral `id`.
      providerMessageId: INBOUND_MESSAGE_ID,
      direction: "inbound",
      fromIdentifier: "+351918533852",
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
        wamid: WAMID_INBOUND,
        from: "+351918533852",
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

    expect(message!.body).toBe("Go for a walk.");
    expect(message!.media).toEqual([
      {
        url: "https://api.ycloud.com/v2/whatsapp/media/download/abc",
        contentType: "image/jpeg",
      },
    ]);
  });

  it("falls back to the full wamid when the id cannot be extracted", () => {
    const message = new YCloudWhatsAppAdapter().parse({
      type: "whatsapp.inbound_message.received",
      whatsappInboundMessage: {
        id: "63f872f6741c165b4342a751",
        wamid: "wamid.only",
        from: "+12133734253",
        to: "+351939054063",
        type: "text",
        text: { body: "hi" },
      },
    });

    expect(message!.providerMessageId).toBe("wamid.only");
  });

  it("falls back to the YCloud id only when no wamid is present", () => {
    const message = new YCloudWhatsAppAdapter().parse({
      type: "whatsapp.inbound_message.received",
      whatsappInboundMessage: {
        id: "63f872f6741c165b4342a751",
        from: "+12133734253",
        to: "+351939054063",
        type: "text",
        text: { body: "hi" },
      },
    });

    expect(message!.providerMessageId).toBe("63f872f6741c165b4342a751");
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
        wamid: WAMID_INBOUND,
        from: "+351918533852",
        to: "+351939054063",
        sendTime: "2026-01-10T09:00:00.000Z",
        type: "text",
        text: { body: "old inbound" },
      },
    });

    expect(message).toEqual(
      expect.objectContaining({
        provider: "ycloud",
        providerMessageId: INBOUND_MESSAGE_ID,
        direction: "inbound",
        fromIdentifier: "+351918533852",
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
        wamid: WAMID_OUTBOUND_HISTORY,
        from: "+351939054063",
        to: "+351963495602",
        sendTime: "2026-01-10T09:05:00.000Z",
        type: "text",
        text: { body: "old reply" },
      },
    });

    expect(message).toEqual(
      expect.objectContaining({
        providerMessageId: OUTBOUND_MESSAGE_ID,
        direction: "outbound",
        fromIdentifier: "+351939054063",
        toIdentifier: "+351963495602",
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

describe("parseYCloudEchoEvent", () => {
  it("parses an echo as an outbound message (business -> customer)", () => {
    const message = parseYCloudEchoEvent({
      id: "evt_echo_1",
      type: "whatsapp.smb.message.echoes",
      whatsappMessage: {
        id: "echo-1",
        wamid: WAMID_OUTBOUND_ECHO,
        from: "+351939054063",
        to: "+351963495602",
        sendTime: "2026-06-26T10:00:00.000Z",
        type: "text",
        text: { body: "Sent from my phone" },
      },
    });

    expect(message).toEqual(
      expect.objectContaining({
        provider: "ycloud",
        providerMessageId: OUTBOUND_MESSAGE_ID,
        direction: "outbound",
        fromIdentifier: "+351939054063",
        toIdentifier: "+351963495602",
        body: "Sent from my phone",
        happenedAt: "2026-06-26T10:00:00.000Z",
        rawPayload: expect.objectContaining({
          type: "whatsapp.smb.message.echoes",
        }),
      }),
    );
  });

  it("gives a live echo and its later history copy one identity (dedupe)", () => {
    // Regression for the duplication bug: YCloud delivers this outbound message
    // once as an echo and again in a history sync, with different YCloud ids,
    // different wamids, and skewed sendTimes — all of which must collapse to a
    // single providerMessageId so the unique constraint stores it exactly once.
    const echo = parseYCloudEchoEvent({
      type: "whatsapp.smb.message.echoes",
      whatsappMessage: {
        id: "6a4299b164ee8f32f61edcd6",
        wamid: WAMID_OUTBOUND_ECHO,
        from: "+351939054063",
        to: "+351963495602",
        sendTime: "2026-06-29T16:13:00.000Z",
        type: "text",
        text: { body: "Am I holding off any message to her parents?" },
      },
    });
    const history = parseYCloudHistoryEvent({
      type: "whatsapp.smb.history",
      whatsappMessage: {
        id: "6a42addcc5dfe72b091d2894",
        wamid: WAMID_OUTBOUND_HISTORY,
        from: "+351939054063",
        to: "+351963495602",
        sendTime: "2026-06-29T17:39:00.000Z",
        type: "text",
        text: { body: "Am I holding off any message to her parents?" },
      },
    });

    expect(echo!.providerMessageId).toBe(OUTBOUND_MESSAGE_ID);
    expect(history!.providerMessageId).toBe(echo!.providerMessageId);
  });

  it("fails loudly when the echoed message container is missing", () => {
    expect(() =>
      parseYCloudEchoEvent({ type: "whatsapp.smb.message.echoes" }),
    ).toThrow(/whatsappMessage/);
  });
});

describe("errors-type entries (contentless)", () => {
  it("skips an errors-type outbound history entry", () => {
    expect(
      parseYCloudHistoryEvent({
        type: "whatsapp.smb.history",
        whatsappMessage: {
          id: "h-err-1",
          from: "+351939054063",
          to: "+41796447382",
          sendTime: "2026-06-15T13:11:04.000Z",
          type: "errors",
          status: "sent",
        },
      }),
    ).toBeNull();
  });

  it("skips an errors-type echo", () => {
    expect(
      parseYCloudEchoEvent({
        type: "whatsapp.smb.message.echoes",
        whatsappMessage: {
          id: "echo-err-1",
          from: "+351939054063",
          to: "+41796447382",
          sendTime: "2026-07-10T07:04:48.000Z",
          type: "errors",
        },
      }),
    ).toBeNull();
  });

  it("skips an errors-type inbound event", () => {
    expect(
      new YCloudWhatsAppAdapter().parse({
        whatsappInboundMessage: {
          id: "in-err-1",
          from: "+41796447382",
          to: "+351939054063",
          type: "errors",
        },
      }),
    ).toBeNull();
  });
});
