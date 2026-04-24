"use client";

import { useState, useTransition } from "react";
import { Clock } from "lucide-react";
import type { ContactEventType } from "@/types/database";
import {
  EVENT_TYPE_META,
  EVENT_TYPE_ORDER,
  bodyRequiredFor,
} from "./event-types";
import { EVENT_TYPE_DISPLAY } from "./event-type-display";
import { createEvent } from "./event-actions";

function nowIsoLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function formatWhenLabel(isoLocal: string): string {
  const asDate = new Date(isoLocal);
  const now = Date.now();
  if (Math.abs(now - asDate.getTime()) < 60_000) return "Now";
  return asDate.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface TimelineComposerProps {
  contactId: string;
  onDismiss?: () => void;
  onAdded?: () => void;
}

export function TimelineComposer({
  contactId,
  onDismiss,
  onAdded,
}: TimelineComposerProps) {
  const [type, setType] = useState<ContactEventType>("note");
  const [body, setBody] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [happenedAt, setHappenedAt] = useState(nowIsoLocalInput());
  const [timeEditing, setTimeEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const bodyRequired = bodyRequiredFor(type);
  const remaining = 5000 - body.length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createEvent({
          contactId,
          type,
          body,
          customLabel: type === "custom" ? customLabel.trim() : null,
          happenedAt: new Date(happenedAt).toISOString(),
        });
        setBody("");
        setCustomLabel("");
        setHappenedAt(nowIsoLocalInput());
        setTimeEditing(false);
        setType("note");
        onAdded?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add event");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {EVENT_TYPE_ORDER.map((t) => {
          const Icon = EVENT_TYPE_DISPLAY[t].icon;
          const active = t === type;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-3 w-3" />
              {EVENT_TYPE_META[t].label}
            </button>
          );
        })}
      </div>

      {type === "custom" && (
        <input
          type="text"
          placeholder="Custom label (required)"
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
          maxLength={80}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
          disabled={isPending}
        />
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          bodyRequired ? "What happened?" : "What happened? (optional)"
        }
        rows={3}
        maxLength={5000}
        autoFocus
        className="w-full resize-none bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
        disabled={isPending}
      />
      {remaining < 500 && (
        <p className="self-end text-xs text-muted-foreground">
          {remaining} chars left
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-border pt-3">
        {timeEditing ? (
          <input
            type="datetime-local"
            value={happenedAt}
            onChange={(e) => setHappenedAt(e.target.value)}
            onBlur={() => setTimeEditing(false)}
            autoFocus
            className="rounded border border-border bg-background px-2 py-1 text-xs"
            disabled={isPending}
          />
        ) : (
          <button
            type="button"
            onClick={() => setTimeEditing(true)}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Clock className="h-3 w-3" />
            {formatWhenLabel(happenedAt)}
          </button>
        )}
        <div className="flex-1" />
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            disabled={isPending}
            className="rounded border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
