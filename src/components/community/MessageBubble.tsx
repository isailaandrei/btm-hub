"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { editMessage, deleteMessage } from "@/app/(marketing)/community/messages/actions";
import type { OptimisticDmMessage } from "@/types/database";

interface MessageBubbleProps {
  message: OptimisticDmMessage;
  isOwn: boolean;
  showSeen?: boolean;
}

export function MessageBubble({ message, isOwn, showSeen = false }: MessageBubbleProps) {
  const isOptimistic = !!message._optimistic;
  const router = useRouter();
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isDeleted = message.deleted_at !== null;

  // Split HTML body into image blocks and text blocks for separate rendering
  const bodyParts = (() => {
    if (message.body_format !== "html" || !message.body.includes("<img ")) {
      return null; // No splitting needed
    }
    // Split around <img> tags (including wrapping <p> tags)
    const imgRegex = /(<p>\s*<img[^>]+>\s*<\/p>|<img[^>]+>)/g;
    const parts: { type: "image" | "text"; html: string }[] = [];
    let lastIndex = 0;
    let match;
    while ((match = imgRegex.exec(message.body)) !== null) {
      const before = message.body.slice(lastIndex, match.index).trim();
      if (before) parts.push({ type: "text", html: before });
      parts.push({ type: "image", html: match[1] });
      lastIndex = match.index + match[0].length;
    }
    const after = message.body.slice(lastIndex).trim();
    if (after) parts.push({ type: "text", html: after });
    return parts.length > 0 ? parts : null;
  })();

  // Make @mentions clickable — navigate to member profile
  const handleMentionClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const mention = target.closest("[data-type='mention']");
    if (mention) {
      e.preventDefault();
      const userId = mention.getAttribute("data-id");
      if (userId) router.push(`/community/members/${userId}`);
    }
  }, [router]);

  const initials = (message.sender?.display_name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const time = (() => {
    const date = new Date(message.created_at);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const clock = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    if (msgDay.getTime() === today.getTime()) return clock;
    if (msgDay.getTime() === yesterday.getTime()) return `Yesterday, ${clock}`;
    return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${clock}`;
  })();

  async function handleEdit() {
    if (!editBody.trim()) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await editMessage(message.id, editBody, "text");
      setIsEditing(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to edit");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this message?")) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await deleteMessage(message.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete");
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
          {!isOwn && message.sender?.id ? (
            <button
              type="button"
              onClick={() => router.push(`/community/members/${message.sender!.id}`)}
              className="hover:text-foreground transition-colors"
            >
              {message.sender.display_name || "Unknown"}
            </button>
          ) : !isOwn ? (
            <span>Unknown</span>
          ) : null}
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
        ) : bodyParts ? (
          /* Message with images — render images standalone, text in bubbles */
          <div className="flex flex-col gap-1">
            {bodyParts.map((part, i) =>
              part.type === "image" ? (
                <div
                  key={i}
                  className="[&_img]:m-0 [&_img]:max-w-[280px] [&_img]:rounded-xl [&_p]:m-0"
                  dangerouslySetInnerHTML={{ __html: part.html }}
                />
              ) : (
                <div
                  key={i}
                  className={cn(
                    "rounded-2xl px-3 py-1 text-sm",
                    isOwn
                      ? "rounded-tr-sm bg-primary text-primary-foreground"
                      : "rounded-tl-sm bg-muted text-foreground",
                  )}
                  onClick={handleMentionClick}
                >
                  <div
                    className={cn(
                      isOwn ? "prose-dm-own" : "prose-dm prose-community",
                      "[&_span[data-type='mention']]:cursor-pointer [&_span[data-type='mention']]:hover:underline",
                    )}
                    dangerouslySetInnerHTML={{ __html: part.html }}
                  />
                </div>
              ),
            )}
          </div>
        ) : (
          <div
            className={cn(
              "rounded-2xl px-3 py-1 text-sm",
              isOwn
                ? "rounded-tr-sm bg-primary text-primary-foreground"
                : "rounded-tl-sm bg-muted text-foreground",
            )}
            onClick={handleMentionClick}
          >
            <div
              className={cn(
                "[&_p]:m-0 [&_span[data-type='mention']]:cursor-pointer [&_span[data-type='mention']]:hover:underline",
                message.body_format === "html" && (isOwn ? "prose-dm-own" : "prose-dm prose-community"),
                message.body_format !== "html" && "whitespace-pre-wrap",
              )}
              dangerouslySetInnerHTML={{ __html: message.body_format === "html" ? message.body : message.body }}
            />
          </div>
        )}
        {showSeen && (
          <p className="mt-0.5 text-right text-[11px] text-muted-foreground">Seen</p>
        )}
        {actionError && (
          <p className="mt-0.5 text-xs text-destructive">{actionError}</p>
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
