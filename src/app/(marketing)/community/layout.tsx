import { getAuthUser } from "@/lib/data/auth";
import { getProfile } from "@/lib/data/profiles";
import { getForumTopics } from "@/lib/data/forum";
import { ChannelSidebar } from "@/components/community/ChannelSidebar";

export default async function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, profile, topics] = await Promise.all([
    getAuthUser(),
    getProfile(),
    getForumTopics(),
  ]);

  const isAdmin = profile?.role === "admin";

  return (
    <div className="min-h-screen bg-muted px-4 pt-20 pb-12">
      <div className="mx-auto flex max-w-6xl gap-6">
        <ChannelSidebar
          topics={topics}
          isAuthenticated={!!user}
          isAdmin={isAdmin}
          currentUserId={user?.id ?? null}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
