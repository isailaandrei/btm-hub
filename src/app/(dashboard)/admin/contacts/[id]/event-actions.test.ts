import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Profile } from "@/types/database";

const mockProfile: Profile = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "admin@test.com",
  display_name: "Admin",
  bio: null,
  avatar_url: null,
  role: "admin",
  preferences: {},
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue(mockProfile),
}));

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockResolve = vi.fn();
const mockUnresolve = vi.fn();

vi.mock("@/lib/data/contact-events", () => ({
  createContactEvent: mockCreate,
  updateContactEvent: mockUpdate,
  deleteContactEvent: mockDelete,
  resolveContactEvent: mockResolve,
  unresolveContactEvent: mockUnresolve,
}));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

const mockAfter = vi.fn((callback: () => Promise<void> | void) => {
  void Promise.resolve().then(callback);
});
vi.mock("next/server", () => ({ after: mockAfter }));

const mockSyncContactMemory = vi.fn();
vi.mock("@/lib/admin-ai-memory/server-action-sync", () => ({
  syncContactMemory: mockSyncContactMemory,
}));

const {
  createEvent,
  updateEvent,
  deleteEvent,
  resolveEvent,
  unresolveEvent,
} = await import("./event-actions");

const VALID_CONTACT = "550e8400-e29b-41d4-a716-446655440001";
const VALID_EVENT = "550e8400-e29b-41d4-a716-446655440002";

describe("createEvent", () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({
      id: VALID_EVENT,
      contact_id: VALID_CONTACT,
    });
  });

  it("creates a note event with body", async () => {
    await createEvent({
      contactId: VALID_CONTACT,
      type: "note",
      body: "Test note",
      happenedAt: "2026-04-22T14:30:00.000Z",
      customLabel: null,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: VALID_CONTACT,
        type: "note",
        body: "Test note",
      }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/admin/contacts/${VALID_CONTACT}`,
    );
  });

  it("rejects invalid contact UUID", async () => {
    await expect(
      createEvent({
        contactId: "not-a-uuid",
        type: "note",
        body: "Test",
        happenedAt: "2026-04-22T14:30:00.000Z",
        customLabel: null,
      }),
    ).rejects.toThrow();
  });

  it("rejects future happenedAt more than 1 minute ahead", async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await expect(
      createEvent({
        contactId: VALID_CONTACT,
        type: "note",
        body: "Test",
        happenedAt: future,
        customLabel: null,
      }),
    ).rejects.toThrow(/future/i);
  });

  it("accepts happenedAt within 1 minute skew tolerance", async () => {
    const nearFuture = new Date(Date.now() + 30 * 1000).toISOString();
    await createEvent({
      contactId: VALID_CONTACT,
      type: "note",
      body: "Test",
      happenedAt: nearFuture,
      customLabel: null,
    });
    expect(mockCreate).toHaveBeenCalled();
  });

  it("requires body for note", async () => {
    await expect(
      createEvent({
        contactId: VALID_CONTACT,
        type: "note",
        body: "",
        happenedAt: "2026-04-22T14:30:00.000Z",
        customLabel: null,
      }),
    ).rejects.toThrow(/needs a description/i);
  });

  it("allows empty body for call", async () => {
    await createEvent({
      contactId: VALID_CONTACT,
      type: "call",
      body: "",
      happenedAt: "2026-04-22T14:30:00.000Z",
      customLabel: null,
    });
    expect(mockCreate).toHaveBeenCalled();
  });

  it("requires custom_label for type=custom", async () => {
    await expect(
      createEvent({
        contactId: VALID_CONTACT,
        type: "custom",
        body: "Body",
        happenedAt: "2026-04-22T14:30:00.000Z",
        customLabel: null,
      }),
    ).rejects.toThrow(/label/i);
  });

  it("rejects custom_label longer than 80 chars", async () => {
    await expect(
      createEvent({
        contactId: VALID_CONTACT,
        type: "custom",
        body: "Body",
        happenedAt: "2026-04-22T14:30:00.000Z",
        customLabel: "x".repeat(81),
      }),
    ).rejects.toThrow(/80/);
  });

  it("rejects body longer than 5000 chars", async () => {
    await expect(
      createEvent({
        contactId: VALID_CONTACT,
        type: "note",
        body: "x".repeat(5001),
        happenedAt: "2026-04-22T14:30:00.000Z",
        customLabel: null,
      }),
    ).rejects.toThrow(/5000/);
  });

  it("snapshots author from requireAdmin", async () => {
    await createEvent({
      contactId: VALID_CONTACT,
      type: "note",
      body: "Test",
      happenedAt: "2026-04-22T14:30:00.000Z",
      customLabel: null,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: mockProfile.id,
        authorName: mockProfile.display_name,
      }),
    );
  });
});

describe("resolveEvent", () => {
  beforeEach(() => {
    mockResolve.mockResolvedValue({ id: VALID_EVENT, contact_id: VALID_CONTACT });
  });

  it("resolves a resolvable event and revalidates contact path", async () => {
    await resolveEvent(VALID_EVENT);
    expect(mockResolve).toHaveBeenCalledWith(VALID_EVENT, mockProfile.id);
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/admin/contacts/${VALID_CONTACT}`,
    );
  });

  it("rejects invalid UUID", async () => {
    await expect(resolveEvent("not-uuid")).rejects.toThrow();
  });
});

describe("unresolveEvent", () => {
  beforeEach(() => {
    mockUnresolve.mockResolvedValue({ id: VALID_EVENT, contact_id: VALID_CONTACT });
  });

  it("unresolves an event and revalidates contact path", async () => {
    await unresolveEvent(VALID_EVENT);
    expect(mockUnresolve).toHaveBeenCalledWith(VALID_EVENT);
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/admin/contacts/${VALID_CONTACT}`,
    );
  });
});

describe("updateEvent", () => {
  beforeEach(() => {
    mockUpdate.mockResolvedValue({ id: VALID_EVENT, contact_id: VALID_CONTACT, type: "note" });
  });

  it("updates body", async () => {
    await updateEvent(VALID_EVENT, { body: "New body" });
    expect(mockUpdate).toHaveBeenCalledWith(VALID_EVENT, { body: "New body" });
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/admin/contacts/${VALID_CONTACT}`,
    );
  });

  it("rejects body over 5000 chars", async () => {
    await expect(
      updateEvent(VALID_EVENT, { body: "x".repeat(5001) }),
    ).rejects.toThrow(/5000/);
  });

  it("rejects future happenedAt beyond skew tolerance", async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await expect(
      updateEvent(VALID_EVENT, { happenedAt: future }),
    ).rejects.toThrow(/future/i);
  });
});

describe("deleteEvent", () => {
  beforeEach(() => {
    mockDelete.mockResolvedValue({ id: VALID_EVENT, contact_id: VALID_CONTACT, type: "note" });
  });

  it("deletes and revalidates contact path", async () => {
    await deleteEvent(VALID_EVENT);
    expect(mockDelete).toHaveBeenCalledWith(VALID_EVENT);
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/admin/contacts/${VALID_CONTACT}`,
    );
  });
});
