/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
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

const CACHE_KEY = "btm-navbar-user";

const adminUser = {
  id: "user-1",
  displayName: "Admin User",
  avatarUrl: null,
  role: "admin" as const,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Let the checkAuth → fetchProfile microtask chain settle inside act. */
async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

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
    window.localStorage.clear();
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
      root.render(<AuthButtons initialUser={adminUser} />);
    });

    expect(container.textContent).toContain("Admin");
    expect(container.textContent).toContain("Log Out");
    expect(container.textContent).not.toContain("Log In");
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
    // Server-provided state seeds the cache for pages without server auth.
    expect(JSON.parse(window.localStorage.getItem(CACHE_KEY)!)).toMatchObject({
      id: "user-1",
      role: "admin",
    });
  });

  it("paints a cached user immediately, then refreshes the profile in the background", async () => {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...adminUser, displayName: "Cached Name" }),
    );
    const session = deferred<{ data: { session: unknown } }>();
    mockGetSession.mockReturnValue(session.promise);
    mockSingle.mockResolvedValue({
      data: { display_name: "Fresh Name", avatar_url: null, role: "admin" },
      error: null,
    });

    await act(async () => {
      root.render(<AuthButtons />);
    });

    // Painted from cache (initials "CN") before any round-trip resolved.
    expect(container.textContent).toContain("Admin");
    expect(container.textContent).toContain("CN");
    expect(mockFrom).not.toHaveBeenCalled();

    await act(async () => {
      session.resolve({ data: { session: { user: { id: "user-1" } } } });
      await flushMicrotasks();
    });

    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("FN");
    expect(JSON.parse(window.localStorage.getItem(CACHE_KEY)!)).toMatchObject({
      displayName: "Fresh Name",
    });
  });

  it("collapses a SIGNED_IN event during the mount check into a single profile fetch", async () => {
    const session = deferred<{ data: { session: unknown } }>();
    mockGetSession.mockReturnValue(session.promise);
    mockSingle.mockResolvedValue({
      data: { display_name: "Admin User", avatar_url: null, role: "admin" },
      error: null,
    });

    await act(async () => {
      root.render(<AuthButtons />);
    });
    expect(mockFrom).not.toHaveBeenCalled();

    // supabase-js emits SIGNED_IN on initial load while the mount check is
    // still awaiting getSession — this used to trigger a second, parallel
    // profiles query.
    const authCallback = mockOnAuthStateChange.mock.calls[0][0];
    await act(async () => {
      authCallback("SIGNED_IN", { user: { id: "user-1" } });
    });

    await act(async () => {
      session.resolve({ data: { session: { user: { id: "user-1" } } } });
      await flushMicrotasks();
    });

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Admin");
  });

  it("corrects and clears a stale cached user when the session is gone", async () => {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(adminUser));
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await act(async () => {
      root.render(<AuthButtons />);
    });

    expect(container.textContent).toContain("Log In");
    expect(container.textContent).not.toContain("Admin");
    expect(mockFrom).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
  });
});
