import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/data/auth";
import { getConversation, getMessages, getRecipientLastReadAt } from "@/lib/data/messages";
import { MessageThread } from "@/components/community/MessageThread";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  const [user, conversation, messages, recipientLastReadAt] = await Promise.all([
    getAuthUser(),
    getConversation(conversationId),
    getMessages(conversationId),
    getRecipientLastReadAt(conversationId),
  ]);

  if (!user || !conversation) notFound();

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col rounded-xl bg-card ring-1 ring-foreground/10">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-primary">
          {(conversation.participant?.display_name || "?")
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2)}
        </span>
        <h2 className="text-sm font-semibold text-foreground">
          {conversation.participant?.display_name || "Unknown user"}
        </h2>
      </div>

      {/* Messages */}
      <MessageThread
        conversationId={conversationId}
        currentUserId={user.id}
        initialMessages={messages}
        recipientLastReadAt={recipientLastReadAt}
      />

    </div>
  );
}
