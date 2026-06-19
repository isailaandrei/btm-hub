/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactEvent } from "@/types/database";
import { Timeline } from "./timeline";
import { loadMoreContactEvents } from "./event-actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("./event-actions", () => ({
  createEvent: vi.fn(),
  deleteEvent: vi.fn(),
  loadMoreContactEvents: vi.fn(),
  resolveEvent: vi.fn(),
  unresolveEvent: vi.fn(),
  updateEvent: vi.fn(),
}));

function event(overrides: Partial<ContactEvent>): ContactEvent {
  return {
    id: "event-1",
    author_id: "admin-1",
    author_name: "Admin",
    body: "Initial event",
    contact_id: "contact-1",
    created_at: "2026-06-01T10:00:00.000Z",
    custom_label: null,
    edited_at: null,
    happened_at: "2026-06-01T10:00:00.000Z",
    metadata: {},
    resolved_at: null,
    resolved_by: null,
    type: "note",
    updated_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("Timeline", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.mocked(loadMoreContactEvents).mockReset().mockResolvedValue({
      events: [
        event({
          id: "event-2",
          body: "Older event",
          happened_at: "2026-05-01T10:00:00.000Z",
        }),
      ],
      hasMore: false,
      nextCursor: null,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("loads additional timeline events on demand", async () => {
    await act(async () => {
      root.render(
        <Timeline
          contactId="contact-1"
          events={[event({})]}
          hasMore
          nextCursor="2026-06-01T10:00:00.000Z"
          authorName="Admin"
        />,
      );
    });

    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Load more events")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(loadMoreContactEvents).toHaveBeenCalledWith(
      "contact-1",
      "2026-06-01T10:00:00.000Z",
    );
    expect(container.textContent).toContain("Older event");
    expect(container.textContent).not.toContain("Load more events");
  });
});
