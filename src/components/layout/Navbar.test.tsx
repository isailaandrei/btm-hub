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
  AuthButtons: () => <span data-testid="auth-buttons">Auth</span>,
}));

describe("Navbar", () => {
  it("renders only the desktop auth buttons before the mobile drawer is opened", () => {
    const html = renderToStaticMarkup(<Navbar />);

    expect(html.match(/data-testid="auth-buttons"/g)).toHaveLength(1);
  });
});
