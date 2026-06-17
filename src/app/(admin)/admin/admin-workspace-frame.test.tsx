/**
 * @vitest-environment jsdom
 */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDashboardMount = vi.fn();
const mockDashboardUnmount = vi.fn();
let currentPathname = "/admin";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
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
        <AdminWorkspaceFrame>
          <section data-testid="route-child">Route child</section>
        </AdminWorkspaceFrame>,
      );
    });
  }

  it("keeps the dashboard mounted while showing child routes", () => {
    renderFrame();

    expect(mockDashboardMount).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector<HTMLDivElement>(
        "[data-testid='admin-dashboard']",
      )?.closest("div")?.hidden,
    ).toBe(false);

    currentPathname = "/admin/contacts/contact-1";
    renderFrame();

    expect(mockDashboardMount).toHaveBeenCalledTimes(1);
    expect(mockDashboardUnmount).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLDivElement>(
        "[data-testid='admin-dashboard']",
      )?.closest("div")?.hidden,
    ).toBe(true);
    expect(
      container.querySelector<HTMLDivElement>(
        "[data-testid='route-child']",
      )?.closest("div")?.hidden,
    ).toBe(false);
  });
});

