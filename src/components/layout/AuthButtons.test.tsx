/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockUnsubscribe = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/app/(auth)/actions", () => ({
  logout: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    children,
    ...props
  }: {
    href: string;
    prefetch?: boolean;
    children: ReactNode;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
    from: mockFrom,
  }),
}));

vi.mock("next/image", () => ({
  default: () => <span data-testid="mock-image" />,
}));

const { AuthButtons } = await import("./AuthButtons");

describe("AuthButtons", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    mockGetSession.mockClear();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockClear();
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });
    mockUnsubscribe.mockClear();
    mockSingle.mockClear();
    mockEq.mockClear();
    mockSelect.mockClear();
    mockFrom.mockClear();
    sessionStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders an initial server user without an initial client auth fetch", async () => {
    await act(async () => {
      root.render(
        <AuthButtons
          initialUser={{
            id: "user-1",
            displayName: "Admin User",
            avatarUrl: null,
            role: "admin",
          }}
        />,
      );
    });

    expect(container.textContent).toContain("Admin");
    expect(container.textContent).toContain("Log Out");
    expect(container.textContent).not.toContain("Log In");
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it("disables automatic prefetch for the authenticated profile link", async () => {
    await act(async () => {
      root.render(
        <AuthButtons
          initialUser={{
            id: "user-1",
            displayName: "Member User",
            avatarUrl: null,
            role: "member",
          }}
        />,
      );
    });

    const profileLink = container.querySelector('a[href="/profile"]');
    expect(profileLink).not.toBeNull();
    expect(profileLink?.getAttribute("data-prefetch")).toBe("false");
  });
});
