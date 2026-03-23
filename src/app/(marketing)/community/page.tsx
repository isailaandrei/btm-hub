import type { Metadata } from "next";
import Link from "next/link";
import { getAuthUser } from "@/lib/data/auth";
import { getRecentThreads, getThreadsByTopic } from "@/lib/data/forum";
import { FORUM_TOPICS, getForumTopic } from "@/lib/community/topics";
import { FeedCard } from "@/components/community/FeedCard";
import { PaginationControls } from "@/components/community/PaginationControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isUUID, isValidISODate } from "@/lib/validation-helpers";
import type { ForumTopicSlug } from "@/types/database";

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

  const activeTopic = params.topic && getForumTopic(params.topic)
    ? (params.topic as ForumTopicSlug)
    : undefined;

  const [user, result] = await Promise.all([
    getAuthUser(),
    activeTopic
      ? getThreadsByTopic(activeTopic, { cursor, limit: 10 })
      : getRecentThreads({ cursor, limit: 10 }),
  ]);

  const { pinned, data: threads, nextCursor } = result;
  const basePath = activeTopic ? `/community?topic=${activeTopic}` : "/community";

  return (
    <div className="min-h-screen bg-muted px-5 py-20">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="mb-3 text-[length:var(--font-size-h1)] font-medium text-foreground">
            Community
          </h1>
          <p className="mx-auto mb-5 max-w-lg text-muted-foreground">
            Connect with divers, freedivers, and ocean lovers worldwide. Share
            stories, ask questions, and learn from each other.
          </p>
          {user && (
            <Button asChild>
              <Link href="/community/new">New Post</Link>
            </Button>
          )}
        </div>

        {/* Topic filter chips */}
        <div className="mb-6 flex flex-wrap gap-2">
          <Link href="/community">
            <Badge
              variant={!activeTopic ? "default" : "secondary"}
              className="cursor-pointer"
            >
              All
            </Badge>
          </Link>
          {Object.values(FORUM_TOPICS).map((topic) => (
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
              <FeedCard key={thread.id} thread={thread} />
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
              <FeedCard key={thread.id} thread={thread} />
            ))}
          </div>
        )}

        <PaginationControls
          nextCursor={nextCursor}
          basePath={basePath}
        />
      </div>
    </div>
  );
}
