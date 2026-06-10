import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Navbar } from "./Navbar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/image", () => ({
  default: () => <span data-testid="mock-image" />,
}));

vi.mock("./AuthButtons", () => ({
  AuthButtons: ({
    initialUser,
  }: {
    initialUser?: { id: string } | null;
  }) => (
    <span data-testid="auth-buttons" data-user-id={initialUser?.id ?? ""}>
      Auth
    </span>
  ),
}));

describe("Navbar", () => {
  it("renders only the desktop auth buttons before the mobile drawer is opened", () => {
    const html = renderToStaticMarkup(<Navbar />);

    expect(html.match(/data-testid="auth-buttons"/g)).toHaveLength(1);
  });

  it("passes the server-provided initial user to auth buttons", () => {
    const html = renderToStaticMarkup(
      <Navbar
        initialUser={{
          id: "user-1",
          displayName: "Admin User",
          avatarUrl: null,
          role: "admin",
        }}
      />,
    );

    expect(html).toContain('data-user-id="user-1"');
  });
});
