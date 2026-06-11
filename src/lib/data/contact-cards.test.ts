import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({
    id: "admin-1",
    role: "admin",
  })),
}));

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CONTACT_ID = "22222222-2222-4222-8222-222222222222";
const APP_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_APP_ID = "44444444-4444-4444-8444-444444444444";

function makeQuery(data: unknown, error: unknown = null) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    "select",
    "in",
    "not",
    "eq",
    "neq",
    "is",
    "order",
    "limit",
  ]) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.then = vi.fn((resolve) => resolve({ data, error }));
  return query;
}

function setupClient() {
  const queries = {
    contacts: makeQuery([
      {
        id: CONTACT_ID,
        name: "Marina Costa",
        email: "marina@example.com",
        phone: null,
        profile_id: null,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
      },
      {
        id: OTHER_CONTACT_ID,
        name: "No App",
        email: "no-app@example.com",
        phone: null,
        profile_id: null,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
      },
    ]),
    applications: makeQuery([
      {
        id: APP_ID,
        user_id: null,
        contact_id: CONTACT_ID,
        program: "filmmaking",
        status: "reviewing",
        answers: { ultimate_vision: "Ocean stories" },
        tags: [],
        admin_notes: [],
        submitted_at: "2026-03-02T00:00:00Z",
        updated_at: "2026-03-02T00:00:00Z",
      },
      {
        id: OTHER_APP_ID,
        user_id: null,
        contact_id: CONTACT_ID,
        program: "photography",
        status: "accepted",
        answers: { inspiration_to_apply: "Reefs" },
        tags: [],
        admin_notes: [],
        submitted_at: "2026-03-03T00:00:00Z",
        updated_at: "2026-03-03T00:00:00Z",
      },
    ]),
    contact_events: makeQuery([
      {
        id: "note-1",
        contact_id: CONTACT_ID,
        author_id: "admin-1",
        author_name: "Admin",
        body: "Prefers WhatsApp.",
        created_at: "2026-03-04T00:00:00Z",
      },
    ]),
    contact_tags: makeQuery([
      {
        contact_id: CONTACT_ID,
        tag_id: "tag-1",
        assigned_at: "2026-03-05T00:00:00Z",
        tags: { id: "tag-1", name: "Scholarship" },
      },
    ]),
    conversation_digests: makeQuery([
      {
        id: "digest-1",
        contact_id: CONTACT_ID,
        source: "whatsapp",
        window_start: "2026-06-11T10:00:00Z",
        window_end: "2026-06-11T10:30:00Z",
        summary: "Discussed budget.",
        source_message_count: 2,
      },
    ]),
    conversation_facts: makeQuery([
      {
        id: "fact-1",
        contact_id: CONTACT_ID,
        source: "whatsapp",
        field_key: "budget",
        value_text: "$3-5k",
        confidence: "medium",
        observed_at: "2026-06-11T10:00:00Z",
        conflict_group: "budget",
      },
    ]),
  };
  const client = {
    from: vi.fn((table: keyof typeof queries) => queries[table]),
  };
  return { client, queries };
}

describe("contact card data loader", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("loads all eligible contacts in batches from the application cohort", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    const { client, queries } = setupClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { loadEligibleContactCardRecords } = await import("./contact-cards");
    const records = await loadEligibleContactCardRecords();

    expect(client.from).toHaveBeenCalledWith("applications");
    expect(client.from).toHaveBeenCalledWith("contacts");
    expect(client.from).toHaveBeenCalledWith("contact_events");
    expect(client.from).toHaveBeenCalledWith("contact_tags");
    expect(client.from).toHaveBeenCalledWith("conversation_digests");
    expect(client.from).toHaveBeenCalledWith("conversation_facts");
    expect(queries.applications.not).toHaveBeenCalledWith("contact_id", "is", null);
    expect(queries.contacts.in).toHaveBeenCalledWith("id", [CONTACT_ID]);
    expect(queries.contact_events.in).toHaveBeenCalledWith("contact_id", [CONTACT_ID]);
    expect(queries.contact_tags.in).toHaveBeenCalledWith("contact_id", [CONTACT_ID]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      contact: { id: CONTACT_ID },
      applications: [{ id: APP_ID }, { id: OTHER_APP_ID }],
      contactNotes: [{ id: "note-1", text: "Prefers WhatsApp." }],
      contactTags: [{ tagId: "tag-1", tagName: "Scholarship" }],
      conversationDigests: [{ id: "digest-1", summary: "Discussed budget." }],
      conversationFacts: [{ id: "fact-1", valueText: "$3-5k" }],
    });
  });

  it("loads a contact-scoped card without querying one contact at a time", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    const { client, queries } = setupClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { loadContactCardRecords } = await import("./contact-cards");
    await loadContactCardRecords({ contactIds: [CONTACT_ID, OTHER_CONTACT_ID] });

    expect(queries.contacts.in).toHaveBeenCalledWith("id", [
      CONTACT_ID,
      OTHER_CONTACT_ID,
    ]);
    expect(queries.applications.in).toHaveBeenCalledWith("contact_id", [
      CONTACT_ID,
      OTHER_CONTACT_ID,
    ]);
    expect(client.from).toHaveBeenCalledTimes(6);
  });
});
