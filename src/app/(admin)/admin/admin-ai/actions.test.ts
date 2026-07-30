import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminAiQueryPlan,
  AdminAiResponse,
  AdminAiThread,
} from "@/types/admin-ai";

const THREAD_ID = "33333333-3333-4333-8333-333333333333";
const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const SEEDED_CONTACT_ID = "11111111-1111-1111-1111-000000000001";
const USER_MESSAGE_ID = "44444444-4444-4444-8444-444444444444";
const ASSISTANT_MESSAGE_ID = "55555555-5555-4555-8555-555555555555";

const mockCreateAdminAiThread = vi.fn();
const mockCreateAdminAiMessage = vi.fn();
const mockUpdateAdminAiMessage = vi.fn();
const mockGetAdminAiThreadDetail = vi.fn();
const mockRenameAdminAiThread = vi.fn();
const mockDeleteAdminAiThread = vi.fn();
const mockListAdminAiThreadSummaries = vi.fn();
const mockRunAdminAiAnalysis = vi.fn();
const mockRevalidatePath = vi.fn();
const mockGetAdminAiProviderAvailability = vi.fn();
const mockRequireAdmin = vi.fn();

// Captures the callback `startAdminAiQuestion` schedules via `after()` so
// tests can invoke the continuation explicitly and independently of the
// action's own (immediate) return.
let capturedAfter: (() => Promise<void>) | null = null;

vi.mock("@/lib/data/admin-ai", () => ({
  createAdminAiThread: mockCreateAdminAiThread,
  createAdminAiMessage: mockCreateAdminAiMessage,
  updateAdminAiMessage: mockUpdateAdminAiMessage,
  getAdminAiThreadDetail: mockGetAdminAiThreadDetail,
  listAdminAiThreadSummaries: mockListAdminAiThreadSummaries,
  renameAdminAiThread: mockRenameAdminAiThread,
  deleteAdminAiThread: mockDeleteAdminAiThread,
}));

vi.mock("@/lib/admin-ai/orchestrator", () => ({
  runAdminAiAnalysis: mockRunAdminAiAnalysis,
}));

vi.mock("@/lib/admin-ai/provider", () => ({
  getAdminAiProviderAvailability: mockGetAdminAiProviderAvailability,
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("next/server", () => ({
  after: vi.fn((cb: () => Promise<void>) => {
    capturedAfter = cb;
  }),
}));

function makePlan(): AdminAiQueryPlan {
  return {
    mode: "global_search",
    structuredFilters: [],
    textFocus: ["ocean"],
    requestedLimit: 25,
  };
}

function makeResponse(): AdminAiResponse {
  return {
    uncertainty: [],
    shortlist: [
      {
        contactId: CONTACT_ID,
        contactName: "Joana",
        whyFit: ["Strong conservation motivation."],
        concerns: [],
        citations: [{ evidenceId: "evidence-1", claimKey: "shortlist.0.whyFit.0" }],
      },
    ],
  };
}

function makeThreadDetail() {
  return {
    thread: {
      id: THREAD_ID,
      author_id: "admin-1",
      scope: "global",
      contact_id: null,
      title: "Find strong candidates",
      created_at: "2026-04-15T00:00:00Z",
      updated_at: "2026-04-15T00:01:00Z",
    } satisfies AdminAiThread,
    messages: [
      {
        id: USER_MESSAGE_ID,
        thread_id: THREAD_ID,
        role: "user",
        content: "Find strong candidates",
        status: "complete",
        query_plan: null,
        response_json: null,
        model_metadata: null,
        created_at: "2026-04-15T00:00:00Z",
      },
      {
        id: ASSISTANT_MESSAGE_ID,
        thread_id: THREAD_ID,
        role: "assistant",
        content: "Joana is a strong fit for the brief.",
        status: "complete",
        query_plan: makePlan(),
        response_json: makeResponse(),
        model_metadata: null,
        created_at: "2026-04-15T00:01:00Z",
      },
    ],
    citationsByMessageId: new Map([
      [
        ASSISTANT_MESSAGE_ID,
        [
          {
            id: "citation-1",
            message_id: ASSISTANT_MESSAGE_ID,
            claim_key: "shortlist.0.whyFit.0",
            source_type: "application_answer",
            source_id: "source-1",
            contact_id: CONTACT_ID,
            application_id: null,
            source_label: "ultimate_vision",
            snippet: "voice of the ocean",
            created_at: "2026-04-15T00:01:00Z",
          },
        ],
      ],
    ]),
  };
}

function enableEvidence() {
  vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "1");
}

describe("startAdminAiQuestion", () => {
  const INITIAL_STATE = {
    errors: null,
    message: null,
    success: false,
    thread: null,
    messages: null,
  } as const;

  beforeEach(() => {
    vi.resetModules();
    capturedAfter = null;
    mockCreateAdminAiThread.mockReset();
    mockCreateAdminAiMessage.mockReset();
    mockUpdateAdminAiMessage.mockReset();
    mockRunAdminAiAnalysis.mockReset();
    mockRevalidatePath.mockReset();
    mockGetAdminAiProviderAvailability.mockReset();
    mockRequireAdmin.mockReset().mockResolvedValue({ id: "admin-1" });
    mockGetAdminAiProviderAvailability.mockReturnValue({
      isConfigured: true,
      unavailableReason: null,
      model: "gpt-4.1-mini",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("short-circuits without creating a thread or message when the provider is unavailable", async () => {
    mockGetAdminAiProviderAvailability.mockReturnValue({
      isConfigured: false,
      unavailableReason: "Admin AI is not configured yet.",
      model: null,
    });

    const { startAdminAiQuestion } = await import("./actions");
    const formData = new FormData();
    formData.set("scope", "global");
    formData.set("question", "Find strong candidates");

    const result = await startAdminAiQuestion(INITIAL_STATE, formData);

    expect(mockCreateAdminAiThread).not.toHaveBeenCalled();
    expect(mockCreateAdminAiMessage).not.toHaveBeenCalled();
    expect(mockRunAdminAiAnalysis).not.toHaveBeenCalled();
    expect(capturedAfter).toBeNull();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not configured/i);
  });

  it("returns validation errors without creating a thread, message, or continuation", async () => {
    const { startAdminAiQuestion } = await import("./actions");
    const formData = new FormData();
    formData.set("scope", "global");
    // "question" omitted — fails adminAiAskInputSchema's min(1).

    const result = await startAdminAiQuestion(INITIAL_STATE, formData);

    expect(result.errors).not.toBeNull();
    expect(result.success).toBe(false);
    expect(mockCreateAdminAiThread).not.toHaveBeenCalled();
    expect(mockCreateAdminAiMessage).not.toHaveBeenCalled();
    expect(capturedAfter).toBeNull();
  });

  it("resolves promptly with a running placeholder while analysis is still pending, and schedules the continuation", async () => {
    mockCreateAdminAiThread.mockResolvedValue({ id: THREAD_ID });
    mockCreateAdminAiMessage
      .mockResolvedValueOnce({ id: USER_MESSAGE_ID })
      .mockResolvedValueOnce({ id: ASSISTANT_MESSAGE_ID });
    // Never resolves within this test — proves the action does not await it.
    mockRunAdminAiAnalysis.mockReturnValue(new Promise(() => {}));

    const { startAdminAiQuestion } = await import("./actions");
    const formData = new FormData();
    formData.set("scope", "global");
    formData.set("question", "Find strong candidates");

    const result = await startAdminAiQuestion(INITIAL_STATE, formData);

    expect(mockCreateAdminAiMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        threadId: THREAD_ID,
        role: "user",
        content: "Find strong candidates",
        status: "complete",
      }),
    );
    expect(mockCreateAdminAiMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        threadId: THREAD_ID,
        role: "assistant",
        status: "running",
        content: "",
      }),
    );
    expect(result.errors).toBeNull();
    expect(result.message).toBeNull();
    expect(result.success).toBe(true);
    expect(result.thread?.id).toBe(THREAD_ID);
    expect(result.messages).toHaveLength(2);
    expect(result.messages?.[1]).toEqual(
      expect.objectContaining({
        id: ASSISTANT_MESSAGE_ID,
        status: "running",
        content: "",
        response: null,
        citations: [],
      }),
    );
    expect(capturedAfter).toBeTypeOf("function");
    expect(mockRunAdminAiAnalysis).not.toHaveBeenCalled();
  });

  it("continuation calls runAdminAiAnalysis with the placeholder id, then revalidates the contact page", async () => {
    mockCreateAdminAiThread.mockResolvedValue({ id: THREAD_ID });
    mockCreateAdminAiMessage
      .mockResolvedValueOnce({ id: USER_MESSAGE_ID })
      .mockResolvedValueOnce({ id: ASSISTANT_MESSAGE_ID });
    mockRunAdminAiAnalysis.mockResolvedValue({
      status: "complete",
      assistantMessageId: ASSISTANT_MESSAGE_ID,
      queryPlan: makePlan(),
      response: makeResponse(),
      citations: [],
      modelMetadata: null,
      error: null,
    });

    const { startAdminAiQuestion } = await import("./actions");
    const formData = new FormData();
    formData.set("scope", "contact");
    formData.set("contactId", CONTACT_ID);
    formData.set("question", "Summarize this contact");

    await startAdminAiQuestion(INITIAL_STATE, formData);
    expect(capturedAfter).toBeTypeOf("function");
    expect(mockRunAdminAiAnalysis).not.toHaveBeenCalled();

    await capturedAfter!();

    expect(mockRunAdminAiAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "contact",
        threadId: THREAD_ID,
        question: "Summarize this contact",
        contactId: CONTACT_ID,
        assistantMessageId: ASSISTANT_MESSAGE_ID,
      }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/admin/contacts/${CONTACT_ID}`);
    // Success path never hits the continuation's last-resort failure write.
    expect(mockUpdateAdminAiMessage).not.toHaveBeenCalled();
  });

  it("continuation marks the placeholder failed via updateAdminAiMessage when analysis rejects without its own assistantMessageId", async () => {
    mockCreateAdminAiThread.mockResolvedValue({ id: THREAD_ID });
    mockCreateAdminAiMessage
      .mockResolvedValueOnce({ id: USER_MESSAGE_ID })
      .mockResolvedValueOnce({ id: ASSISTANT_MESSAGE_ID });
    mockRunAdminAiAnalysis.mockRejectedValue(new Error("boom, unattributed failure"));
    mockUpdateAdminAiMessage.mockResolvedValue(undefined);

    const { startAdminAiQuestion } = await import("./actions");
    const formData = new FormData();
    formData.set("scope", "global");
    formData.set("question", "Find strong candidates");

    await startAdminAiQuestion(INITIAL_STATE, formData);
    await capturedAfter!();

    expect(mockUpdateAdminAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: ASSISTANT_MESSAGE_ID,
        status: "failed",
        content: expect.stringContaining("boom"),
      }),
    );
    // Cleanup still runs even though the continuation's try block threw.
    expect(mockRevalidatePath).not.toHaveBeenCalled(); // global scope never revalidates a path
  });

  it("accepts contact-scoped seeded UUIDs that match the app-wide validator", async () => {
    mockCreateAdminAiThread.mockResolvedValue({ id: THREAD_ID });
    mockCreateAdminAiMessage
      .mockResolvedValueOnce({ id: USER_MESSAGE_ID })
      .mockResolvedValueOnce({ id: ASSISTANT_MESSAGE_ID });
    mockRunAdminAiAnalysis.mockReturnValue(new Promise(() => {}));

    const { startAdminAiQuestion } = await import("./actions");
    const formData = new FormData();
    formData.set("scope", "contact");
    formData.set("contactId", SEEDED_CONTACT_ID);
    formData.set("question", "Summarize this contact");

    const result = await startAdminAiQuestion(INITIAL_STATE, formData);

    expect(result.errors).toBeNull();
    expect(mockCreateAdminAiThread).toHaveBeenCalledWith({
      scope: "contact",
      contactId: SEEDED_CONTACT_ID,
      title: "Summarize this contact",
    });
    expect(result.success).toBe(true);
  });

  it("appends to an existing owned thread when threadId is provided (no new thread created)", async () => {
    mockCreateAdminAiMessage
      .mockResolvedValueOnce({ id: USER_MESSAGE_ID })
      .mockResolvedValueOnce({ id: ASSISTANT_MESSAGE_ID });
    mockRunAdminAiAnalysis.mockReturnValue(new Promise(() => {}));

    const { startAdminAiQuestion } = await import("./actions");
    const formData = new FormData();
    formData.set("scope", "contact");
    formData.set("contactId", CONTACT_ID);
    formData.set("threadId", THREAD_ID);
    formData.set("threadTitle", "Existing contact synthesis");
    formData.set("threadCreatedAt", "2026-04-15T00:00:00Z");
    formData.set("question", "Summarize this contact");

    const result = await startAdminAiQuestion(INITIAL_STATE, formData);

    expect(mockCreateAdminAiThread).not.toHaveBeenCalled();
    expect(mockCreateAdminAiMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        threadId: THREAD_ID,
        role: "user",
        content: "Summarize this contact",
      }),
    );
    expect(result.success).toBe(true);
    expect(result.thread?.id).toBe(THREAD_ID);
    expect(result.thread?.title).toBe("Existing contact synthesis");
    expect(result.thread?.createdAt).toBe("2026-04-15T00:00:00Z");
  });
});

describe("loadGlobalAdminAiPanelData", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireAdmin.mockReset().mockResolvedValue({ id: "admin-1" });
    mockListAdminAiThreadSummaries.mockReset().mockResolvedValue([
      {
        id: THREAD_ID,
        scope: "global",
        contactId: null,
        title: "Find strong candidates",
        createdAt: "2026-04-15T00:00:00Z",
        updatedAt: "2026-04-15T00:01:00Z",
      },
    ]);
    mockGetAdminAiProviderAvailability.mockReset().mockReturnValue({
      isConfigured: true,
      unavailableReason: null,
      model: "gpt-5-mini",
    });
  });

  it("loads global AI panel data after an admin check", async () => {
    const { loadGlobalAdminAiPanelData } = await import("./actions");
    const result = await loadGlobalAdminAiPanelData();

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(mockListAdminAiThreadSummaries).toHaveBeenCalledWith({
      scope: "global",
    });
    expect(result.initialThreads).toHaveLength(1);
    expect(result.providerAvailability).toEqual({
      isConfigured: true,
      unavailableReason: null,
      model: "gpt-5-mini",
    });
  });
});

describe("loadAdminAiThread", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAdminAiThreadDetail.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("omits persisted citations from loaded messages when evidence is disabled", async () => {
    vi.stubEnv("ADMIN_AI_INCLUDE_EVIDENCE", "0");
    mockGetAdminAiThreadDetail.mockResolvedValue(makeThreadDetail());

    const { loadAdminAiThread } = await import("./actions");
    const result = await loadAdminAiThread(THREAD_ID);

    expect(result.messages[1]?.citations).toEqual([]);
  });

  it("returns a serialized thread detail payload with citations attached per message", async () => {
    enableEvidence();
    mockGetAdminAiThreadDetail.mockResolvedValue(makeThreadDetail());

    const { loadAdminAiThread } = await import("./actions");
    const result = await loadAdminAiThread(THREAD_ID);

    expect(mockGetAdminAiThreadDetail).toHaveBeenCalledWith({ threadId: THREAD_ID });
    expect(result.thread.id).toBe(THREAD_ID);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]?.citations).toHaveLength(1);
  });
});

describe("renameAdminAiThread", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRenameAdminAiThread.mockReset();
    mockRevalidatePath.mockReset();
  });

  it("validates and renames an owned thread", async () => {
    const { renameAdminAiThreadAction } = await import("./actions");
    await renameAdminAiThreadAction({
      threadId: THREAD_ID,
      title: "New AI thread title",
      scope: "contact",
      contactId: CONTACT_ID,
    });

    expect(mockRenameAdminAiThread).toHaveBeenCalledWith({
      threadId: THREAD_ID,
      title: "New AI thread title",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/admin/contacts/${CONTACT_ID}`);
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1);
  });
});

describe("deleteAdminAiThread", () => {
  beforeEach(() => {
    vi.resetModules();
    mockDeleteAdminAiThread.mockReset();
    mockRevalidatePath.mockReset();
  });

  it("deletes an owned thread", async () => {
    const { deleteAdminAiThreadAction } = await import("./actions");
    await deleteAdminAiThreadAction({
      threadId: THREAD_ID,
      scope: "contact",
      contactId: CONTACT_ID,
    });

    expect(mockDeleteAdminAiThread).toHaveBeenCalledWith({ threadId: THREAD_ID });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/admin/contacts/${CONTACT_ID}`);
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1);
  });
});
