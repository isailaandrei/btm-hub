import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getForumTopic } from "@/lib/community/topics";
import { getAuthUser } from "@/lib/data/auth";
import { getProfile } from "@/lib/data/profiles";
import { getThreadBySlug, getThreadReplies } from "@/lib/data/forum";
import type { ForumTopicSlug } from "@/types/database";
import { isUUID, isValidISODate } from "@/lib/validation-helpers";
import { ForumBreadcrumb } from "@/components/community/ForumBreadcrumb";
import { ThreadActions } from "@/components/community/ThreadActions";
import { ReplyForm } from "@/components/community/ReplyForm";
import { PaginationControls } from "@/components/community/PaginationControls";

// TODO(BTM-8): Add Supabase Realtime subscriptions for live reply updates

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string; slug: string }>;
}): Promise<Metadata> {
  const { topic: topicSlug, slug } = await params;
  const topic = getForumTopic(topicSlug);
  if (!topic) return {};

  const thread = await getThreadBySlug(topicSlug as ForumTopicSlug, slug);
  if (!thread) return {};

  const bodyPreview = thread.body.length > 160
    ? thread.body.slice(0, 160).trimEnd() + "..."
    : thread.body;

  return {
    title: `${thread.title} | ${topic.name} | BTM Hub`,
    description: bodyPreview,
  };
}

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ topic: string; slug: string }>;
  searchParams: Promise<{ cursor?: string; cursor_id?: string }>;
}) {
  const { topic: topicSlug, slug } = await params;
  const topic = getForumTopic(topicSlug);
  if (!topic) notFound();

  const thread = await getThreadBySlug(topicSlug as ForumTopicSlug, slug);
  if (!thread) notFound();

  const sp = await searchParams;
  const cursor =
    sp.cursor && sp.cursor_id && isUUID(sp.cursor_id) && isValidISODate(sp.cursor)
      ? { ts: sp.cursor, id: sp.cursor_id }
      : undefined;

  const [user, { data: replies, nextCursor }] = await Promise.all([
    getAuthUser(),
    getThreadReplies(thread.id, { cursor, limit: 50 }),
  ]);

  // Determine user role
  let isAdmin = false;
  if (user) {
    const profile = await getProfile();
    isAdmin = profile?.role === "admin";
  }

  const currentPath = `/community/${topic.slug}/${slug}`;

  return (
    <div className="min-h-screen bg-muted px-5 py-20">
      <div className="mx-auto max-w-4xl">
        <ForumBreadcrumb
          items={[
            { label: topic.name, href: `/community/${topic.slug}` },
            { label: thread.title },
          ]}
        />

        <ThreadActions
          thread={thread}
          replies={replies}
          topicName={topic.name}
          currentUserId={user?.id ?? null}
          isAdmin={isAdmin}
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
            redirectPath={currentPath}
          />
        </div>
      </div>
    </div>
  );
}
