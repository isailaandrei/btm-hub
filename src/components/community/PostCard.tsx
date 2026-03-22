"use client";

import { useState, useTransition } from "react";
import { MarkdownContent } from "./MarkdownContent";
import { MarkdownEditor } from "./MarkdownEditor";
import { RelativeTime } from "./RelativeTime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ForumPostWithAuthor } from "@/types/database";

interface PostCardProps {
  post: ForumPostWithAuthor;
  currentUserId?: string | null;
  isAdmin?: boolean;
  onEdit?: (id: string, body: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export function PostCard({
  post,
  currentUserId,
  isAdmin = false,
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
    if (!body?.trim() || !onEdit) return;
    setError(null);
    startTransition(async () => {
      try {
        await onEdit(post.id, body);
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
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {(post.author?.display_name?.[0] ?? "?").toUpperCase()}
          </div>
          <span className="font-medium text-foreground">{authorName}</span>
          <span className="text-muted-foreground">&middot;</span>
          <span className="text-muted-foreground">
            <RelativeTime date={post.created_at} />
          </span>
          {isEdited && (
            <span className="text-muted-foreground italic text-xs">(edited)</span>
          )}
          {post.is_op && <Badge variant="secondary">OP</Badge>}
        </div>
        {canModify && !editing && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="xs"
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
          <MarkdownEditor
            name="body"
            defaultValue={post.body}
            rows={6}
            required
          />
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
          <MarkdownContent content={post.body} />
        </div>
      )}
      {error && (
        <p className="pl-9 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
