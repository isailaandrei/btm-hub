import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

// Mock NextResponse
const mockRedirect = vi.fn();
const mockNextResponse = {
  next: vi.fn(() => ({
    cookies: { set: vi.fn() },
  })),
  redirect: mockRedirect,
};

vi.mock("next/server", () => ({
  NextResponse: mockNextResponse,
}));

const { updateSession } = await import("./proxy");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRequest(pathname: string) {
  const url = new URL(`http://localhost:3000${pathname}`);
  return {
    cookies: {
      getAll: vi.fn().mockReturnValue([]),
      set: vi.fn(),
    },
    nextUrl: {
      pathname,
      clone: () => ({ pathname, searchParams: new URLSearchParams() }),
    },
    url: url.toString(),
  } as unknown as Parameters<typeof updateSession>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("updateSession", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockRedirect.mockImplementation((url) => ({ redirectedTo: url }));
    mockNextResponse.next.mockReturnValue({ cookies: { set: vi.fn() } });
  });

  // --- Protected routes ---

  it("redirects unauthenticated user from /profile to /login", async () => {
    const req = createMockRequest("/profile");
    await updateSession(req);
    expect(mockRedirect).toHaveBeenCalled();
    const redirectUrl = mockRedirect.mock.calls[0][0];
    expect(redirectUrl.pathname).toBe("/login");
  });

  it("redirects unauthenticated user from /admin/applications to /login", async () => {
    const req = createMockRequest("/admin/applications");
    await updateSession(req);
    expect(mockRedirect).toHaveBeenCalled();
  });

  it("redirects unauthenticated user from /dashboard to /login", async () => {
    const req = createMockRequest("/dashboard");
    await updateSession(req);
    expect(mockRedirect).toHaveBeenCalled();
  });

  it("redirects unauthenticated user from /settings to /login", async () => {
    const req = createMockRequest("/settings");
    await updateSession(req);
    expect(mockRedirect).toHaveBeenCalled();
  });

  it("preserves redirect path in search params", async () => {
    const req = createMockRequest("/profile");
    await updateSession(req);
    const redirectUrl = mockRedirect.mock.calls[0][0];
    expect(redirectUrl.searchParams.get("redirect")).toBe("/profile");
  });

  // --- Auth routes for authenticated users ---

  it("redirects authenticated user from /login to /profile", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = createMockRequest("/login");
    await updateSession(req);
    expect(mockRedirect).toHaveBeenCalled();
    const redirectUrl = mockRedirect.mock.calls[0][0];
    expect(redirectUrl.pathname).toBe("/profile");
  });

  it("redirects authenticated user from /register to /profile", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = createMockRequest("/register");
    await updateSession(req);
    expect(mockRedirect).toHaveBeenCalled();
  });

  // --- Public routes ---

  it("allows unauthenticated user on public route /academy", async () => {
    const req = createMockRequest("/academy");
    await updateSession(req);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("allows authenticated user on public route /", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = createMockRequest("/");
    await updateSession(req);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("allows authenticated user on protected route /profile", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = createMockRequest("/profile");
    await updateSession(req);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
