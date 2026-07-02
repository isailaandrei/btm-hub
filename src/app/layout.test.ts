import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "font-sans" }),
  Zilla_Slab: () => ({ variable: "font-display" }),
}));

vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => "TOASTER_MARKER",
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}));

const { default: RootLayout } = await import("./layout");

describe("RootLayout", () => {
  it("renders children and mounts the Toaster once at the app root", () => {
    const html = renderToStaticMarkup(
      createElement(
        RootLayout,
        null,
        createElement("main", null, "Page content"),
      ),
    );

    expect(html).toContain("Page content");
    expect(html.match(/TOASTER_MARKER/g)).toHaveLength(1);
    // Vercel Analytics / Speed Insights were removed for the move off Vercel;
    // guard against an accidental re-add pulling in host-specific beacons.
    expect(html).not.toMatch(/VERCEL_/);
  });
});
