import { describe, expect, it } from "vitest";
import type { ContactEvent } from "@/types/database";
import { eventsReducer } from "./timeline-optimistic";

function event(overrides: Partial<ContactEvent>): ContactEvent {
  return {
    id: "event-1",
    contact_id: "contact-1",
    type: "note",
    custom_label: null,
    body: "Body",
    happened_at: "2026-06-01T10:00:00.000Z",
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
    author_id: "admin-1",
    author_name: "Admin",
    edited_at: null,
    resolved_at: null,
    resolved_by: null,
    metadata: {},
    ...overrides,
  };
}

describe("eventsReducer", () => {
  it("adds and sorts optimistic events by happened_at descending", () => {
    const next = eventsReducer(
      [
        event({
          id: "older",
          happened_at: "2026-06-01T10:00:00.000Z",
        }),
      ],
      {
        kind: "add",
        event: event({
          id: "newer",
          happened_at: "2026-06-02T10:00:00.000Z",
        }),
      },
    );

    expect(next.map((item) => item.id)).toEqual(["newer", "older"]);
  });

  it("updates and re-sorts events", () => {
    const next = eventsReducer(
      [
        event({
          id: "first",
          body: "Old",
          happened_at: "2026-06-01T10:00:00.000Z",
        }),
        event({
          id: "second",
          happened_at: "2026-06-02T10:00:00.000Z",
        }),
      ],
      {
        kind: "update",
        id: "first",
        fields: {
          body: "New",
          happened_at: "2026-06-03T10:00:00.000Z",
        },
      },
    );

    expect(next.map((item) => item.id)).toEqual(["first", "second"]);
    expect(next[0]?.body).toBe("New");
  });

  it("deletes, resolves, and unresolves events", () => {
    const resolvedAt = "2026-06-02T12:00:00.000Z";
    const resolved = eventsReducer([event({ id: "event-1" })], {
      kind: "resolve",
      id: "event-1",
      resolvedAt,
      resolvedBy: "admin-1",
    });

    expect(resolved[0]?.resolved_at).toBe(resolvedAt);
    expect(resolved[0]?.resolved_by).toBe("admin-1");

    const unresolved = eventsReducer(resolved, {
      kind: "unresolve",
      id: "event-1",
    });
    expect(unresolved[0]?.resolved_at).toBeNull();
    expect(unresolved[0]?.resolved_by).toBeNull();

    expect(
      eventsReducer(unresolved, { kind: "delete", id: "event-1" }),
    ).toEqual([]);
  });
});
