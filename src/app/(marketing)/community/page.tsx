import type { Metadata } from "next";
import Link from "next/link";
import { getAuthUser } from "@/lib/data/auth";
import { getRecentThreads } from "@/lib/data/forum";
import { TopicGrid } from "@/components/community/TopicGrid";
import { ThreadList } from "@/components/community/ThreadList";
import { PaginationControls } from "@/components/community/PaginationControls";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Community Forum | BTM Hub",
  description:
    "Connect with divers, freedivers, and ocean lovers worldwide. Share stories, ask questions, and learn from each other.",
};

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; cursor_id?: string }>;
}) {
  const params = await searchParams;

  const cursor =
    params.cursor && params.cursor_id
      ? { ts: params.cursor, id: params.cursor_id }
      : undefined;

  const [user, { data: threads, nextCursor }] = await Promise.all([
    getAuthUser(),
    getRecentThreads({ cursor, limit: 10 }),
  ]);

  return (
    <div className="min-h-screen bg-muted px-5 py-20">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-[length:var(--font-size-h1)] font-medium text-foreground">
            Community
          </h1>
          <p className="mx-auto mb-6 max-w-lg text-muted-foreground">
            Connect with divers, freedivers, and ocean lovers worldwide. Share
            stories, ask questions, and learn from each other.
          </p>
          {user && (
            <Button asChild>
              <Link href="/community/beginner-questions/new">New Thread</Link>
            </Button>
          )}
        </div>

        <section className="mb-12">
          <h2 className="mb-4 text-lg font-medium text-foreground">Topics</h2>
          <TopicGrid />
        </section>

        <section>
          <h2 className="mb-4 text-lg font-medium text-foreground">
            Recent Discussions
          </h2>
          <ThreadList
            threads={threads}
            emptyMessage="No discussions yet. Be the first to start one!"
          />
          <PaginationControls
            nextCursor={nextCursor}
            basePath="/community"
          />
        </section>
      </div>
    </div>
  );
}
