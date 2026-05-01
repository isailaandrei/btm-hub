"use client";

import { useState, useTransition } from "react";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { ContactEvent } from "@/types/database";
import { formatRelative } from "@/lib/format-relative";
import { eventTypeLabel, isResolvable } from "./event-types";
import { eventTypeDisplayFor, isTagAssignmentEvent } from "./event-type-display";
import {
  updateEvent,
  deleteEvent,
  resolveEvent,
  unresolveEvent,
} from "./event-actions";

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
}

export function TimelineEventRow({ event }: TimelineEventRowProps) {
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

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateEvent(event.id, {
          body: draftBody,
          happenedAt: new Date(draftHappenedAt).toISOString(),
          ...(event.type === "custom" ? { customLabel: draftCustomLabel || null } : {}),
        });
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
        await deleteEvent(event.id);
      } catch (err) {
        setIsConfirmingDelete(false);
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
          event.body && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
              {event.body}
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

      {!isEditing && !isDerivedTagAssignment && (
        <div className="flex flex-none items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {isConfirmingDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Delete?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="rounded px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
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
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  title="Reopen"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
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
