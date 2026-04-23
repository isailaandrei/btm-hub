import type { ContactEvent } from "@/types/database";
import { TimelineComposer } from "./timeline-composer";
import { TimelineEventRow } from "./timeline-event-row";

interface TimelineProps {
  contactId: string;
  events: ContactEvent[];
}

export function Timeline({ contactId, events }: TimelineProps) {
  return (
    <div className="flex flex-col gap-4">
      <TimelineComposer contactId={contactId} />
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No activity yet. Add the first event above.
        </p>
      ) : (
        <div className="flex flex-col">
          {events.map((event) => (
            <TimelineEventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
