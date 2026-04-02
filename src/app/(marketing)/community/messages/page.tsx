import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { getAuthUser } from "@/lib/data/auth";
import { createClient } from "@/lib/supabase/server";
import { isUUID } from "@/lib/validation-helpers";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { start } = await searchParams;

  // If ?start=userId is present, create/find conversation and redirect
  if (typeof start === "string" && isUUID(start)) {
    const user = await getAuthUser();
    if (user && start !== user.id) {
      const supabase = await createClient();
      const { data: convId } = await supabase.rpc("dm_get_or_create_conversation", {
        _other_user_id: start,
      });
      if (convId) {
        redirect(`/community/messages/${convId}`);
      }
    }
  }

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
