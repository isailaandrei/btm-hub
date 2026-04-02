import type { Metadata } from "next";
import Link from "next/link";
import { getAuthUser } from "@/lib/data/auth";
import {
  getThreads,
  getForumTopics,
  getThreadsGroupedByTopic,
  searchThreads,
} from "@/lib/data/forum";
import { ThreadCard } from "@/components/community/ThreadCard";
import { TopicGroup } from "@/components/community/TopicGroup";
import { SearchBar } from "@/components/community/SearchBar";
import { PaginationControls } from "@/components/community/PaginationControls";
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
  searchParams: Promise<{
    cursor?: string;
    cursor_id?: string;
    topic?: string;
    q?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await getAuthUser();

  // Determine which view to render
  const searchQuery = params.q?.trim() || undefined;
  const topicFilter = params.topic || undefined;

  // --- Search view ---
  if (searchQuery) {
    const results = await searchThreads(searchQuery);

    return (
      <div className="mx-auto max-w-2xl">
        <Header user={user} />
        <div className="mb-4">
          <SearchBar />
        </div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Results for &ldquo;{searchQuery}&rdquo;
          </p>
          <Link
            href="/community"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </Link>
        </div>
        {results.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No threads found matching your search.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {results.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- Topic filter view (See all for a topic) ---
  if (topicFilter) {
    const topics = await getForumTopics();
    const topicSlugs = new Set(topics.map((t) => t.slug));
    const activeTopic = topicSlugs.has(topicFilter) ? topicFilter : undefined;

    if (!activeTopic) {
      return (
        <div className="mx-auto max-w-2xl">
          <Header user={user} />
          <div className="mb-4">
            <SearchBar />
          </div>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">Topic not found.</p>
            </CardContent>
          </Card>
        </div>
      );
    }

    const cursor =
      params.cursor && params.cursor_id && isUUID(params.cursor_id) && isValidISODate(params.cursor)
        ? { ts: params.cursor, id: params.cursor_id }
        : undefined;

    const result = await getThreads({ topic: activeTopic, cursor, limit: 10 });
    const { pinned, data: threads, nextCursor } = result;
    const topicInfo = topics.find((t) => t.slug === activeTopic);
    const basePath = `/community?topic=${activeTopic}`;

    // On page 2+ (cursor set), pinned threads aren't shown again
    const allThreads = cursor ? threads : [...pinned, ...threads];

    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {topicInfo?.name ?? "Community"}
            </h1>
            {topicInfo?.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {topicInfo.description}
              </p>
            )}
          </div>
          {user && (
            <Button asChild size="sm" className="gap-1.5 md:hidden">
              <Link href="/community/new">
                <PenSquare className="h-4 w-4" />
                Post
              </Link>
            </Button>
          )}
        </div>
        <div className="mb-4">
          <SearchBar />
        </div>
        {allThreads.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No posts in this topic yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {allThreads.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </div>
        )}
        <PaginationControls nextCursor={nextCursor} basePath={basePath} />
      </div>
    );
  }

  // --- Default: Grouped-by-topic view ---
  const groups = await getThreadsGroupedByTopic();

  return (
    <div className="mx-auto max-w-2xl">
      <Header user={user} />
      <div className="mb-4">
        <SearchBar />
      </div>
      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No posts yet. Be the first to share something!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <TopicGroup
              key={group.topic.slug}
              topic={group.topic}
              threads={group.threads}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Header({ user }: { user: { id: string } | null }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Community</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect with divers, freedivers, and ocean lovers worldwide.
        </p>
      </div>
      {user && (
        <Button asChild size="sm" className="gap-1.5 md:hidden">
          <Link href="/community/new">
            <PenSquare className="h-4 w-4" />
            Post
          </Link>
        </Button>
      )}
    </div>
  );
}
