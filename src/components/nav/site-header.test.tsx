import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteHeader } from "./site-header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/image", () => ({
  default: () => <span data-testid="mock-image" />,
}));

// The logout server action pulls in server-only deps; stub it for the render.
vi.mock("@/app/(auth)/actions", () => ({
  logout: vi.fn(),
}));

describe("SiteHeader", () => {
  it("renders the inline links + mobile trigger and every top-level section with its real route", () => {
    const html = renderToStaticMarkup(<SiteHeader transparent />);

    expect(html).toContain('aria-label="Open menu"'); // mobile hamburger
    for (const [label, href] of [
      ["Academy", "/academy"],
      ["Team", "/team"],
      ["Films", "/films"],
      ["Community", "/community"],
      ["Contact", "/contact"],
    ]) {
      expect(html).toContain(label);
      expect(html).toContain(`href="${href}"`);
    }
    // No stale sections from the previous nav.
    expect(html).not.toContain("Portfolio");
    expect(html).not.toContain("Creative");
  });

  it("shows Log In / Join when logged out", () => {
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain("Log In");
    expect(html).toContain("Join");
  });

  it("shows Admin / Profile / Log Out for an admin", () => {
    const html = renderToStaticMarkup(
      <SiteHeader
        initialUser={{
          id: "user-1",
          displayName: "Admin User",
          avatarUrl: null,
          role: "admin",
        }}
      />,
    );
    expect(html).toContain("Admin");
    expect(html).toContain("Profile");
    expect(html).toContain("Log Out");
    expect(html).not.toContain("Join");
  });
});
