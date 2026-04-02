import { MessageSquare } from "lucide-react";

export default function MessagesPage() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center text-center">
      <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground" />
      <h2 className="text-lg font-semibold text-foreground">Your messages</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a conversation from the sidebar or start a new one
      </p>
    </div>
  );
}
