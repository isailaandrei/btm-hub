import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getForumTopic } from "@/lib/community/topics";
import { getAuthUser } from "@/lib/data/auth";
import { getThreadsByTopic } from "@/lib/data/forum";
import type { ForumTopicSlug } from "@/types/database";
import { ForumBreadcrumb } from "@/components/community/ForumBreadcrumb";
import { ThreadList } from "@/components/community/ThreadList";
import { PaginationControls } from "@/components/community/PaginationControls";
import { Button } from "@/components/ui/button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string }>;
}): Promise<Metadata> {
  const { topic: topicSlug } = await params;
  const topic = getForumTopic(topicSlug);
  if (!topic) return {};

  return {
    title: `${topic.name} | Community | BTM Hub`,
    description: topic.description,
  };
}

export default async function TopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ topic: string }>;
  searchParams: Promise<{ cursor?: string; cursor_id?: string }>;
}) {
  const { topic: topicSlug } = await params;
  const topic = getForumTopic(topicSlug);
  if (!topic) notFound();

  const sp = await searchParams;
  const cursor =
    sp.cursor && sp.cursor_id
      ? { ts: sp.cursor, id: sp.cursor_id }
      : undefined;

  const [user, { pinned, data: threads, nextCursor }] = await Promise.all([
    getAuthUser(),
    getThreadsByTopic(topicSlug as ForumTopicSlug, { cursor, limit: 20 }),
  ]);

  return (
    <div className="min-h-screen bg-muted px-5 py-20">
      <div className="mx-auto max-w-4xl">
        <ForumBreadcrumb items={[{ label: topic.name }]} />

        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              <span className="mr-2">{topic.icon}</span>
              {topic.name}
            </h1>
            <p className="mt-1 text-muted-foreground">{topic.description}</p>
          </div>
          {user && (
            <Button asChild className="shrink-0">
              <Link href={`/community/${topic.slug}/new`}>New Thread</Link>
            </Button>
          )}
        </div>

        {/* Pinned threads (only on first page) */}
        {!cursor && pinned.length > 0 && (
          <section className="mb-6">
            <ThreadList threads={pinned} />
          </section>
        )}

        <section>
          <ThreadList threads={threads} />
          <PaginationControls
            nextCursor={nextCursor}
            basePath={`/community/${topic.slug}`}
          />
        </section>
      </div>
    </div>
  );
}
