import type { Metadata } from "next";
import Link from "next/link";
import { getAuthUser } from "@/lib/data/auth";
import { getForumTopics } from "@/lib/data/forum";
import { ForumBreadcrumb } from "@/components/community/ForumBreadcrumb";
import { NewPostForm } from "@/components/community/NewPostForm";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "New Post | Community | BTM Hub",
};

export default async function NewPostPage() {
  const [user, topics] = await Promise.all([getAuthUser(), getForumTopics()]);

  return (
    <div className="mx-auto max-w-3xl">
      <ForumBreadcrumb items={[{ label: "New Post" }]} />

      <h1 className="mb-6 text-2xl font-bold text-foreground">
        Share something with the community
      </h1>

      {user ? (
        <NewPostForm topics={topics} />
      ) : (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="mb-4 text-muted-foreground">
            You need to be logged in to create a post.
          </p>
          <Button asChild>
            <Link
              href={`/login?redirect=${encodeURIComponent("/community/new")}`}
            >
              Log in
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
