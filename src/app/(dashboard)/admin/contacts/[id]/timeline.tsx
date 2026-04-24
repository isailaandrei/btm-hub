"use client";

import { useState } from "react";
import type { ContactEvent } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { TimelineComposer } from "./timeline-composer";
import { TimelineEventRow } from "./timeline-event-row";

interface TimelineProps {
  contactId: string;
  events: ContactEvent[];
}

export function Timeline({ contactId, events }: TimelineProps) {
  const [composerOpen, setComposerOpen] = useState(false);

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
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {events.map((event) => (
              <TimelineEventRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
