"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { ContactEvent } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { TimelineComposer } from "./timeline-composer";
import { TimelineEventRow } from "./timeline-event-row";
import { eventsReducer } from "./timeline-optimistic";
import { loadMoreContactEvents } from "./event-actions";

interface TimelineProps {
  contactId: string;
  events: ContactEvent[];
  hasMore: boolean;
  nextCursor: string | null;
  authorName: string;
}

export function Timeline({
  contactId,
  events,
  hasMore,
  nextCursor,
  authorName,
}: TimelineProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [loadedEvents, setLoadedEvents] = useState(events);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [hasMoreEvents, setHasMoreEvents] = useState(hasMore);
  const [cursor, setCursor] = useState(nextCursor);
  const [isPending, startTransition] = useTransition();
  const [optimisticEvents, applyOptimistic] = useOptimistic(
    loadedEvents,
    eventsReducer,
  );

  function handleLoadMore() {
    if (!cursor || isPending) return;

    startTransition(async () => {
      try {
        setLoadMoreError(null);
        const page = await loadMoreContactEvents(contactId, cursor);
        setLoadedEvents((current) => {
          const existingIds = new Set(current.map((event) => event.id));
          const nextEvents = page.events.filter(
            (event) => !existingIds.has(event.id),
          );
          return [...current, ...nextEvents];
        });
        setHasMoreEvents(page.hasMore);
        setCursor(page.nextCursor);
      } catch (error) {
        setLoadMoreError(
          error instanceof Error
            ? error.message
            : "Failed to load more timeline events.",
        );
      }
    });
  }

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
            authorName={authorName}
            applyOptimistic={applyOptimistic}
            onDismiss={() => setComposerOpen(false)}
            onAdded={() => setComposerOpen(false)}
          />
        )}
        {optimisticEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {optimisticEvents.map((event) => (
              <TimelineEventRow
                key={event.id}
                event={event}
                applyOptimistic={applyOptimistic}
              />
            ))}
          </div>
        )}
        {loadMoreError && (
          <p className="text-sm text-destructive">{loadMoreError}</p>
        )}
        {hasMoreEvents && (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isPending}
            className="self-start rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {isPending ? "Loading..." : "Load more events"}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
