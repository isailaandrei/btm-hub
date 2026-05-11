import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "font-sans" }),
}));

vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => "TOASTER_MARKER",
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@vercel/analytics/next", () => ({
  Analytics: () => "VERCEL_ANALYTICS_MARKER",
}));

vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: () => "VERCEL_SPEED_INSIGHTS_MARKER",
}));

const { default: RootLayout } = await import("./layout");

describe("RootLayout", () => {
  it("mounts Vercel Analytics and Speed Insights once at the app root", () => {
    const html = renderToStaticMarkup(
      createElement(
        RootLayout,
        null,
        createElement("main", null, "Page content"),
      ),
    );

    expect(html.match(/VERCEL_ANALYTICS_MARKER/g)).toHaveLength(1);
    expect(html.match(/VERCEL_SPEED_INSIGHTS_MARKER/g)).toHaveLength(1);
  });
});
