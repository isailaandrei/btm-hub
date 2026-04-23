"use client";

import { useState, useTransition } from "react";
import type { ContactEventType } from "@/types/database";
import {
  EVENT_TYPE_META,
  EVENT_TYPE_ORDER,
  bodyRequiredFor,
} from "./event-types";
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

interface TimelineComposerProps {
  contactId: string;
}

export function TimelineComposer({ contactId }: TimelineComposerProps) {
  const [type, setType] = useState<ContactEventType>("note");
  const [body, setBody] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [happenedAt, setHappenedAt] = useState(nowIsoLocalInput());
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
        setType("note");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add event");
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3"
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Add event
      </p>
      <div className="flex flex-wrap gap-1.5">
        {EVENT_TYPE_ORDER.map((t) => {
          const active = t === type;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-full border px-3 py-0.5 text-xs transition-colors ${
                active
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
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
        className="resize-none rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
        disabled={isPending}
      />
      {remaining < 500 && (
        <p className="self-end text-xs text-muted-foreground">
          {remaining} chars left
        </p>
      )}

      <div className="flex items-center gap-2 text-sm">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          When
          <input
            type="datetime-local"
            value={happenedAt}
            onChange={(e) => setHappenedAt(e.target.value)}
            className="rounded border border-border bg-background px-1 py-0.5 text-xs"
            disabled={isPending}
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="ml-auto rounded bg-primary px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add to timeline"}
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
