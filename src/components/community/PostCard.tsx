"use client";

import { useState, useTransition, lazy, Suspense } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { PostBody } from "./PostBody";
import { MarkdownEditor } from "./MarkdownEditor";
import { RelativeTime } from "./RelativeTime";
import { LikeButton } from "./LikeButton";
import { UserAvatar } from "./UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ForumPostWithAuthor, BodyFormat } from "@/types/database";

const RichTextEditor = lazy(() =>
  import("./RichTextEditor").then((m) => ({ default: m.RichTextEditor })),
);

interface PostCardProps {
  post: ForumPostWithAuthor;
  currentUserId?: string | null;
  isAdmin?: boolean;
  liked?: boolean;
  onEdit?: (id: string, body: string, bodyFormat: BodyFormat) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export function PostCard({
  post,
  currentUserId,
  isAdmin = false,
  liked = false,
  onEdit,
  onDelete,
}: PostCardProps) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const authorName = post.author?.display_name ?? "[deleted user]";
  const isOwner = currentUserId != null && post.author_id === currentUserId;
  const canModify = isOwner || isAdmin;
  const isEdited = post.updated_at !== post.created_at;

  function handleEdit(formData: FormData) {
    const body = formData.get("body") as string;
    const bodyFormat = (formData.get("bodyFormat") as BodyFormat) || post.body_format;
    if (!body?.trim() || !onEdit) return;
    setError(null);
    startTransition(async () => {
      try {
        await onEdit(post.id, body, bodyFormat);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save edit");
      }
    });
  }

  function handleDelete() {
    if (!onDelete) return;
    if (!confirm("Are you sure you want to delete this?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await onDelete(post.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <UserAvatar
            name={post.author?.display_name ?? null}
            avatarUrl={post.author?.avatar_url}
            size="sm"
          />
          <span className="font-medium text-foreground">{authorName}</span>
          <span className="text-muted-foreground">&middot;</span>
          <span className="text-muted-foreground">
            <RelativeTime date={post.created_at} />
          </span>
          {isEdited && (
            <span className="text-muted-foreground italic text-xs">(edited)</span>
          )}
          {post.is_op && <Badge variant="secondary">OP</Badge>}
          {currentUserId && post.author_id && post.author_id !== currentUserId && (
            <Link
              href={`/community/messages?start=${post.author_id}`}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-primary"
              title={`Message ${authorName}`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
        {canModify && !editing && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isPending}
                className="text-destructive hover:text-destructive"
              >
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <form action={handleEdit}>
          {post.body_format === "html" ? (
            <Suspense fallback={<p className="text-sm text-muted-foreground">Loading editor...</p>}>
              <RichTextEditor
                name="body"
                defaultValue={post.body}
              />
            </Suspense>
          ) : (
            <MarkdownEditor
              name="body"
              defaultValue={post.body}
              rows={6}
              required
            />
          )}
          <div className="mt-2 flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="pl-9 text-sm">
          <PostBody body={post.body} bodyFormat={post.body_format} />
        </div>
      )}

      <div className="pl-9">
        <LikeButton
          postId={post.id}
          likeCount={post.like_count}
          liked={liked}
        />
      </div>

      {error && (
        <p className="pl-9 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
