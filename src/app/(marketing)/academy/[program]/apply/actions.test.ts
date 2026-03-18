import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod/v4";
import { createMockSupabaseClient } from "@/test/mocks/supabase";
import type { Application, ProgramSlug } from "@/types/database";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSupabase = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase.client),
}));

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

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/email/templates/application-confirmation", () => ({
  applicationConfirmationEmail: vi.fn().mockReturnValue({ subject: "t", html: "t" }),
}));

vi.mock("@/lib/email/templates/admin-new-application", () => ({
  adminNewApplicationEmail: vi.fn().mockReturnValue({ subject: "t", html: "t" }),
}));

// Mock schema builder with spy — defaults to real impl, overrideable per test
const mockBuildFullSchema = vi.fn();
vi.mock("@/lib/academy/forms/schema-builder", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/academy/forms/schema-builder")>();
  mockBuildFullSchema.mockImplementation(orig.buildFullSchema);
  return { ...orig, buildFullSchema: mockBuildFullSchema };
});

// Import form registration side-effects
await import("@/lib/academy/forms");

const mockApplication: Application = {
  id: "app-123",
  user_id: null,
  program: "photography" as ProgramSlug,
  status: "reviewing",
  answers: {},
  tags: [],
  admin_notes: [],
  submitted_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const mockSubmitApplication = vi.fn().mockResolvedValue(mockApplication);

vi.mock("@/lib/data/applications", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/data/applications")>();
  return { ...orig, submitApplication: mockSubmitApplication };
});

const { submitAcademyApplication } = await import("./actions");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("submitAcademyApplication", () => {
  const prevState = { errors: null, message: null, success: false };

  beforeEach(() => {
    mockSubmitApplication.mockResolvedValue(mockApplication);
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
  });

  it("rejects invalid program slug", async () => {
    const formData = new FormData();
    const result = await submitAcademyApplication("nonexistent", prevState, formData);
    expect(result.message).toContain("Invalid program");
    expect(result.success).toBe(false);
  });

  it("rejects closed program", async () => {
    const formData = new FormData();
    const result = await submitAcademyApplication("filmmaking", prevState, formData);
    expect(result.message).toContain("closed");
    expect(result.success).toBe(false);
  });

  it("returns validation errors for missing required fields", async () => {
    const formData = new FormData();
    const result = await submitAcademyApplication("photography", prevState, formData);
    expect(result.errors).not.toBeNull();
    expect(result.message).toContain("fix the errors");
    expect(result.success).toBe(false);
  });

  it("returns error on DB submission failure", async () => {
    mockSubmitApplication.mockRejectedValue(new Error("DB error"));

    // Bypass schema validation for this test — we're testing DB error handling
    mockBuildFullSchema.mockReturnValueOnce(z.object({}).passthrough());

    const formData = new FormData();
    formData.set("first_name", "Alice");
    formData.set("last_name", "Smith");

    const result = await submitAcademyApplication("photography", prevState, formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Something went wrong");
  });

  it("redirects to success page after submission", async () => {
    mockBuildFullSchema.mockReturnValueOnce(z.object({}).passthrough());

    const formData = new FormData();
    formData.set("first_name", "Alice");

    await expect(
      submitAcademyApplication("photography", prevState, formData),
    ).rejects.toThrow(RedirectError);

    try {
      await submitAcademyApplication("photography", prevState, formData);
    } catch (e) {
      expect((e as RedirectError).url).toBe("/academy/photography/apply/success");
    }
  });
});
