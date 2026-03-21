"use client";

import { useState, useTransition } from "react";
import { MarkdownContent } from "./MarkdownContent";
import { MarkdownEditor } from "./MarkdownEditor";
import { RelativeTime } from "./RelativeTime";
import { Button } from "@/components/ui/button";
import type { ForumPostWithAuthor, ForumThreadWithAuthor } from "@/types/database";

interface PostCardProps {
  post: ForumPostWithAuthor | ForumThreadWithAuthor;
  isOp?: boolean;
  currentUserId?: string | null;
  isAdmin?: boolean;
  onEdit?: (id: string, body: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export function PostCard({
  post,
  isOp = false,
  currentUserId,
  isAdmin = false,
  onEdit,
  onDelete,
}: PostCardProps) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const authorName = post.author?.display_name ?? "[deleted user]";
  const isOwner = currentUserId != null && post.author_id === currentUserId;
  const canModify = isOwner || isAdmin;
  const isEdited = post.updated_at !== post.created_at;

  function handleEdit(formData: FormData) {
    const body = formData.get("body") as string;
    if (!body?.trim() || !onEdit) return;
    startTransition(async () => {
      await onEdit(post.id, body);
      setEditing(false);
    });
  }

  function handleDelete() {
    if (!onDelete) return;
    if (!confirm("Are you sure you want to delete this?")) return;
    startTransition(() => onDelete(post.id));
  }

  return (
    <div className="flex flex-col gap-3 py-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground">{authorName}</span>
          <span className="text-muted-foreground">&middot;</span>
          <span className="text-muted-foreground">
            <RelativeTime date={post.created_at} />
          </span>
          {isEdited && (
            <span className="text-muted-foreground italic">(edited)</span>
          )}
          {isOp && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
              OP
            </span>
          )}
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
        <div className="text-sm">
          <MarkdownContent content={post.body} />
        </div>
      )}
    </div>
  );
}
