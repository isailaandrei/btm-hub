import type { ContactEvent } from "@/types/database";

export type EventAction =
  | { kind: "add"; event: ContactEvent }
  | { kind: "update"; id: string; fields: Partial<ContactEvent> }
  | { kind: "delete"; id: string }
  | { kind: "resolve"; id: string; resolvedAt: string; resolvedBy: string }
  | { kind: "unresolve"; id: string };

export function sortByHappenedAtDesc(
  list: ContactEvent[],
): ContactEvent[] {
  return [...list].sort((left, right) =>
    right.happened_at.localeCompare(left.happened_at),
  );
}

export function eventsReducer(
  state: ContactEvent[],
  action: EventAction,
): ContactEvent[] {
  switch (action.kind) {
    case "add":
      return sortByHappenedAtDesc([action.event, ...state]);
    case "update":
      return sortByHappenedAtDesc(
        state.map((event) =>
          event.id === action.id ? { ...event, ...action.fields } : event,
        ),
      );
    case "delete":
      return state.filter((event) => event.id !== action.id);
    case "resolve":
      return state.map((event) =>
        event.id === action.id
          ? {
              ...event,
              resolved_at: action.resolvedAt,
              resolved_by: action.resolvedBy,
            }
          : event,
      );
    case "unresolve":
      return state.map((event) =>
        event.id === action.id
          ? { ...event, resolved_at: null, resolved_by: null }
          : event,
      );
  }
}
