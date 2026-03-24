import type { Metadata } from "next";
import Link from "next/link";
import { getAuthUser } from "@/lib/data/auth";
import { getRecentThreads, getThreadsByTopic, getForumTopics, getTopRepliesForThreads, getUserLikedPostIds } from "@/lib/data/forum";
import { FeedCard } from "@/components/community/FeedCard";
import { PaginationControls } from "@/components/community/PaginationControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PenSquare } from "lucide-react";
import { isUUID, isValidISODate } from "@/lib/validation-helpers";

export const metadata: Metadata = {
  title: "Community | BTM Hub",
  description:
    "Connect with divers, freedivers, and ocean lovers worldwide. Share stories, ask questions, and learn from each other.",
};

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; cursor_id?: string; topic?: string }>;
}) {
  const params = await searchParams;

  const cursor =
    params.cursor && params.cursor_id && isUUID(params.cursor_id) && isValidISODate(params.cursor)
      ? { ts: params.cursor, id: params.cursor_id }
      : undefined;

  const [user, topics] = await Promise.all([
    getAuthUser(),
    getForumTopics(),
  ]);

  const topicSlugs = new Set(topics.map((t) => t.slug));
  const activeTopic = params.topic && topicSlugs.has(params.topic)
    ? params.topic
    : undefined;

  const result = activeTopic
    ? await getThreadsByTopic(activeTopic, { cursor, limit: 10 })
    : await getRecentThreads({ cursor, limit: 10 });

  const { pinned, data: threads, nextCursor } = result;
  const basePath = activeTopic ? `/community?topic=${activeTopic}` : "/community";
  const topicInfo = activeTopic ? topics.find((t) => t.slug === activeTopic) : null;

  // Fetch top 2 replies per thread for inline comment previews
  const allThreads = [...pinned, ...threads];
  const allThreadIds = allThreads.map((t) => t.id);
  const topRepliesMap = await getTopRepliesForThreads(allThreadIds, 2);

  // Fetch liked OP post IDs for authenticated user
  const opPostIds = allThreads.map((t) => t.op_post_id).filter(Boolean) as string[];
  const likedPostIds = user
    ? await getUserLikedPostIds(user.id, opPostIds)
    : new Set<string>();

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {topicInfo ? topicInfo.name : "Community"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {topicInfo
              ? topicInfo.description
              : "Connect with divers, freedivers, and ocean lovers worldwide."}
          </p>
        </div>
        {/* Mobile-only new post button (desktop has it in sidebar) */}
        {user && (
          <Button asChild size="sm" className="gap-1.5 md:hidden">
            <Link href="/community/new">
              <PenSquare className="h-4 w-4" />
              Post
            </Link>
          </Button>
        )}
      </div>

      {/* Mobile topic chips (hidden on desktop where sidebar handles this) */}
      <div className="mb-4 flex flex-wrap gap-1.5 md:hidden">
        <Link href="/community">
          <Badge
            variant={!activeTopic ? "default" : "secondary"}
            className="cursor-pointer"
          >
            All
          </Badge>
        </Link>
        {topics.map((topic) => (
          <Link key={topic.slug} href={`/community?topic=${topic.slug}`}>
            <Badge
              variant={activeTopic === topic.slug ? "default" : "secondary"}
              className="cursor-pointer"
            >
              {topic.name}
            </Badge>
          </Link>
        ))}
      </div>

      {/* Pinned posts */}
      {!cursor && pinned.length > 0 && (
        <div className="mb-4 flex flex-col gap-3">
          {pinned.map((thread) => (
            <FeedCard
              key={thread.id}
              thread={thread}
              topReplies={topRepliesMap.get(thread.id)}
              liked={thread.op_post_id ? likedPostIds.has(thread.op_post_id) : false}
              isAuthenticated={!!user}
            />
          ))}
        </div>
      )}

      {/* Feed */}
      {threads.length === 0 && pinned.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No posts yet. Be the first to share something!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {threads.map((thread) => (
            <FeedCard
              key={thread.id}
              thread={thread}
              topReplies={topRepliesMap.get(thread.id)}
              liked={thread.op_post_id ? likedPostIds.has(thread.op_post_id) : false}
              isAuthenticated={!!user}
            />
          ))}
        </div>
      )}

      <PaginationControls
        nextCursor={nextCursor}
        basePath={basePath}
      />
    </div>
  );
}
