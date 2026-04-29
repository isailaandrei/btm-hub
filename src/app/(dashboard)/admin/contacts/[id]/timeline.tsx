"use client";

import { useState } from "react";
import { Mail, Reply, TriangleAlert } from "lucide-react";
import type { ContactEvent } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelative } from "@/lib/format-relative";
import type { EmailTimelineItem } from "@/lib/data/email-timeline";
import { TimelineComposer } from "./timeline-composer";
import { TimelineEventRow } from "./timeline-event-row";

interface TimelineProps {
  contactId: string;
  events: ContactEvent[];
  emailItems: EmailTimelineItem[];
}

type TimelineItem =
  | { kind: "manual"; id: string; happened_at: string; event: ContactEvent }
  | { kind: "email"; id: string; happened_at: string; item: EmailTimelineItem };

function EmailTimelineRow({ item }: { item: EmailTimelineItem }) {
  const Icon = item.type === "email_reply" ? Reply : Mail;
  const failedForward =
    item.type === "email_reply" && item.forwardStatus === "failed";

  return (
    <div className="flex gap-3 px-2 py-2.5 transition-colors hover:bg-muted/40">
      <div
        className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground"
        aria-hidden
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-foreground">{item.label}</span>
          <span className="text-xs text-muted-foreground">
            {formatRelative(item.happened_at)}
          </span>
          {failedForward && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
              <TriangleAlert className="h-3 w-3" />
              Forward failed
            </span>
          )}
        </div>
        {item.body && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {item.body}
          </p>
        )}
      </div>
    </div>
  );
}

export function Timeline({ contactId, events, emailItems }: TimelineProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const items: TimelineItem[] = [
    ...events.map((event) => ({
      kind: "manual" as const,
      id: event.id,
      happened_at: event.happened_at,
      event,
    })),
    ...emailItems.map((item) => ({
      kind: "email" as const,
      id: item.id,
      happened_at: item.happened_at,
      item,
    })),
  ].sort((a, b) => b.happened_at.localeCompare(a.happened_at));

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Timeline
          </span>
          {!composerOpen && (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="rounded-md border border-primary px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-white"
            >
              + Add event
            </button>
          )}
        </div>
        {composerOpen && (
          <TimelineComposer
            contactId={contactId}
            onDismiss={() => setComposerOpen(false)}
            onAdded={() => setComposerOpen(false)}
          />
        )}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {items.map((item) => (
              item.kind === "manual" ? (
                <TimelineEventRow key={item.id} event={item.event} />
              ) : (
                <EmailTimelineRow key={item.id} item={item.item} />
              )
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
