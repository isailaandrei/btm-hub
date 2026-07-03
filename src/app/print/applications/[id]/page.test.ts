import { describe, expect, it, vi } from "vitest";
import type { Application } from "@/types/database";
import { getContactDetailApplication } from "@/lib/data/contact-detail";
import { generateMetadata } from "./page";

vi.mock("@/lib/data/contact-detail", () => ({
  getContactDetailApplication: vi.fn(),
}));

const APP_ID = "550e8400-e29b-41d4-a716-446655440002";

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: APP_ID,
    user_id: null,
    contact_id: null,
    program: "photography",
    status: "reviewing",
    answers: { first_name: "Jane", last_name: "Doe" },
    tags: [],
    admin_notes: [],
    submitted_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("print page generateMetadata", () => {
  it("titles the document '<applicant> - BTM Application' (the PDF filename)", async () => {
    vi.mocked(getContactDetailApplication).mockResolvedValue(makeApp());
    const meta = await generateMetadata(params(APP_ID));
    expect(meta.title).toBe("Jane Doe - BTM Application");
  });

  it("sets no title for a malformed id (keeps the app default)", async () => {
    const meta = await generateMetadata(params("not-a-uuid"));
    expect(meta.title).toBeUndefined();
    expect(getContactDetailApplication).not.toHaveBeenCalled();
  });

  it("sets no title when the application does not exist", async () => {
    vi.mocked(getContactDetailApplication).mockResolvedValue(null);
    const meta = await generateMetadata(params(APP_ID));
    expect(meta.title).toBeUndefined();
  });
});
