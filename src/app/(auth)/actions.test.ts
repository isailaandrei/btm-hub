import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSupabase = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase.client),
}));

// Next.js redirect throws a special error to halt execution
class RedirectError extends Error {
  url: string;
  constructor(url: string) {
    super(`NEXT_REDIRECT: ${url}`);
    this.url = url;
  }
}

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectError(url);
  }),
}));

// Import after mocks are set up
const { login, register } = await import("./actions");

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

describe("login", () => {
  const prevState = { errors: null, message: null };

  beforeEach(() => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: null,
    });
  });

  it("returns field errors for invalid input", async () => {
    const formData = new FormData();
    formData.set("email", "bad");
    formData.set("password", "");

    const result = await login(prevState, formData);
    expect(result.errors).not.toBeNull();
    expect(result.message).toBeNull();
  });

  it("returns message on auth failure", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Invalid credentials" },
    });

    const formData = new FormData();
    formData.set("email", "user@test.com");
    formData.set("password", "password123");

    const result = await login(prevState, formData);
    expect(result.message).toContain("Invalid email or password");
    expect(result.errors).toBeNull();
  });

  it("redirects to /profile on success", async () => {
    const formData = new FormData();
    formData.set("email", "user@test.com");
    formData.set("password", "password123");

    await expect(login(prevState, formData)).rejects.toThrow(RedirectError);
    try {
      await login(prevState, formData);
    } catch (e) {
      expect((e as RedirectError).url).toBe("/profile");
    }
  });

  it("uses safe redirect path from form data", async () => {
    const formData = new FormData();
    formData.set("email", "user@test.com");
    formData.set("password", "password123");
    formData.set("redirect", "/admin/applications");

    try {
      await login(prevState, formData);
    } catch (e) {
      expect((e as RedirectError).url).toBe("/admin/applications");
    }
  });

  it("rejects open redirect attempts", async () => {
    const formData = new FormData();
    formData.set("email", "user@test.com");
    formData.set("password", "password123");
    formData.set("redirect", "//evil.com");

    try {
      await login(prevState, formData);
    } catch (e) {
      // Should fall back to /profile, not use //evil.com
      expect((e as RedirectError).url).toBe("/profile");
    }
  });

  it("rejects absolute URL redirect", async () => {
    const formData = new FormData();
    formData.set("email", "user@test.com");
    formData.set("password", "password123");
    formData.set("redirect", "https://evil.com");

    try {
      await login(prevState, formData);
    } catch (e) {
      expect((e as RedirectError).url).toBe("/profile");
    }
  });
});

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

describe("register", () => {
  const prevState = { errors: null, message: null };

  beforeEach(() => {
    mockSupabase.auth.signUp.mockResolvedValue({ data: {}, error: null });
  });

  it("returns field errors for invalid input", async () => {
    const formData = new FormData();
    formData.set("email", "bad");
    formData.set("password", "weak");
    formData.set("confirmPassword", "weak");
    formData.set("displayName", "A");

    const result = await register(prevState, formData);
    expect(result.errors).not.toBeNull();
  });

  it("returns message for already registered email", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: {},
      error: { message: "User already registered" },
    });

    const formData = new FormData();
    formData.set("email", "existing@test.com");
    formData.set("password", "StrongPass1");
    formData.set("confirmPassword", "StrongPass1");
    formData.set("displayName", "Test User");

    const result = await register(prevState, formData);
    expect(result.message).toContain("already exists");
  });

  it("returns generic message for unknown auth errors", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: {},
      error: { message: "Service unavailable" },
    });

    const formData = new FormData();
    formData.set("email", "new@test.com");
    formData.set("password", "StrongPass1");
    formData.set("confirmPassword", "StrongPass1");
    formData.set("displayName", "Test User");

    const result = await register(prevState, formData);
    expect(result.message).toContain("Something went wrong");
  });

  it("redirects to /login with confirmation message on success", async () => {
    const formData = new FormData();
    formData.set("email", "new@test.com");
    formData.set("password", "StrongPass1");
    formData.set("confirmPassword", "StrongPass1");
    formData.set("displayName", "Test User");

    try {
      await register(prevState, formData);
    } catch (e) {
      expect((e as RedirectError).url).toContain("/login?message=");
    }
  });
});
