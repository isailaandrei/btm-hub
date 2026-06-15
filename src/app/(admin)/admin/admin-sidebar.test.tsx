/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
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
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
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
});
