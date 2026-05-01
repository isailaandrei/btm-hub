import { describe, expect, it } from "vitest";
import type { ContactEvent } from "@/types/database";
import {
  EVENT_TYPE_DISPLAY,
  eventTypeDisplayFor,
  isTagAssignmentEvent,
} from "./event-type-display";

function event(partial: Partial<ContactEvent>): ContactEvent {
  return {
    id: "event-1",
    contact_id: "contact-1",
    type: "note",
    custom_label: null,
    body: "",
    happened_at: "2026-05-01T00:00:00.000Z",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    author_id: "admin-1",
    author_name: "Admin",
    edited_at: null,
    resolved_at: null,
    resolved_by: null,
    metadata: {},
    ...partial,
  };
}

describe("eventTypeDisplayFor", () => {
  it("uses the tag display for first-class tag assignment events", () => {
    const display = eventTypeDisplayFor(event({ type: "tag_assigned" }));

    expect(display).toBe(EVENT_TYPE_DISPLAY.tag_assigned);
  });

  it("uses the tag display for backfilled tag assignment events", () => {
    const backfilledEvent = event({
      type: "note",
      metadata: { source: "contact_tags_backfill", tag_id: "tag-1" },
    });

    expect(isTagAssignmentEvent(backfilledEvent)).toBe(true);
    expect(eventTypeDisplayFor(backfilledEvent)).toBe(EVENT_TYPE_DISPLAY.tag_assigned);
  });

  it("keeps the normal display for regular note events", () => {
    expect(eventTypeDisplayFor(event({ type: "note" }))).toBe(EVENT_TYPE_DISPLAY.note);
  });
});
