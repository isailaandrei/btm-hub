/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactEvent } from "@/types/database";

const mockDeleteEvent = vi.fn();
const mockRefresh = vi.fn();

vi.mock("./event-actions", () => ({
  updateEvent: vi.fn(),
  deleteEvent: mockDeleteEvent,
  resolveEvent: vi.fn(),
  unresolveEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

const { TimelineEventRow } = await import("./timeline-event-row");

function event(overrides: Partial<ContactEvent> = {}): ContactEvent {
  return {
    id: "550e8400-e29b-41d4-a716-446655440002",
    contact_id: "550e8400-e29b-41d4-a716-446655440001",
    type: "note",
    custom_label: null,
    body: "Manual timeline note",
    happened_at: "2026-05-01T12:00:00.000Z",
    created_at: "2026-05-01T12:00:00.000Z",
    updated_at: "2026-05-01T12:00:00.000Z",
    author_id: "550e8400-e29b-41d4-a716-446655440000",
    author_name: "Admin",
    edited_at: null,
    resolved_at: null,
    resolved_by: null,
    metadata: {},
    ...overrides,
  };
}

describe("TimelineEventRow", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    mockDeleteEvent.mockReset().mockResolvedValue({});
    mockRefresh.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows a delete action for manual events and confirms deletion", async () => {
    const applyOptimistic = vi.fn();

    act(() => {
      root.render(
        <TimelineEventRow
          event={event()}
          applyOptimistic={applyOptimistic}
        />,
      );
    });

    const deleteButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete event"]',
    );
    expect(deleteButton).not.toBeNull();

    act(() => {
      deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const confirmButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Confirm delete event"]',
    );
    expect(confirmButton).not.toBeNull();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(applyOptimistic).toHaveBeenCalledWith({
      kind: "delete",
      id: "550e8400-e29b-41d4-a716-446655440002",
    });
    expect(mockDeleteEvent).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440002",
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("does not offer deletion for source-derived timeline events", () => {
    act(() => {
      root.render(
        <TimelineEventRow
          event={event({
            type: "custom",
            custom_label: "Email sent",
            metadata: { source: "email_sends", send_id: "send-1" },
          })}
          applyOptimistic={vi.fn()}
        />,
      );
    });

    expect(
      container.querySelector('button[aria-label="Delete event"]'),
    ).toBeNull();
  });
});
