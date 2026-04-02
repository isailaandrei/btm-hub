"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { editMessage, deleteMessage } from "@/app/(marketing)/community/messages/actions";
import type { OptimisticDmMessage } from "@/types/database";

interface MessageBubbleProps {
  message: OptimisticDmMessage;
  isOwn: boolean;
  showSeen?: boolean;
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const isOptimistic = !!message._optimistic;
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDeleted = message.deleted_at !== null;

  const initials = (message.sender?.display_name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  async function handleEdit() {
    if (!editBody.trim()) return;
    setIsSubmitting(true);
    try {
      await editMessage(message.id, editBody, "text");
      setIsEditing(false);
    } catch {
      // Error handled by the action
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this message?")) return;
    setIsSubmitting(true);
    try {
      await deleteMessage(message.id);
    } catch {
      // Error handled by the action
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isDeleted) {
    return (
      <div className={cn("flex gap-2 px-4 py-1", isOwn && "flex-row-reverse")}>
        <p className="text-xs italic text-muted-foreground">This message was deleted</p>
      </div>
    );
  }

  return (
    <div
      className={cn("group flex gap-2 px-4 py-1", isOwn && "flex-row-reverse", isOptimistic && "opacity-60")}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar (only for received messages) */}
      {!isOwn && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-primary">
          {initials}
        </div>
      )}

      <div className={cn("max-w-[70%]", isOwn && "items-end")}>
        {/* Meta */}
        <div className={cn("mb-0.5 flex items-center gap-1 text-[11px] text-muted-foreground", isOwn && "justify-end")}>
          {!isOwn && <span>{message.sender?.display_name || "Unknown"}</span>}
          <span>{time}</span>
          {message.edited_at && <span>(edited)</span>}
        </div>

        {/* Bubble */}
        {isEditing ? (
          <div className="rounded-lg border border-border bg-background p-2">
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="w-full resize-none bg-transparent text-sm text-foreground focus:outline-none"
              rows={2}
              autoFocus
            />
            <div className="mt-1 flex justify-end gap-1">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEdit}
                className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground disabled:opacity-50"
                disabled={isSubmitting}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "rounded-xl px-3 py-2 text-sm",
              isOwn
                ? "rounded-tr-sm bg-primary text-primary-foreground"
                : "rounded-tl-sm bg-muted text-foreground",
            )}
          >
            {message.body_format === "html" ? (
              <div
                className={isOwn ? "prose-dm-own [&_p]:m-0" : "prose-community [&_p]:m-0"}
                dangerouslySetInnerHTML={{ __html: message.body }}
              />
            ) : (
              <p className="m-0 whitespace-pre-wrap">{message.body}</p>
            )}
          </div>
        )}
      </div>

      {/* Actions menu (own messages only) */}
      {isOwn && showActions && !isEditing && (
        <div className="flex items-start gap-0.5 pt-4">
          <button
            type="button"
            onClick={() => {
              // Strip HTML tags so the user edits plain text, not raw HTML
              const plainText = message.body.replace(/<[^>]*>/g, "").trim();
              setEditBody(plainText);
              setIsEditing(true);
            }}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Edit"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Delete"
            disabled={isSubmitting}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
