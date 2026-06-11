import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactCardRecord } from "@/lib/data/contact-cards";

const mockLoadContactPhoneIndexRecords = vi.fn();
const mockLoadAdminGatedContactCards = vi.fn();
const mockUpsertConversationMessage = vi.fn();

vi.mock("@/lib/data/contact-phone-index", () => ({
  loadContactPhoneIndexRecords: mockLoadContactPhoneIndexRecords,
}));

vi.mock("@/lib/data/contact-cards", () => ({
  loadEligibleContactCardRecords: mockLoadAdminGatedContactCards,
}));

vi.mock("@/lib/data/conversations", () => ({
  upsertConversationMessage: mockUpsertConversationMessage,
}));

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CONTACT_ID = "22222222-2222-4222-8222-222222222222";

function sign(url: string, body: URLSearchParams, token: string): string {
  const data =
    url +
    [...body.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}${value}`)
      .join("");
  return createHmac("sha1", token).update(data).digest("base64");
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

function makeBody(from = "whatsapp:+12133734253") {
  return new URLSearchParams({
    MessageSid: "SM123",
    From: from,
    To: "whatsapp:+15558675309",
    Body: "Hello",
    NumMedia: "0",
  });
}

async function postSigned(body: URLSearchParams) {
  const url = "https://example.com/api/whatsapp/webhook";
  const { POST } = await import("./route");
  return POST(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": sign(url, body, "twilio-secret"),
      },
      body,
    }),
  );
}

describe("POST /api/whatsapp/webhook", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.TWILIO_AUTH_TOKEN = "twilio-secret";
    mockLoadAdminGatedContactCards.mockRejectedValue(new Error("admin gated"));
    mockUpsertConversationMessage.mockResolvedValue({
      id: "message-1",
      contactId: CONTACT_ID,
    });
  });

  it("rejects invalid Twilio signatures", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://example.com/api/whatsapp/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-twilio-signature": "bad",
        },
        body: makeBody(),
      }),
    );

    expect(response.status).toBe(401);
    expect(mockUpsertConversationMessage).not.toHaveBeenCalled();
  });

  it("stores signed inbound WhatsApp messages with matched contact metadata", async () => {
    mockLoadContactPhoneIndexRecords.mockResolvedValue([
      makeRecord(CONTACT_ID, "+12133734253"),
    ]);

    const response = await postSigned(makeBody());

    expect(response.status).toBe(200);
    expect(mockUpsertConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: CONTACT_ID,
        provider: "twilio",
        providerMessageId: "SM123",
        fromIdentifier: "+12133734253",
        matchStatus: "matched",
        matchedVia: "contact.phone",
      }),
    );
    expect(mockLoadAdminGatedContactCards).not.toHaveBeenCalled();
  });

  it("stores unmatched messages with contact_id null", async () => {
    mockLoadContactPhoneIndexRecords.mockResolvedValue([
      makeRecord(CONTACT_ID, "+12133734253"),
    ]);

    const response = await postSigned(makeBody("whatsapp:+15551234567"));

    expect(response.status).toBe(200);
    expect(mockUpsertConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
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

    const response = await postSigned(makeBody());

    expect(response.status).toBe(200);
    expect(mockUpsertConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: null,
        matchStatus: "ambiguous",
        matchedVia: expect.stringContaining(CONTACT_ID),
      }),
    );
  });
});
