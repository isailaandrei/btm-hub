/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "@/types/database";
import { ApplicationCard } from "./application-card";
import { loadContactApplication } from "./application-actions";

vi.mock("./application-actions", () => ({
  loadContactApplication: vi.fn(),
}));

vi.mock("../../applications/[id]/StatusSelector", () => ({
  StatusSelector: () => <div data-testid="status-selector">Status</div>,
}));

vi.mock("./delete-buttons", () => ({
  DeleteApplicationButton: () => (
    <button type="button">Delete application</button>
  ),
}));

const applicationDetail: Application = {
  id: "550e8400-e29b-41d4-a716-446655440002",
  admin_notes: [],
  answers: {
    first_name: "Lots",
    phone: "+1 555 0100",
  },
  contact_id: "550e8400-e29b-41d4-a716-446655440001",
  program: "photography",
  status: "reviewing",
  submitted_at: "2026-06-01T10:00:00.000Z",
  tags: [],
  updated_at: "2026-06-01T10:00:00.000Z",
  user_id: null,
};

describe("ApplicationCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.mocked(loadContactApplication).mockReset().mockResolvedValue(
      applicationDetail,
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("loads full application answers only when expanded", async () => {
    await act(async () => {
      root.render(
        <ApplicationCard
          application={{
            id: applicationDetail.id,
            answers: { phone: "+1 555 0100" },
            contact_id: applicationDetail.contact_id,
            program: applicationDetail.program,
            status: applicationDetail.status,
            submitted_at: applicationDetail.submitted_at,
            updated_at: applicationDetail.updated_at,
          }}
          contactId={applicationDetail.contact_id!}
          defaultOpen={false}
        />,
      );
    });

    expect(loadContactApplication).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Lots");

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(loadContactApplication).toHaveBeenCalledWith(applicationDetail.id);
    expect(container.textContent).toContain("Lots");
    expect(container.querySelector("[data-testid='status-selector']")).not.toBeNull();
  });

  it("exposes a subtle Export PDF link in the header without expanding", async () => {
    await act(async () => {
      root.render(
        <ApplicationCard
          application={{
            id: applicationDetail.id,
            answers: { phone: "+1 555 0100" },
            contact_id: applicationDetail.contact_id,
            program: applicationDetail.program,
            status: applicationDetail.status,
            submitted_at: applicationDetail.submitted_at,
            updated_at: applicationDetail.updated_at,
          }}
          contactId={applicationDetail.contact_id!}
          defaultOpen={false}
        />,
      );
    });

    // Reachable straight from the collapsed header — no expand, no scroll.
    const exportLink = container.querySelector(
      `a[href='/print/applications/${applicationDetail.id}']`,
    );
    expect(exportLink).not.toBeNull();
    expect(exportLink?.getAttribute("target")).toBe("_blank");
    expect(exportLink?.getAttribute("rel")).toContain("noopener");
    expect(exportLink?.getAttribute("aria-label")).toBe(
      "Export this application as a PDF",
    );
    expect(exportLink?.textContent).toContain("PDF");
    // Rendering the collapsed card must not force a detail load.
    expect(loadContactApplication).not.toHaveBeenCalled();
  });

  it("prefetches the detail in the background so expanding is instant", async () => {
    // Force the setTimeout fallback in scheduleIdle so fake timers can drive it
    // deterministically (jsdom has no requestIdleCallback).
    delete (window as unknown as Record<string, unknown>).requestIdleCallback;
    vi.useFakeTimers();
    try {
      const summary = {
        id: applicationDetail.id,
        answers: { phone: "+1 555 0100" },
        contact_id: applicationDetail.contact_id,
        program: applicationDetail.program,
        status: applicationDetail.status,
        submitted_at: applicationDetail.submitted_at,
        updated_at: applicationDetail.updated_at,
      };

      await act(async () => {
        root.render(
          <ApplicationCard
            application={summary}
            contactId={applicationDetail.contact_id!}
            defaultOpen={false}
          />,
        );
      });

      // Nothing loads synchronously on mount.
      expect(loadContactApplication).not.toHaveBeenCalled();

      // The background prefetch fires once the idle-fallback delay elapses...
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(loadContactApplication).toHaveBeenCalledTimes(1);
      expect(loadContactApplication).toHaveBeenCalledWith(applicationDetail.id);
      // ...but the collapsed card still shows no answers.
      expect(container.textContent).not.toContain("Lots");

      // Expanding reveals the prefetched detail with no second load.
      await act(async () => {
        container.querySelector("button")?.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(loadContactApplication).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain("Lots");
    } finally {
      vi.useRealTimers();
    }
  });
});
