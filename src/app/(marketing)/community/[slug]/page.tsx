import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/data/auth";
import { getProfile } from "@/lib/data/profiles";
import { getThreadBySlug, getThreadReplies, getUserLikedPostIds, getForumTopics } from "@/lib/data/forum";
import { ForumBreadcrumb } from "@/components/community/ForumBreadcrumb";
import { ThreadActions } from "@/components/community/ThreadActions";
import { ReplyForm } from "@/components/community/ReplyForm";
import { PaginationControls } from "@/components/community/PaginationControls";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const thread = await getThreadBySlug(slug);
  if (!thread) return {};

  return {
    title: `${thread.title} | Community | BTM Hub`,
    description: thread.title,
  };
}

export default async function PostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string; cursor_id?: string }>;
}) {
  const { slug } = await params;
  const thread = await getThreadBySlug(slug);
  if (!thread) notFound();

  const sp = await searchParams;
  // Replies use offset-based pagination (cursor.ts is a numeric offset)
  const cursor =
    sp.cursor && /^\d+$/.test(sp.cursor)
      ? { ts: sp.cursor, id: sp.cursor_id ?? "0" }
      : undefined;

  const [user, { data: posts, nextCursor }, profile, topics] = await Promise.all([
    getAuthUser(),
    getThreadReplies(thread.id, { cursor, limit: 50 }),
    getProfile(),
    getForumTopics(),
  ]);

  const topicName = thread.topic
    ? topics.find((t) => t.slug === thread.topic)?.name ?? null
    : null;

  const isAdmin = profile?.role === "admin";

  const opPost = posts.find((p) => p.is_op);
  const replies = posts.filter((p) => !p.is_op);

  if (!opPost) notFound();

  // Get liked status for all visible posts
  const allPostIds = posts.map((p) => p.id);
  const likedPostIds = user
    ? await getUserLikedPostIds(user.id, allPostIds)
    : new Set<string>();

  const currentPath = `/community/${slug}`;

  return (
    <div className="mx-auto max-w-3xl">
      <ForumBreadcrumb
        items={[{ label: thread.title }]}
      />

      <ThreadActions
        thread={thread}
        topicName={topicName}
        opPost={opPost}
        replies={replies}
        currentUserId={user?.id ?? null}
        isAdmin={isAdmin}
        likedPostIds={likedPostIds}
      />

      <PaginationControls
        nextCursor={nextCursor}
        basePath={currentPath}
      />

      <div className="mt-8">
        <ReplyForm
          threadId={thread.id}
          isLocked={thread.locked}
          isAuthenticated={!!user}
          isAdmin={isAdmin}
          redirectPath={currentPath}
        />
      </div>
    </div>
  );
}
