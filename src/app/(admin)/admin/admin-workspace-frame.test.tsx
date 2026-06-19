/**
 * @vitest-environment jsdom
 */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDashboardMount = vi.fn();
const mockDashboardUnmount = vi.fn();
let currentPathname = "/admin";

const CONTACT_ID = "a0000000-0000-0000-0000-000000000000";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

// Replace the lazily-imported panel with a synchronous stub so we can assert
// it renders without pulling in server-action modules.
vi.mock("next/dynamic", () => ({
  default: () =>
    function ContactDetailPanelStub({ contactId }: { contactId: string }) {
      return (
        <section data-testid="contact-detail-panel">Panel {contactId}</section>
      );
    },
}));

vi.mock("./admin-dashboard", () => ({
  AdminDashboard: () => {
    useEffect(() => {
      mockDashboardMount();
      return () => {
        mockDashboardUnmount();
      };
    }, []);

    return <section data-testid="admin-dashboard">Dashboard</section>;
  },
}));

const { AdminWorkspaceFrame } = await import("./admin-workspace-frame");

describe("AdminWorkspaceFrame", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    currentPathname = "/admin";
    mockDashboardMount.mockClear();
    mockDashboardUnmount.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderFrame() {
    act(() => {
      root.render(
        <AdminWorkspaceFrame authorName="Admin">
          <section data-testid="route-child">Route child</section>
        </AdminWorkspaceFrame>,
      );
    });
  }

  function hiddenOf(testId: string) {
    return container
      .querySelector<HTMLElement>(`[data-testid='${testId}']`)
      ?.closest("div")?.hidden;
  }

  it("shows the dashboard at /admin and hides children", () => {
    renderFrame();

    expect(mockDashboardMount).toHaveBeenCalledTimes(1);
    expect(hiddenOf("admin-dashboard")).toBe(false);
    expect(hiddenOf("route-child")).toBe(true);
    expect(
      container.querySelector("[data-testid='contact-detail-panel']"),
    ).toBeNull();
  });

  it("keeps the dashboard mounted while showing other subroutes", () => {
    renderFrame();
    expect(mockDashboardMount).toHaveBeenCalledTimes(1);

    currentPathname = "/admin/users";
    renderFrame();

    expect(mockDashboardMount).toHaveBeenCalledTimes(1);
    expect(mockDashboardUnmount).not.toHaveBeenCalled();
    expect(hiddenOf("admin-dashboard")).toBe(true);
    expect(hiddenOf("route-child")).toBe(false);
  });

  it("renders the contact detail panel for a contact id path", () => {
    renderFrame();

    currentPathname = `/admin/contacts/${CONTACT_ID}`;
    renderFrame();

    expect(mockDashboardMount).toHaveBeenCalledTimes(1);
    expect(mockDashboardUnmount).not.toHaveBeenCalled();
    expect(hiddenOf("admin-dashboard")).toBe(true);
    expect(hiddenOf("route-child")).toBe(true);

    const panel = container.querySelector(
      "[data-testid='contact-detail-panel']",
    );
    expect(panel?.textContent).toContain(CONTACT_ID);
  });

  it("falls through to children for a non-UUID contacts path", () => {
    renderFrame();

    currentPathname = "/admin/contacts/not-a-uuid";
    renderFrame();

    expect(hiddenOf("admin-dashboard")).toBe(true);
    expect(hiddenOf("route-child")).toBe(false);
    expect(
      container.querySelector("[data-testid='contact-detail-panel']"),
    ).toBeNull();
  });
});
