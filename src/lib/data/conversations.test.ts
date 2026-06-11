import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

function makeQuery(data: unknown = null, error: unknown = null) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    "select",
    "insert",
    "update",
    "upsert",
    "eq",
    "is",
    "in",
    "gte",
    "lte",
    "order",
    "limit",
    "single",
    "maybeSingle",
  ]) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.then = vi.fn((resolve) => resolve({ data, error }));
  return query;
}

describe("conversation data layer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("upserts raw messages idempotently by provider message id", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const query = makeQuery({ id: "message-1", contact_id: null });
    const client = { from: vi.fn(() => query), rpc: vi.fn() };
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { upsertConversationMessage } = await import("./conversations");
    const result = await upsertConversationMessage({
      contactId: null,
      source: "whatsapp",
      provider: "twilio",
      providerMessageId: "SM123",
      direction: "inbound",
      fromIdentifier: "+12133734253",
      toIdentifier: "+15558675309",
      body: "Hello",
      media: [],
      happenedAt: "2026-06-11T10:00:00Z",
      rawPayload: { MessageSid: "SM123" },
      matchStatus: "unmatched",
      matchedVia: null,
    });

    expect(client.from).toHaveBeenCalledWith("conversation_messages");
    expect(query.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          contact_id: null,
          provider: "twilio",
          provider_message_id: "SM123",
          body: "Hello",
          match_status: "unmatched",
        }),
      ],
      { onConflict: "provider,provider_message_id" },
    );
    expect(result).toEqual({ id: "message-1", contactId: null });
  });

  it("patches phone match metadata after raw message storage", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const query = makeQuery([]);
    const client = { from: vi.fn(() => query), rpc: vi.fn() };
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { updateConversationMessageMatch } = await import("./conversations");
    await updateConversationMessageMatch({
      messageId: "message-1",
      contactId: "contact-1",
      matchStatus: "matched",
      matchedVia: "contact.phone",
      rawPayload: { MessageSid: "SM123", phoneMatch: { status: "matched" } },
    });

    expect(client.from).toHaveBeenCalledWith("conversation_messages");
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id: "contact-1",
        match_status: "matched",
        matched_via: "contact.phone",
        raw_payload: expect.objectContaining({
          MessageSid: "SM123",
        }),
      }),
    );
    expect(query.eq).toHaveBeenCalledWith("id", "message-1");
  });

  it("checks whether conversation messages exist for retrieval short-circuiting", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const query = makeQuery({ id: "message-1" });
    const client = { from: vi.fn(() => query), rpc: vi.fn() };
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { hasConversationMessages } = await import("./conversations");
    const exists = await hasConversationMessages({ contactId: "contact-1" });

    expect(client.from).toHaveBeenCalledWith("conversation_messages");
    expect(query.select).toHaveBeenCalledWith("id");
    expect(query.eq).toHaveBeenCalledWith("contact_id", "contact-1");
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
    expect(exists).toBe(true);
  });

  it("inserts conversation facts append-only without upsert", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const query = makeQuery([{ id: "fact-1" }]);
    const client = { from: vi.fn(() => query), rpc: vi.fn() };
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { appendConversationFacts } = await import("./conversations");
    await appendConversationFacts([
      {
        contactId: "contact-1",
        source: "whatsapp",
        fieldKey: "budget",
        valueText: "$3-5k",
        valueJson: null,
        confidence: "medium",
        sourceMessageIds: ["message-1"],
        observedAt: "2026-06-11T10:00:00Z",
        conflictGroup: "budget",
        extractorModel: "fixture",
        extractorVersion: "v1",
      },
    ]);

    expect(client.from).toHaveBeenCalledWith("conversation_facts");
    expect(query.insert).toHaveBeenCalledTimes(1);
    expect(query.upsert).not.toHaveBeenCalled();
  });

  it("inserts digests idempotently by content hash", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const query = makeQuery([{ id: "digest-1" }]);
    const client = { from: vi.fn(() => query), rpc: vi.fn() };
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { upsertConversationDigest } = await import("./conversations");
    await upsertConversationDigest({
      contactId: "contact-1",
      source: "whatsapp",
      windowStart: "2026-06-11T10:00:00Z",
      windowEnd: "2026-06-11T11:00:00Z",
      firstMessageId: "message-1",
      lastMessageId: "message-2",
      summary: "Discussed budget.",
      sourceMessageCount: 2,
      contentHash: "hash-1",
      generatorModel: "fixture",
      generatorVersion: "v1",
    });

    expect(client.from).toHaveBeenCalledWith("conversation_digests");
    expect(query.upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ content_hash: "hash-1" })],
      { onConflict: "content_hash" },
    );
  });

  it("checks whether a digest content hash already exists", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const query = makeQuery({ id: "digest-1" });
    const client = { from: vi.fn(() => query), rpc: vi.fn() };
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { conversationDigestExists } = await import("./conversations");
    const exists = await conversationDigestExists("hash-1");

    expect(client.from).toHaveBeenCalledWith("conversation_digests");
    expect(query.select).toHaveBeenCalledWith("id");
    expect(query.eq).toHaveBeenCalledWith("content_hash", "hash-1");
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
    expect(exists).toBe(true);
  });

  it("lists only messages after each contact digest watermark for digesting", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const client = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            id: "message-after-watermark",
            contact_id: "contact-1",
            direction: "inbound",
            body: "New message.",
            happened_at: "2026-06-11T11:00:00Z",
          },
          {
            id: "message-no-watermark",
            contact_id: "contact-2",
            direction: "outbound",
            body: "First message.",
            happened_at: "2026-06-11T09:00:00Z",
          },
        ],
        error: null,
      }),
    };
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { listUndigestedConversationMessages } = await import("./conversations");
    const result = await listUndigestedConversationMessages({ limit: 250 });

    expect(client.rpc).toHaveBeenCalledWith("list_undigested_conversation_messages", {
      p_limit: 250,
    });
    expect(result).toEqual([
      {
        id: "message-after-watermark",
        contactId: "contact-1",
        direction: "inbound",
        body: "New message.",
        happenedAt: "2026-06-11T11:00:00Z",
      },
      {
        id: "message-no-watermark",
        contactId: "contact-2",
        direction: "outbound",
        body: "First message.",
        happenedAt: "2026-06-11T09:00:00Z",
      },
    ]);
  });

  it("lists messages missing a current-version embedding", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const client = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            id: "message-without-embedding",
            body: "Needs embedding.",
          },
        ],
        error: null,
      }),
    };
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { listMessagesMissingEmbeddings } = await import("./conversations");
    const result = await listMessagesMissingEmbeddings({
      embeddingModel: "text-embedding-3-small",
      embeddingVersion: "message-v1",
      limit: 100,
    });

    expect(client.rpc).toHaveBeenCalledWith("list_conversation_messages_missing_embeddings", {
      p_embedding_model: "text-embedding-3-small",
      p_embedding_version: "message-v1",
      p_limit: 100,
    });
    expect(result).toEqual([
      {
        id: "message-without-embedding",
        body: "Needs embedding.",
      },
    ]);
  });

  it("searches conversation embeddings through the vector RPC", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const client = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            message_id: "message-1",
            contact_id: "contact-1",
            body: "Can afford around $5k.",
            similarity: 0.92,
            happened_at: "2026-06-11T10:00:00Z",
          },
        ],
        error: null,
      }),
    };
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { searchConversationEmbeddings } = await import("./conversations");
    const result = await searchConversationEmbeddings({
      embedding: [0.1, 0.2],
      contactId: "contact-1",
      limit: 10,
    });

    expect(client.rpc).toHaveBeenCalledWith("search_conversation_embeddings", {
      p_query_embedding: [0.1, 0.2],
      p_contact_id: "contact-1",
      p_limit: 10,
    });
    expect(result[0]).toEqual(
      expect.objectContaining({
        messageId: "message-1",
        score: 0.92,
      }),
    );
  });
});
