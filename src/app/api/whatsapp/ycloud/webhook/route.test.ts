import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactCardRecord } from "@/lib/data/contact-cards";

const mockLoadContactPhoneIndexRecords = vi.fn();
const mockUpsertConversationMessage = vi.fn();
const mockUpdateConversationMessageMatch = vi.fn();

vi.mock("@/lib/data/contact-phone-index", () => ({
  loadContactPhoneIndexRecords: mockLoadContactPhoneIndexRecords,
}));

vi.mock("@/lib/data/conversations", () => ({
  upsertConversationMessage: mockUpsertConversationMessage,
  updateConversationMessageMatch: mockUpdateConversationMessageMatch,
}));

const SECRET = "ycloud-secret";
const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CONTACT_ID = "22222222-2222-4222-8222-222222222222";
const ENDPOINT = "https://example.com/api/whatsapp/ycloud/webhook";

function sign(rawBody: string, secret = SECRET, timestamp = "1782220800"): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `t=${timestamp},s=${signature}`;
}

function makeRecord(contactId: string, phone: string): ContactCardRecord {
  return {
    contact: {
      id: contactId,
      name: contactId,
      email: `${contactId}@example.com`,
      phone,
      profile_id: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    },
    applications: [],
    contactNotes: [],
    contactTags: [],
  };
}

function makeEvent(from = "+12133734253") {
  return {
    id: "evt_1",
    type: "whatsapp.inbound_message.received",
    apiVersion: "v2",
    whatsappInboundMessage: {
      id: "msg_1",
      from,
      to: "+351939054063",
      sendTime: "2026-06-25T12:00:00.000Z",
      type: "text",
      text: { body: "Hello" },
    },
  };
}

async function post(
  body: string,
  headers: Record<string, string> = { "ycloud-signature": sign(body) },
) {
  const { POST } = await import("./route");
  return POST(
    new Request(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    }),
  );
}

async function postSigned(event: unknown) {
  return post(JSON.stringify(event));
}

describe("POST /api/whatsapp/ycloud/webhook", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.YCLOUD_WEBHOOK_SECRET = SECRET;
    mockUpsertConversationMessage.mockResolvedValue({
      id: "message-1",
      contactId: null,
    });
    mockUpdateConversationMessageMatch.mockResolvedValue(undefined);
  });

  it("returns 500 when the webhook secret is not configured", async () => {
    delete process.env.YCLOUD_WEBHOOK_SECRET;
    const response = await postSigned(makeEvent());
    expect(response.status).toBe(500);
    expect(mockUpsertConversationMessage).not.toHaveBeenCalled();
  });

  it("rejects invalid signatures", async () => {
    const body = JSON.stringify(makeEvent());
    const response = await post(body, { "ycloud-signature": "t=1,s=deadbeef" });
    expect(response.status).toBe(401);
    expect(mockUpsertConversationMessage).not.toHaveBeenCalled();
  });

  it("acknowledges non-inbound events without ingesting", async () => {
    const response = await postSigned({
      type: "whatsapp.message.updated",
      whatsappMessage: { id: "msg_1", status: "delivered" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ ok: true, ignored: true, type: "whatsapp.message.updated" }),
    );
    expect(mockUpsertConversationMessage).not.toHaveBeenCalled();
  });

  it("stores signed inbound messages with matched contact metadata", async () => {
    mockLoadContactPhoneIndexRecords.mockResolvedValue([
      makeRecord(CONTACT_ID, "+12133734253"),
    ]);

    const response = await postSigned(makeEvent());

    expect(response.status).toBe(200);
    expect(mockUpsertConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: null,
        provider: "ycloud",
        providerMessageId: "msg_1",
        fromIdentifier: "+12133734253",
        matchStatus: "unmatched",
        matchedVia: null,
      }),
    );
    expect(mockUpdateConversationMessageMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "message-1",
        contactId: CONTACT_ID,
        matchStatus: "matched",
        matchedVia: "contact.phone",
      }),
    );
  });

  it("stores unmatched messages with contact_id null", async () => {
    mockLoadContactPhoneIndexRecords.mockResolvedValue([
      makeRecord(CONTACT_ID, "+12133734253"),
    ]);

    const response = await postSigned(makeEvent("+15551234567"));

    expect(response.status).toBe(200);
    expect(mockUpdateConversationMessageMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "message-1",
        contactId: null,
        matchStatus: "unmatched",
        matchedVia: null,
      }),
    );
  });

  it("stores ambiguous messages without guessing a contact", async () => {
    mockLoadContactPhoneIndexRecords.mockResolvedValue([
      makeRecord(CONTACT_ID, "+12133734253"),
      makeRecord(OTHER_CONTACT_ID, "+12133734253"),
    ]);

    const response = await postSigned(makeEvent());

    expect(response.status).toBe(200);
    expect(mockUpdateConversationMessageMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "message-1",
        contactId: null,
        matchStatus: "ambiguous",
        matchedVia: expect.stringContaining(CONTACT_ID),
      }),
    );
  });

  it("stores the raw message even when phone matching fails", async () => {
    mockLoadContactPhoneIndexRecords.mockRejectedValue(
      new Error("phone index unavailable"),
    );

    const response = await postSigned(makeEvent());

    expect(response.status).toBe(200);
    expect(mockUpsertConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: null,
        providerMessageId: "msg_1",
        matchStatus: "unmatched",
      }),
    );
    expect(mockUpdateConversationMessageMatch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        messageId: "message-1",
        matchStatus: "unmatched",
        warning: expect.stringMatching(/matching failed/i),
      }),
    );
  });
});
