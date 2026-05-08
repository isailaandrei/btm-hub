import { notFound } from "next/navigation";
import Link from "next/link";
import { getAuthUser } from "@/lib/data/auth";
import { getConversation, getMessages } from "@/lib/data/messages";
import { MessageThread } from "@/components/community/MessageThread";
import { UserAvatar } from "@/components/community/UserAvatar";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  const [user, conversation, messages] = await Promise.all([
    getAuthUser(),
    getConversation(conversationId),
    getMessages(conversationId),
  ]);

  if (!user || !conversation) notFound();

  const recipientId =
    conversation.user1_id === user.id ? conversation.user2_id : conversation.user1_id;

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col rounded-xl bg-card ring-1 ring-foreground/10">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link
          href={`/community/members/${conversation.participant?.id}`}
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <UserAvatar
            name={conversation.participant?.display_name ?? null}
            avatarUrl={conversation.participant?.avatar_url}
            size="sm"
          />
          <h2 className="text-sm font-semibold text-foreground">
            {conversation.participant?.display_name || "Unknown user"}
          </h2>
        </Link>
      </div>

      {/* Messages */}
      <MessageThread
        conversationId={conversationId}
        currentUserId={user.id}
        recipientId={recipientId}
        initialMessages={messages}
        recipientLastReadAt={null}
      />

    </div>
  );
}
