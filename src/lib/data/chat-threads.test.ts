import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mockCreateAdminClient,
}));

const THREAD_ID = "00000000-0000-4000-8000-000000000099";
const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";

function createQuery(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "insert", "upsert", "single", "maybeSingle", "abortSignal"]) {
    query[method] = overrides[method] ?? vi.fn(() => query);
  }
  return query;
}

describe("chat thread data helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the same direct participant key regardless of sender order", async () => {
    const { buildDirectParticipantKey } = await import("./chat-threads");

    expect(buildDirectParticipantKey(USER_A, USER_B)).toBe(`${USER_A}:${USER_B}`);
    expect(buildDirectParticipantKey(USER_B, USER_A)).toBe(`${USER_A}:${USER_B}`);
  });

  it("creates a direct app thread with deterministic Stream channel mapping", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(THREAD_ID);

    const existingQuery = createQuery({
      maybeSingle: vi.fn(async () => ({
        data: null,
        error: { code: "PGRST116", message: "No rows" },
      })),
    });
    const insertQuery = createQuery({
      insert: vi.fn(() => insertQuery),
      single: vi.fn(async () => ({
        data: {
          id: THREAD_ID,
          kind: "direct",
          provider: "stream",
          provider_channel_id: THREAD_ID,
          provider_channel_cid: `messaging:${THREAD_ID}`,
          direct_participant_key: `${USER_A}:${USER_B}`,
          created_by: USER_A,
          created_at: "2026-05-13T00:00:00.000Z",
          updated_at: "2026-05-13T00:00:00.000Z",
        },
        error: null,
      })),
    });
    const participantQuery = createQuery({
      upsert: vi.fn(async () => ({ error: null })),
    });

    mockCreateAdminClient.mockResolvedValue({
      from: vi
        .fn()
        .mockReturnValueOnce(existingQuery)
        .mockReturnValueOnce(insertQuery)
        .mockReturnValueOnce(participantQuery),
    });

    const { getOrCreateDirectChatThread } = await import("./chat-threads");

    const thread = await getOrCreateDirectChatThread({
      currentUserId: USER_B,
      recipientId: USER_A,
    });

    expect(insertQuery.insert).toHaveBeenCalledWith({
      id: THREAD_ID,
      kind: "direct",
      provider: "stream",
      provider_channel_id: THREAD_ID,
      provider_channel_cid: `messaging:${THREAD_ID}`,
      direct_participant_key: `${USER_A}:${USER_B}`,
      created_by: USER_B,
    });
    expect(participantQuery.upsert).toHaveBeenCalledWith(
      [
        { thread_id: THREAD_ID, profile_id: USER_B },
        { thread_id: THREAD_ID, profile_id: USER_A },
      ],
      { onConflict: "thread_id,profile_id" },
    );
    expect(thread.id).toBe(THREAD_ID);
    expect(thread.provider_channel_cid).toBe(`messaging:${THREAD_ID}`);
  });

  it("resolves notification recipients from registered thread participants", async () => {
    const threadQuery = createQuery({
      maybeSingle: vi.fn(async () => ({
        data: {
          id: THREAD_ID,
          kind: "direct",
          provider: "stream",
          provider_channel_id: THREAD_ID,
          provider_channel_cid: `messaging:${THREAD_ID}`,
          direct_participant_key: `${USER_A}:${USER_B}`,
          created_by: USER_A,
          created_at: "2026-05-13T00:00:00.000Z",
          updated_at: "2026-05-13T00:00:00.000Z",
        },
        error: null,
      })),
    });
    const participantQuery = createQuery();
    participantQuery.then = vi.fn((resolve) =>
      resolve({
        data: [{ profile_id: USER_A }, { profile_id: USER_B }],
        error: null,
      }),
    );

    mockCreateAdminClient.mockResolvedValue({
      from: vi.fn().mockReturnValueOnce(threadQuery).mockReturnValueOnce(participantQuery),
    });

    const { getStreamChatThreadNotificationContext } = await import("./chat-threads");

    await expect(
      getStreamChatThreadNotificationContext({
        streamChannelCid: `messaging:${THREAD_ID}`,
        senderId: USER_A,
      }),
    ).resolves.toMatchObject({
      thread: { id: THREAD_ID },
      recipientIds: [USER_B],
    });
  });

  it("returns null when a user is not a participant in the requested thread", async () => {
    const threadQuery = createQuery({
      maybeSingle: vi.fn(async () => ({
        data: null,
        error: { code: "PGRST116", message: "No rows" },
      })),
    });

    mockCreateAdminClient.mockResolvedValue({
      from: vi.fn().mockReturnValueOnce(threadQuery),
    });

    const { getChatThreadForUser } = await import("./chat-threads");

    await expect(
      getChatThreadForUser({
        threadId: THREAD_ID,
        userId: USER_B,
      }),
    ).resolves.toBeNull();
  });
});
