import { StreamChatProvider } from "@/components/community/stream-chat-provider";
import { getChatThreadForUser } from "@/lib/data/chat-threads";
import { getAuthUser } from "@/lib/data/auth";
import { isUUID } from "@/lib/validation-helpers";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { start, thread } = await searchParams;
  const requestedThreadId = typeof thread === "string" && isUUID(thread) ? thread : null;
  const user = requestedThreadId ? await getAuthUser() : null;
  const chatThread =
    requestedThreadId && user
      ? await getChatThreadForUser({
          threadId: requestedThreadId,
          userId: user.id,
        })
      : null;

  return (
    <StreamChatProvider
      startRecipientId={typeof start === "string" ? start : null}
      initialThreadId={chatThread?.id ?? null}
      initialCid={chatThread?.provider_channel_cid ?? null}
    />
  );
}
