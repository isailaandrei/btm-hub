import { createAdminClient } from "@/lib/supabase/admin";
import { validateUUID } from "@/lib/validation-helpers";
import type { ChatThread } from "@/types/database";

// The Stream webhook awaits getStreamChatThreadNotificationContext on every
// inbound message, so bound its DB reads: a saturated database must fail fast
// rather than hold the (fixed-capacity) webhook handler open. See the CLAUDE.md
// storm-proofing invariant and the Jun 2026 Fluid-burn incident.
const STREAM_WEBHOOK_DB_TIMEOUT_MS = 5000;

const CHAT_THREAD_COLUMNS = `
  id,
  kind,
  provider,
  provider_channel_id,
  provider_channel_cid,
  direct_participant_key,
  created_by,
  created_at,
  updated_at
`;

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

interface GetOrCreateDirectChatThreadInput {
  currentUserId: string;
  recipientId: string;
}

interface GetChatThreadForUserInput {
  threadId: string;
  userId: string;
}

interface StreamThreadNotificationContextInput {
  streamChannelCid: string;
  senderId: string;
}

export function buildDirectParticipantKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(":");
}

export function getStreamChannelIdForThread(threadId: string): string {
  validateUUID(threadId, "chat thread");
  return threadId;
}

export function getStreamChannelCidForThread(threadId: string): string {
  return `messaging:${getStreamChannelIdForThread(threadId)}`;
}

function isNotFoundError(error: SupabaseErrorLike | null | undefined): boolean {
  return error?.code === "PGRST116";
}

function isUniqueViolation(error: SupabaseErrorLike | null | undefined): boolean {
  return error?.code === "23505";
}

function formatSupabaseError(error: SupabaseErrorLike | null | undefined): string {
  return error?.message ?? "Unknown database error";
}

async function findDirectChatThread(directParticipantKey: string): Promise<ChatThread | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("chat_threads")
    .select(CHAT_THREAD_COLUMNS)
    .eq("kind", "direct")
    .eq("provider", "stream")
    .eq("direct_participant_key", directParticipantKey)
    .maybeSingle();

  if (error && !isNotFoundError(error)) {
    throw new Error(`Failed to fetch chat thread: ${formatSupabaseError(error)}`);
  }

  return (data as ChatThread | null) ?? null;
}

async function upsertDirectParticipants(
  threadId: string,
  currentUserId: string,
  recipientId: string,
): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase.from("chat_thread_participants").upsert(
    [
      { thread_id: threadId, profile_id: currentUserId },
      { thread_id: threadId, profile_id: recipientId },
    ],
    { onConflict: "thread_id,profile_id" },
  );

  if (error) {
    throw new Error(
      `Failed to save chat thread participants: ${formatSupabaseError(error)}`,
    );
  }
}

export async function getOrCreateDirectChatThread({
  currentUserId,
  recipientId,
}: GetOrCreateDirectChatThreadInput): Promise<ChatThread> {
  validateUUID(currentUserId, "current user");
  validateUUID(recipientId, "recipient");

  if (currentUserId === recipientId) {
    throw new Error("You cannot message yourself.");
  }

  const directParticipantKey = buildDirectParticipantKey(currentUserId, recipientId);
  const existing = await findDirectChatThread(directParticipantKey);
  if (existing) {
    await upsertDirectParticipants(existing.id, currentUserId, recipientId);
    return existing;
  }

  const threadId = crypto.randomUUID();
  const providerChannelId = getStreamChannelIdForThread(threadId);
  const providerChannelCid = getStreamChannelCidForThread(threadId);
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("chat_threads")
    .insert({
      id: threadId,
      kind: "direct",
      provider: "stream",
      provider_channel_id: providerChannelId,
      provider_channel_cid: providerChannelCid,
      direct_participant_key: directParticipantKey,
      created_by: currentUserId,
    })
    .select(CHAT_THREAD_COLUMNS)
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const racedThread = await findDirectChatThread(directParticipantKey);
      if (racedThread) {
        await upsertDirectParticipants(racedThread.id, currentUserId, recipientId);
        return racedThread;
      }
    }

    throw new Error(`Failed to create chat thread: ${formatSupabaseError(error)}`);
  }

  const thread = data as ChatThread;
  await upsertDirectParticipants(thread.id, currentUserId, recipientId);
  return thread;
}

export async function getChatThreadForUser({
  threadId,
  userId,
}: GetChatThreadForUserInput): Promise<ChatThread | null> {
  validateUUID(threadId, "chat thread");
  validateUUID(userId, "user");

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("chat_threads")
    .select(`${CHAT_THREAD_COLUMNS}, chat_thread_participants!inner(profile_id)`)
    .eq("id", threadId)
    .eq("provider", "stream")
    .eq("chat_thread_participants.profile_id", userId)
    .maybeSingle();

  if (error && !isNotFoundError(error)) {
    throw new Error(`Failed to fetch chat thread: ${formatSupabaseError(error)}`);
  }

  return (data as ChatThread | null) ?? null;
}

export async function getStreamChatThreadNotificationContext({
  streamChannelCid,
  senderId,
}: StreamThreadNotificationContextInput): Promise<{
  thread: ChatThread;
  recipientIds: string[];
} | null> {
  const supabase = await createAdminClient();
  const { data: thread, error: threadError } = await supabase
    .from("chat_threads")
    .select(CHAT_THREAD_COLUMNS)
    .eq("provider", "stream")
    .eq("provider_channel_cid", streamChannelCid)
    .abortSignal(AbortSignal.timeout(STREAM_WEBHOOK_DB_TIMEOUT_MS))
    .maybeSingle();

  if (threadError && !isNotFoundError(threadError)) {
    throw new Error(`Failed to fetch chat thread: ${formatSupabaseError(threadError)}`);
  }

  if (!thread) return null;

  const { data: participants, error: participantError } = await supabase
    .from("chat_thread_participants")
    .select("profile_id")
    .eq("thread_id", (thread as ChatThread).id)
    .abortSignal(AbortSignal.timeout(STREAM_WEBHOOK_DB_TIMEOUT_MS));

  if (participantError) {
    throw new Error(
      `Failed to fetch chat thread participants: ${formatSupabaseError(participantError)}`,
    );
  }

  const recipientIds = Array.from(
    new Set(
      ((participants ?? []) as Array<{ profile_id: string }>)
        .map((participant) => participant.profile_id)
        .filter((profileId) => profileId !== senderId),
    ),
  );

  return {
    thread: thread as ChatThread,
    recipientIds,
  };
}
