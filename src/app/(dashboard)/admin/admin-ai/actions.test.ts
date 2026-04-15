import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminAiQueryPlan,
  AdminAiResponse,
  AdminAiThread,
} from "@/types/admin-ai";

const THREAD_ID = "33333333-3333-4333-8333-333333333333";
const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const USER_MESSAGE_ID = "44444444-4444-4444-8444-444444444444";
const ASSISTANT_MESSAGE_ID = "55555555-5555-4555-8555-555555555555";

const mockCreateAdminAiThread = vi.fn();
const mockCreateAdminAiMessage = vi.fn();
const mockGetAdminAiThreadDetail = vi.fn();
const mockRenameAdminAiThread = vi.fn();
const mockDeleteAdminAiThread = vi.fn();
const mockRunAdminAiAnalysis = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("@/lib/data/admin-ai", () => ({
  createAdminAiThread: mockCreateAdminAiThread,
  createAdminAiMessage: mockCreateAdminAiMessage,
  getAdminAiThreadDetail: mockGetAdminAiThreadDetail,
  renameAdminAiThread: mockRenameAdminAiThread,
  deleteAdminAiThread: mockDeleteAdminAiThread,
}));

vi.mock("@/lib/admin-ai/orchestrator", () => ({
  runAdminAiAnalysis: mockRunAdminAiAnalysis,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
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
    summary: "Joana is a strong fit for the brief.",
    keyFindings: ["Strong conservation motivation."],
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

describe("askAdminAiQuestion", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreateAdminAiThread.mockReset();
    mockCreateAdminAiMessage.mockReset();
    mockRunAdminAiAnalysis.mockReset();
    mockRevalidatePath.mockReset();
  });

  it("creates a new thread when no threadId is provided", async () => {
    mockCreateAdminAiThread.mockResolvedValue({ id: THREAD_ID });
    mockCreateAdminAiMessage.mockResolvedValue({ id: USER_MESSAGE_ID });
    mockRunAdminAiAnalysis.mockResolvedValue({
      status: "complete",
      assistantMessageId: ASSISTANT_MESSAGE_ID,
      queryPlan: makePlan(),
      response: makeResponse(),
      citations: [],
      modelMetadata: null,
      error: null,
    });

    const { askAdminAiQuestion } = await import("./actions");
    const formData = new FormData();
    formData.set("scope", "global");
    formData.set("question", "Find strong candidates");

    const result = await askAdminAiQuestion(
      {
        errors: null,
        message: null,
        success: false,
        thread: null,
        messages: null,
      },
      formData,
    );

    expect(mockCreateAdminAiThread).toHaveBeenCalledWith({
      scope: "global",
      title: "Find strong candidates",
    });
    expect(mockCreateAdminAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: THREAD_ID,
        role: "user",
        content: "Find strong candidates",
        status: "complete",
      }),
    );
    expect(mockRunAdminAiAnalysis).toHaveBeenCalledWith({
      scope: "global",
      threadId: THREAD_ID,
      question: "Find strong candidates",
      contactId: undefined,
    });
    expect(result.success).toBe(true);
    expect(result.thread?.id).toBe(THREAD_ID);
    expect(result.messages).toHaveLength(2);
  });

  it("appends to an existing owned thread when threadId is provided", async () => {
    mockCreateAdminAiMessage.mockResolvedValue({ id: USER_MESSAGE_ID });
    mockRunAdminAiAnalysis.mockResolvedValue({
      status: "complete",
      assistantMessageId: ASSISTANT_MESSAGE_ID,
      queryPlan: makePlan(),
      response: makeResponse(),
      citations: [],
      modelMetadata: null,
      error: null,
    });

    const { askAdminAiQuestion } = await import("./actions");
    const formData = new FormData();
    formData.set("scope", "contact");
    formData.set("contactId", CONTACT_ID);
    formData.set("threadId", THREAD_ID);
    formData.set("threadTitle", "Existing contact synthesis");
    formData.set("threadCreatedAt", "2026-04-15T00:00:00Z");
    formData.set("question", "Summarize this contact");

    const result = await askAdminAiQuestion(
      {
        errors: null,
        message: null,
        success: false,
        thread: null,
        messages: null,
      },
      formData,
    );

    expect(mockCreateAdminAiThread).not.toHaveBeenCalled();
    expect(mockCreateAdminAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: THREAD_ID,
        role: "user",
        content: "Summarize this contact",
      }),
    );
    expect(mockRunAdminAiAnalysis).toHaveBeenCalledWith({
      scope: "contact",
      threadId: THREAD_ID,
      question: "Summarize this contact",
      contactId: CONTACT_ID,
    });
    expect(result.success).toBe(true);
    expect(result.thread?.id).toBe(THREAD_ID);
    expect(result.thread?.title).toBe("Existing contact synthesis");
    expect(result.thread?.createdAt).toBe("2026-04-15T00:00:00Z");
  });

  it("returns a failure state and still includes the failed assistant message when analysis throws", async () => {
    mockCreateAdminAiThread.mockResolvedValue({ id: THREAD_ID });
    mockCreateAdminAiMessage.mockResolvedValue({ id: USER_MESSAGE_ID });
    const failure = Object.assign(new Error("Provider returned unknown evidence id: missing-evidence"), {
      assistantMessageId: ASSISTANT_MESSAGE_ID,
    });
    mockRunAdminAiAnalysis.mockRejectedValue(failure);

    const { askAdminAiQuestion } = await import("./actions");
    const formData = new FormData();
    formData.set("scope", "global");
    formData.set("question", "Find strong candidates");

    const result = await askAdminAiQuestion(
      {
        errors: null,
        message: null,
        success: false,
        thread: null,
        messages: null,
      },
      formData,
    );

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/missing-evidence/i);
    expect(result.messages).toHaveLength(2);
    expect(result.messages?.[1]).toEqual(
      expect.objectContaining({
        id: ASSISTANT_MESSAGE_ID,
        status: "failed",
      }),
    );
  });
});

describe("loadAdminAiThread", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAdminAiThreadDetail.mockReset();
  });

  it("returns a serialized thread detail payload with citations attached per message", async () => {
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
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/admin/contacts/${CONTACT_ID}`);
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
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/admin/contacts/${CONTACT_ID}`);
  });
});
