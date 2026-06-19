/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

let currentPathname = "/admin";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/(auth)/actions", () => ({
  logout: vi.fn(),
}));

const { AdminSidebar } = await import("./admin-sidebar");

describe("AdminSidebar", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    currentPathname = "/admin";
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    }));
    vi.spyOn(window.history, "pushState").mockImplementation(() => undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.restoreAllMocks();
    container.remove();
  });

  function renderSidebar() {
    act(() => {
      root.render(
        <TooltipProvider>
          <SidebarProvider>
            <AdminSidebar
              user={{
                avatarUrl: null,
                displayName: "Admin User",
                email: "admin@example.invalid",
              }}
            />
          </SidebarProvider>
        </TooltipProvider>,
      );
    });
  }

  it("collapses and expands from the explicit sidebar control", () => {
    renderSidebar();

    expect(
      container.querySelector('[data-slot="sidebar"][data-state="expanded"]'),
    ).not.toBeNull();

    const collapseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse sidebar"]',
    );
    expect(collapseButton).not.toBeNull();

    act(() => {
      collapseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      container.querySelector('[data-slot="sidebar"][data-state="collapsed"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Expand sidebar"]'),
    ).not.toBeNull();
  });

  it("uses shallow history updates for workspace tab links on the admin root", () => {
    renderSidebar();

    const emailLink = container.querySelector<HTMLAnchorElement>(
      'a[href="/admin?tab=email"]',
    );
    expect(emailLink).not.toBeNull();

    act(() => {
      emailLink?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(window.history.pushState).toHaveBeenCalledWith(
      null,
      "",
      "/admin?tab=email",
    );
  });

  it("uses shallow history updates for workspace tab links from contact detail routes", () => {
    currentPathname =
      "/admin/contacts/550e8400-e29b-41d4-a716-446655440001";
    renderSidebar();

    const emailLink = container.querySelector<HTMLAnchorElement>(
      'a[href="/admin?tab=email"]',
    );
    expect(emailLink).not.toBeNull();

    act(() => {
      emailLink?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(window.history.pushState).toHaveBeenCalledWith(
      null,
      "",
      "/admin?tab=email",
    );
  });
});
