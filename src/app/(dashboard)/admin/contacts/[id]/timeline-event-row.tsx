"use client";

import { useState, useTransition } from "react";
import type { ContactEvent } from "@/types/database";
import { eventTypeLabel, isResolvable } from "./event-types";
import { updateEvent, deleteEvent, resolveEvent, unresolveEvent } from "./event-actions";

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(abs / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(abs / 86_400_000);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface TimelineEventRowProps {
  event: ContactEvent;
}

export function TimelineEventRow({ event }: TimelineEventRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftBody, setDraftBody] = useState(event.body);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const label = eventTypeLabel(event.type, event.custom_label);
  const isOpen = isResolvable(event.type) && event.resolved_at === null;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateEvent(event.id, { body: draftBody });
        setIsEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  function handleDelete() {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteEvent(event.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete");
      }
    });
  }

  function handleResolve() {
    setError(null);
    startTransition(async () => {
      try {
        await resolveEvent(event.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to resolve");
      }
    });
  }

  function handleReopen() {
    setError(null);
    startTransition(async () => {
      try {
        await unresolveEvent(event.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reopen");
      }
    });
  }

  return (
    <div
      className={`flex gap-3 border-t border-border py-3 first:border-t-0 ${
        isOpen ? "border-l-2 border-l-amber-500 pl-3" : ""
      }`}
    >
      <div
        className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-medium ${
          isOpen ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground"
        }`}
        aria-hidden
      >
        {label.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">
            {event.author_name} &middot; {formatRelative(event.happened_at)} &middot;{" "}
            {formatAbsolute(event.happened_at)}
            {event.edited_at && (
              <> &middot; edited {formatRelative(event.edited_at)}</>
            )}
          </span>
        </div>
        {isEditing ? (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              maxLength={5000}
              rows={3}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
              disabled={isPending}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="rounded bg-primary px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftBody(event.body);
                  setIsEditing(false);
                }}
                className="rounded border border-border px-3 py-1 text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          event.body && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
              {event.body}
            </p>
          )
        )}

        {isOpen && !isEditing && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
            <span>Awaiting response</span>
            <button
              type="button"
              onClick={handleResolve}
              disabled={isPending}
              className="ml-auto rounded bg-amber-700 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Mark resolved
            </button>
          </div>
        )}

        <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
          {!isEditing && (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="text-primary hover:underline"
              >
                Edit
              </button>
              <span>&middot;</span>
              <button
                type="button"
                onClick={handleDelete}
                className="text-primary hover:underline"
              >
                Delete
              </button>
              {isResolvable(event.type) && event.resolved_at && (
                <>
                  <span>&middot;</span>
                  <button
                    type="button"
                    onClick={handleReopen}
                    className="text-primary hover:underline"
                  >
                    Reopen
                  </button>
                </>
              )}
            </>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
