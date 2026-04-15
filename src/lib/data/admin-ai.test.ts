import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({
    id: "admin-1",
    role: "admin",
    email: "admin@test.local",
    display_name: "Admin",
    bio: null,
    avatar_url: null,
    preferences: null,
    created_at: "2026-04-15T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
  })),
}));

// ---------------------------------------------------------------------------
// Shared test harness
// ---------------------------------------------------------------------------

type Harness = ReturnType<typeof createMockSupabaseClient>;

async function freshHarness(): Promise<Harness> {
  vi.resetModules();
  const mock = createMockSupabaseClient();
  const { createClient } = await import("@/lib/supabase/server");
  vi.mocked(createClient).mockResolvedValue(mock.client as never);
  const { requireAdmin } = await import("@/lib/auth/require-admin");
  vi.mocked(requireAdmin).mockClear();
  return mock;
}

// ===========================================================================
// listAdminAiThreadSummaries
// ===========================================================================

describe("listAdminAiThreadSummaries", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("returns mapped summaries for global scope", async () => {
    mock.mockQueryResult([
      {
        id: "t1",
        scope: "global",
        contact_id: null,
        title: "Global thread",
        created_at: "2026-04-14T00:00:00Z",
        updated_at: "2026-04-15T00:00:00Z",
      },
    ]);
    const { listAdminAiThreadSummaries } = await import("./admin-ai");
    const out = await listAdminAiThreadSummaries({ scope: "global" });

    expect(mock.client.from).toHaveBeenCalledWith("admin_ai_threads");
    expect(mock.query.eq).toHaveBeenCalledWith("scope", "global");
    expect(mock.query.order).toHaveBeenCalledWith("updated_at", {
      ascending: false,
    });
    expect(out).toEqual([
      {
        id: "t1",
        scope: "global",
        contactId: null,
        title: "Global thread",
        createdAt: "2026-04-14T00:00:00Z",
        updatedAt: "2026-04-15T00:00:00Z",
      },
    ]);
  });

  it("filters by contact_id when scope is contact", async () => {
    mock.mockQueryResult([]);
    const { listAdminAiThreadSummaries } = await import("./admin-ai");
    await listAdminAiThreadSummaries({
      scope: "contact",
      contactId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    expect(mock.query.eq).toHaveBeenCalledWith("scope", "contact");
    expect(mock.query.eq).toHaveBeenCalledWith(
      "contact_id",
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
  });

  it("throws when scope=contact and contactId is missing", async () => {
    const { listAdminAiThreadSummaries } = await import("./admin-ai");
    await expect(
      listAdminAiThreadSummaries({ scope: "contact" }),
    ).rejects.toThrow(/contactId is required/i);
  });

  it("throws on DB error", async () => {
    mock.mockQueryResult(null, { message: "boom" });
    const { listAdminAiThreadSummaries } = await import("./admin-ai");
    await expect(
      listAdminAiThreadSummaries({ scope: "global" }),
    ).rejects.toThrow(/boom/);
  });
});

// ===========================================================================
// getAdminAiThreadDetail
// ===========================================================================

describe("getAdminAiThreadDetail", () => {
  it("issues three queries: thread, messages, citations", async () => {
    vi.resetModules();
    const mock = createMockSupabaseClient();

    // We need different results for each `.from(...)` invocation. Instead of
    // three separate harnesses, implement a small script sequencer on top of
    // the shared mock: override `from` to return a fresh query builder for
    // each call.
    const calls: Array<{ table: string; filters: unknown[] }> = [];

    const thread = {
      id: "t1",
      author_id: "admin-1",
      scope: "global",
      contact_id: null,
      title: "T",
      created_at: "2026-04-14T00:00:00Z",
      updated_at: "2026-04-15T00:00:00Z",
    };
    const messages = [
      {
        id: "m1",
        thread_id: "t1",
        role: "user",
        content: "hi",
        status: "complete",
        query_plan: null,
        response_json: null,
        model_metadata: null,
        created_at: "2026-04-14T00:00:00Z",
      },
      {
        id: "m2",
        thread_id: "t1",
        role: "assistant",
        content: "hello",
        status: "complete",
        query_plan: null,
        response_json: null,
        model_metadata: null,
        created_at: "2026-04-14T00:01:00Z",
      },
    ];
    const citations = [
      {
        id: "c1",
        message_id: "m2",
        claim_key: "k1",
        source_type: "contact_note",
        source_id: "sn-1",
        contact_id: "cc-1",
        application_id: null,
        source_label: "label",
        snippet: "snippet",
        created_at: "2026-04-14T00:01:00Z",
      },
    ];

    const sequence: Array<{ data: unknown; error: unknown }> = [
      { data: thread, error: null },
      { data: messages, error: null },
      { data: citations, error: null },
    ];

    mock.client.from = vi.fn((table: string) => {
      calls.push({ table, filters: [] });
      const q: Record<string, ReturnType<typeof vi.fn>> = {};
      for (const method of [
        "select",
        "eq",
        "in",
        "order",
        "limit",
        "single",
        "maybeSingle",
      ]) {
        q[method] = vi.fn().mockReturnValue(q);
      }
      const next = sequence.shift() ?? { data: null, error: null };
      q.then = vi.fn((resolve) => resolve(next));
      return q as never;
    }) as never;

    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(mock.client as never);

    const { getAdminAiThreadDetail } = await import("./admin-ai");
    const out = await getAdminAiThreadDetail({ threadId: "t1" });

    expect(mock.client.from).toHaveBeenCalledTimes(3);
    expect(calls.map((c) => c.table)).toEqual([
      "admin_ai_threads",
      "admin_ai_messages",
      "admin_ai_message_citations",
    ]);
    expect(out.thread.id).toBe("t1");
    expect(out.messages).toHaveLength(2);
    expect(out.citationsByMessageId.get("m2")).toHaveLength(1);
    expect(out.citationsByMessageId.has("m1")).toBe(false);
  });

  it("throws 'not found' when the thread is missing (RLS-filtered)", async () => {
    vi.resetModules();
    const mock = createMockSupabaseClient();
    mock.client.from = vi.fn(() => {
      const q: Record<string, ReturnType<typeof vi.fn>> = {};
      for (const method of ["select", "eq", "in", "order", "single", "maybeSingle"]) {
        q[method] = vi.fn().mockReturnValue(q);
      }
      q.then = vi.fn((resolve) => resolve({ data: null, error: null }));
      return q as never;
    }) as never;
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(mock.client as never);

    const { getAdminAiThreadDetail } = await import("./admin-ai");
    await expect(getAdminAiThreadDetail({ threadId: "t1" })).rejects.toThrow(
      /not found/i,
    );
  });
});

// ===========================================================================
// createAdminAiThread
// ===========================================================================

describe("createAdminAiThread", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("calls requireAdmin, inserts with author_id, and returns new id", async () => {
    mock.mockQueryResult({ id: "t-new" });
    const { createAdminAiThread } = await import("./admin-ai");
    const { requireAdmin } = await import("@/lib/auth/require-admin");

    const result = await createAdminAiThread({
      scope: "global",
      title: "My thread",
    });

    expect(vi.mocked(requireAdmin)).toHaveBeenCalledTimes(1);
    expect(mock.client.from).toHaveBeenCalledWith("admin_ai_threads");
    expect(mock.query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        author_id: "admin-1",
        scope: "global",
        contact_id: null,
        title: "My thread",
      }),
    );
    expect(result).toEqual({ id: "t-new" });
  });

  it("passes contact_id for contact scope", async () => {
    mock.mockQueryResult({ id: "t-new" });
    const { createAdminAiThread } = await import("./admin-ai");
    await createAdminAiThread({
      scope: "contact",
      contactId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      title: "Contact chat",
    });
    expect(mock.query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "contact",
        contact_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      }),
    );
  });

  it("throws when scope=contact and contactId is missing", async () => {
    const { createAdminAiThread } = await import("./admin-ai");
    await expect(
      createAdminAiThread({ scope: "contact", title: "x" }),
    ).rejects.toThrow(/contactId is required/i);
  });
});

// ===========================================================================
// createAdminAiMessage
// ===========================================================================

describe("createAdminAiMessage", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("inserts a message and returns its id", async () => {
    mock.mockQueryResult({ id: "m-new" });
    const { createAdminAiMessage } = await import("./admin-ai");
    const { requireAdmin } = await import("@/lib/auth/require-admin");

    const out = await createAdminAiMessage({
      threadId: "t1",
      role: "user",
      content: "hi",
      status: "complete",
    });

    expect(vi.mocked(requireAdmin)).toHaveBeenCalledTimes(1);
    expect(mock.client.from).toHaveBeenCalledWith("admin_ai_messages");
    expect(mock.query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        thread_id: "t1",
        role: "user",
        content: "hi",
        status: "complete",
      }),
    );
    expect(out).toEqual({ id: "m-new" });
  });

  it("persists query_plan, response_json, and model_metadata when provided", async () => {
    mock.mockQueryResult({ id: "m-new" });
    const { createAdminAiMessage } = await import("./admin-ai");
    const queryPlan = {
      mode: "global_search" as const,
      structuredFilters: [],
      textFocus: ["ocean"],
      requestedLimit: 20,
    };
    const responseJson = {
      summary: "ok",
      keyFindings: [],
      uncertainty: [],
    };
    await createAdminAiMessage({
      threadId: "t1",
      role: "assistant",
      content: "answer",
      status: "complete",
      queryPlan,
      responseJson,
      modelMetadata: { model: "m", latencyMs: 123 },
    });
    expect(mock.query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        query_plan: queryPlan,
        response_json: responseJson,
        model_metadata: { model: "m", latencyMs: 123 },
      }),
    );
  });
});

// ===========================================================================
// createAdminAiCitations
// ===========================================================================

describe("createAdminAiCitations", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("batch-inserts all citations with the given message_id", async () => {
    mock.mockQueryResult(null);
    const { createAdminAiCitations } = await import("./admin-ai");

    await createAdminAiCitations({
      messageId: "m1",
      citations: [
        {
          claim_key: "k1",
          source_type: "contact_note",
          source_id: "cn-1",
          contact_id: "c-1",
          application_id: null,
          source_label: "label",
          snippet: "snippet",
        },
        {
          claim_key: "k2",
          source_type: "application_answer",
          source_id: "a-1:ultimate_vision",
          contact_id: "c-1",
          application_id: "a-1",
          source_label: "ultimate_vision",
          snippet: "big dreams",
        },
      ],
    });

    expect(mock.client.from).toHaveBeenCalledWith("admin_ai_message_citations");
    expect(mock.query.insert).toHaveBeenCalledTimes(1);
    const inserted = mock.query.insert.mock.calls[0][0] as unknown[];
    expect(inserted).toHaveLength(2);
    for (const row of inserted as Array<{ message_id: string }>) {
      expect(row.message_id).toBe("m1");
    }
  });

  it("is a no-op when citations is empty", async () => {
    const { createAdminAiCitations } = await import("./admin-ai");
    await createAdminAiCitations({ messageId: "m1", citations: [] });
    expect(mock.query.insert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// renameAdminAiThread
// ===========================================================================

describe("renameAdminAiThread", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("updates the title on the given thread id", async () => {
    mock.mockQueryResult({ id: "t1" });
    const { renameAdminAiThread } = await import("./admin-ai");
    await renameAdminAiThread({ threadId: "t1", title: "New title" });

    expect(mock.client.from).toHaveBeenCalledWith("admin_ai_threads");
    expect(mock.query.update).toHaveBeenCalledWith({ title: "New title" });
    expect(mock.query.eq).toHaveBeenCalledWith("id", "t1");
  });
});

// ===========================================================================
// deleteAdminAiThread
// ===========================================================================

describe("deleteAdminAiThread", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("deletes the thread by id", async () => {
    mock.mockQueryResult({ id: "t1" });
    const { deleteAdminAiThread } = await import("./admin-ai");
    await deleteAdminAiThread({ threadId: "t1" });

    expect(mock.client.from).toHaveBeenCalledWith("admin_ai_threads");
    expect(mock.query.delete).toHaveBeenCalled();
    expect(mock.query.eq).toHaveBeenCalledWith("id", "t1");
  });
});

// ===========================================================================
// queryAdminAiContactFacts
// ===========================================================================

describe("queryAdminAiContactFacts", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("issues one SELECT on the facts view with a limit", async () => {
    mock.mockQueryResult([]);
    const { queryAdminAiContactFacts } = await import("./admin-ai-retrieval");
    await queryAdminAiContactFacts({ filters: [], limit: 25 });

    expect(mock.client.from).toHaveBeenCalledTimes(1);
    expect(mock.client.from).toHaveBeenCalledWith("admin_ai_contact_facts");
    expect(mock.query.select).toHaveBeenCalled();
    expect(mock.query.limit).toHaveBeenCalledWith(25);
  });

  it("applies allowlisted filters and skips unknown fields", async () => {
    mock.mockQueryResult([]);
    const { queryAdminAiContactFacts } = await import("./admin-ai-retrieval");
    await queryAdminAiContactFacts({
      filters: [
        { field: "budget", op: "eq", value: "under_1k" },
        {
          field: "certification_level",
          op: "in",
          value: ["Open Water", "Advanced Open Water"],
        },
        // Unknown field — must be silently skipped.
        { field: "definitely_not_real", op: "eq", value: "x" },
      ],
      limit: 10,
    });

    expect(mock.query.eq).toHaveBeenCalledWith("budget", "under_1k");
    expect(mock.query.in).toHaveBeenCalledWith("certification_level", [
      "Open Water",
      "Advanced Open Water",
    ]);
    // And the unknown field must never have been routed through a filter.
    expect(mock.query.eq).not.toHaveBeenCalledWith(
      "definitely_not_real",
      expect.anything(),
    );
  });

  it("scopes to a specific contact when contactId is provided", async () => {
    mock.mockQueryResult([]);
    const { queryAdminAiContactFacts } = await import("./admin-ai-retrieval");
    await queryAdminAiContactFacts({
      filters: [],
      contactId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      limit: 5,
    });
    expect(mock.query.eq).toHaveBeenCalledWith(
      "contact_id",
      "cccccccc-cccc-cccc-cccc-cccccccccccc",
    );
  });

  it("calls requireAdmin", async () => {
    mock.mockQueryResult([]);
    const { queryAdminAiContactFacts } = await import("./admin-ai-retrieval");
    const { requireAdmin } = await import("@/lib/auth/require-admin");
    await queryAdminAiContactFacts({ filters: [], limit: 5 });
    expect(vi.mocked(requireAdmin)).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// searchAdminAiEvidence
// ===========================================================================

describe("searchAdminAiEvidence", () => {
  let mock: Harness;
  beforeEach(async () => {
    mock = await freshHarness();
  });

  it("calls the RPC exactly once with joined textFocus", async () => {
    mock.mockQueryResult([
      {
        evidence_id: "e1",
        contact_id: "c1",
        application_id: "a1",
        source_type: "application_answer",
        source_id: "a1:ultimate_vision",
        source_label: "ultimate_vision",
        source_timestamp: "2026-04-14T00:00:00Z",
        program: "academy",
        text: "swimming with dolphins",
      },
    ]);

    const { searchAdminAiEvidence } = await import("./admin-ai-retrieval");
    const out = await searchAdminAiEvidence({
      textFocus: ["dolphins", "ocean"],
      contactIds: ["c1", "c2"],
      limit: 20,
    });

    expect(mock.client.rpc).toHaveBeenCalledTimes(1);
    expect(mock.client.from).not.toHaveBeenCalled();
    expect(mock.client.rpc).toHaveBeenCalledWith(
      "search_admin_ai_evidence",
      expect.objectContaining({
        p_query: "dolphins ocean",
        p_contact_ids: ["c1", "c2"],
        p_contact_id: null,
        p_limit: 20,
      }),
    );
    expect(out).toEqual([
      {
        evidenceId: "e1",
        contactId: "c1",
        applicationId: "a1",
        sourceType: "application_answer",
        sourceId: "a1:ultimate_vision",
        sourceLabel: "ultimate_vision",
        sourceTimestamp: "2026-04-14T00:00:00Z",
        program: "academy",
        text: "swimming with dolphins",
      },
    ]);
  });

  it("passes p_contact_id when a single contactId is provided", async () => {
    mock.mockQueryResult([]);
    const { searchAdminAiEvidence } = await import("./admin-ai-retrieval");
    await searchAdminAiEvidence({
      textFocus: [],
      contactId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      limit: 5,
    });
    expect(mock.client.rpc).toHaveBeenCalledWith(
      "search_admin_ai_evidence",
      expect.objectContaining({
        p_query: "",
        p_contact_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        p_contact_ids: null,
        p_limit: 5,
      }),
    );
  });

  it("throws when the RPC errors", async () => {
    mock.mockQueryResult(null, { message: "rpc failed" });
    const { searchAdminAiEvidence } = await import("./admin-ai-retrieval");
    await expect(
      searchAdminAiEvidence({ textFocus: ["x"], limit: 5 }),
    ).rejects.toThrow(/rpc failed/);
  });

  it("calls requireAdmin", async () => {
    mock.mockQueryResult([]);
    const { searchAdminAiEvidence } = await import("./admin-ai-retrieval");
    const { requireAdmin } = await import("@/lib/auth/require-admin");
    await searchAdminAiEvidence({ textFocus: [], limit: 5 });
    expect(vi.mocked(requireAdmin)).toHaveBeenCalledTimes(1);
  });
});
