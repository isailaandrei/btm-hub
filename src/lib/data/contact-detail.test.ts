import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CONTACT_ID = "550e8400-e29b-41d4-a716-446655440001";

const mockRpc = vi.fn();
const mockGetContactById = vi.fn();
const mockGetContactTags = vi.fn();
const mockGetTagCategories = vi.fn();
const mockGetTags = vi.fn();
const mockGetActiveSuppressionForContact = vi.fn();
const mockListContactConversationMessages = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mockRpc }),
}));

vi.mock("./contacts", () => ({
  getContactById: mockGetContactById,
  getContactTags: mockGetContactTags,
  getTagCategories: mockGetTagCategories,
  getTags: mockGetTags,
}));

vi.mock("./email-suppressions", () => ({
  getActiveSuppressionForContact: mockGetActiveSuppressionForContact,
}));

vi.mock("./conversations", () => ({
  listContactConversationMessages: mockListContactConversationMessages,
}));

const { getContactDetailPageBootstrap } = await import("./contact-detail");

const CONTACT = {
  id: CONTACT_ID,
  name: "Jane Contact",
  email: "jane@example.com",
  phone: "+40 787 604 139",
  profile_id: null,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

function mockBootstrapRpc() {
  mockRpc.mockResolvedValue({
    data: { applications: [], contact: CONTACT, events: [] },
    error: null,
  });
}

describe("getContactDetailPageBootstrap", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockGetContactById.mockReset().mockResolvedValue(CONTACT);
    mockGetContactTags.mockReset().mockResolvedValue([]);
    mockGetTagCategories.mockReset().mockResolvedValue([]);
    mockGetTags.mockReset().mockResolvedValue([]);
    mockGetActiveSuppressionForContact
      .mockReset()
      .mockResolvedValue({ reason: "manual" });
    mockListContactConversationMessages
      .mockReset()
      .mockResolvedValue([{ id: "m1" }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches all section slices alongside the core bootstrap", async () => {
    mockBootstrapRpc();

    const result = await getContactDetailPageBootstrap(CONTACT_ID);

    expect(result).not.toBeNull();
    expect(result?.contact.id).toBe(CONTACT_ID);
    expect(result?.sections).toEqual({
      emailStatus: { excluded: true, reason: "manual" },
      tagSection: { allTags: [], categories: [], contactTagRows: [] },
      whatsappMessages: [{ id: "m1" }],
    });
    // The WhatsApp slice must pass the normalized E.164 phone through.
    expect(mockListContactConversationMessages).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      phoneE164: "+40787604139",
    });
  });

  it("nulls a failing slice (logged) without failing the page or the other slices", async () => {
    mockBootstrapRpc();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockGetActiveSuppressionForContact.mockRejectedValue(
      new Error("suppressions table on fire"),
    );

    const result = await getContactDetailPageBootstrap(CONTACT_ID);

    expect(result?.sections?.emailStatus).toBeNull();
    expect(result?.sections?.tagSection).toEqual({
      allTags: [],
      categories: [],
      contactTagRows: [],
    });
    expect(result?.sections?.whatsappMessages).toEqual([{ id: "m1" }]);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to preload the email section"),
      expect.objectContaining({
        contactId: CONTACT_ID,
        error: "suppressions table on fire",
      }),
    );
  });

  it("returns null when the core bootstrap finds no contact", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await getContactDetailPageBootstrap(CONTACT_ID);

    expect(result).toBeNull();
  });
});
