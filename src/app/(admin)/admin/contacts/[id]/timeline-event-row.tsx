"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ContactEvent } from "@/types/database";
import { formatRelative } from "@/lib/format-relative";
import { eventTypeLabel, isResolvable } from "./event-types";
import { timelineEventBody } from "./timeline-event-body";
import {
  eventTypeDisplayFor,
  isEmailSentEvent,
  isTagAssignmentEvent,
} from "./event-type-display";
import {
  updateEvent,
  deleteEvent,
  resolveEvent,
  unresolveEvent,
} from "./event-actions";
import type { EventAction } from "./timeline-optimistic";

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  applyOptimistic: (action: EventAction) => void;
}

export function TimelineEventRow({
  event,
  applyOptimistic,
}: TimelineEventRowProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draftBody, setDraftBody] = useState(event.body);
  const [draftHappenedAt, setDraftHappenedAt] = useState(toDatetimeLocal(event.happened_at));
  const [draftCustomLabel, setDraftCustomLabel] = useState(event.custom_label ?? "");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const label = eventTypeLabel(event.type, event.custom_label);
  const display = eventTypeDisplayFor(event);
  const Icon = display.icon;
  const resolvable = isResolvable(event.type);
  const isOpen = resolvable && event.resolved_at === null;
  const isResolved = resolvable && event.resolved_at !== null;
  const isDerivedTagAssignment = isTagAssignmentEvent(event);
  const isDerivedEmailEvent = isEmailSentEvent(event);
  const displayBody = timelineEventBody(event);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        const happenedAtIso = new Date(draftHappenedAt).toISOString();
        const editedAtIso = new Date().toISOString();
        applyOptimistic({
          kind: "update",
          id: event.id,
          fields: {
            body: draftBody,
            happened_at: happenedAtIso,
            edited_at: editedAtIso,
            updated_at: editedAtIso,
            ...(event.type === "custom"
              ? { custom_label: draftCustomLabel || null }
              : {}),
          },
        });
        await updateEvent(event.id, {
          body: draftBody,
          happenedAt: happenedAtIso,
          ...(event.type === "custom" ? { customLabel: draftCustomLabel || null } : {}),
        });
        router.refresh();
        setIsEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        applyOptimistic({ kind: "delete", id: event.id });
        await deleteEvent(event.id);
        router.refresh();
      } catch (err) {
        setIsConfirmingDelete(false);
        const message = err instanceof Error ? err.message : "Failed to delete";
        setError(message);
        toast.error(message);
      }
    });
  }

  function handleResolve() {
    setError(null);
    startTransition(async () => {
      try {
        applyOptimistic({
          kind: "resolve",
          id: event.id,
          resolvedAt: new Date().toISOString(),
          resolvedBy: "optimistic",
        });
        await resolveEvent(event.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to resolve");
      }
    });
  }

  function handleReopen() {
    setError(null);
    startTransition(async () => {
      try {
        applyOptimistic({ kind: "unresolve", id: event.id });
        await unresolveEvent(event.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reopen");
      }
    });
  }

  return (
    <div
      className={`group flex gap-3 px-2 py-2.5 transition-colors ${
        isOpen
          ? "border-l-2 border-amber-500 bg-amber-50 pl-3"
          : "hover:bg-muted/40"
      }`}
    >
      <div
        className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-white ${display.colorClass}`}
        aria-hidden
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span
            className="text-xs text-muted-foreground"
            title={formatAbsolute(event.happened_at)}
          >
            {event.author_name} · {formatRelative(event.happened_at)}
            {event.edited_at && <> · edited {formatRelative(event.edited_at)}</>}
          </span>
          {isResolved && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
              Resolved
            </span>
          )}
        </div>
        {isEditing ? (
          <div className="mt-2 flex flex-col gap-2">
            {event.type === "custom" && (
              <input
                type="text"
                value={draftCustomLabel}
                onChange={(e) => setDraftCustomLabel(e.target.value)}
                maxLength={80}
                placeholder="Event label"
                className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                disabled={isPending}
              />
            )}
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              maxLength={5000}
              rows={3}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
              disabled={isPending}
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">When</label>
              <input
                type="datetime-local"
                value={draftHappenedAt}
                max={toDatetimeLocal(new Date().toISOString())}
                onChange={(e) => setDraftHappenedAt(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                disabled={isPending}
              />
            </div>
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
                  setDraftHappenedAt(toDatetimeLocal(event.happened_at));
                  setDraftCustomLabel(event.custom_label ?? "");
                  setIsEditing(false);
                }}
                className="rounded border border-border px-3 py-1 text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          displayBody && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
              {displayBody}
            </p>
          )
        )}

        {isOpen && !isEditing && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900">
            <span>Awaiting response</span>
            <button
              type="button"
              onClick={handleResolve}
              disabled={isPending}
              className="rounded bg-amber-900 px-2 py-0.5 text-xs font-medium text-white transition-colors hover:bg-amber-950 disabled:opacity-50"
            >
              Resolve
            </button>
          </div>
        )}

        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>

      {!isEditing && !isDerivedTagAssignment && !isDerivedEmailEvent && (
        <div className="flex flex-none items-start gap-0.5">
          {isConfirmingDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Delete?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                aria-label="Confirm delete event"
                className="rounded px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                {isPending ? "Deleting..." : "Yes"}
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                disabled={isPending}
                aria-label="Cancel delete event"
                className="rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                No
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                aria-label="Edit event"
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {isResolved && (
                <button
                  type="button"
                  onClick={handleReopen}
                  disabled={isPending}
                  aria-label="Reopen event"
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  title="Reopen"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                disabled={isPending}
                aria-label="Delete event"
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
