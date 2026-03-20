import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getForumTopic } from "@/lib/community/topics";
import { getAuthUser } from "@/lib/data/auth";
import { ForumBreadcrumb } from "@/components/community/ForumBreadcrumb";
import { NewThreadForm } from "@/components/community/NewThreadForm";
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
    title: `New Thread - ${topic.name} | Community | BTM Hub`,
  };
}

export default async function NewThreadPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic: topicSlug } = await params;
  const topic = getForumTopic(topicSlug);
  if (!topic) notFound();

  const user = await getAuthUser();

  return (
    <div className="min-h-screen bg-muted px-5 py-20">
      <div className="mx-auto max-w-3xl">
        <ForumBreadcrumb
          items={[
            { label: topic.name, href: `/community/${topic.slug}` },
            { label: "New Thread" },
          ]}
        />

        <h1 className="mb-6 text-2xl font-bold text-foreground">
          Start a new discussion in {topic.name}
        </h1>

        {user ? (
          <NewThreadForm topic={topic.slug} />
        ) : (
          <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
            <p className="mb-4 text-muted-foreground">
              You need to be logged in to start a discussion.
            </p>
            <Button asChild>
              <Link
                href={`/login?redirect=${encodeURIComponent(`/community/${topic.slug}/new`)}`}
              >
                Log in
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
