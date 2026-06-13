import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthUser = vi.fn();
const mockCreateClient = vi.fn();

vi.mock("@/lib/data/auth", () => ({
  getAuthUser: mockGetAuthUser,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

function makeQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "insert", "maybeSingle"]) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.then = vi.fn((resolve) => resolve(result));
  return query;
}

describe("getProfile", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates a member profile when an authenticated user has no profile row yet", async () => {
    const createdProfile = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "user@example.com",
      role: "member",
      display_name: "User",
      bio: null,
      avatar_url: null,
      preferences: {},
      created_at: "2026-06-12T00:00:00Z",
      updated_at: "2026-06-12T00:00:00Z",
    };
    const missingProfileQuery = makeQuery({
      data: null,
      error: { code: "PGRST116", message: "No rows found" },
    });
    const insertProfileQuery = makeQuery({
      data: createdProfile,
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce(missingProfileQuery)
      .mockReturnValueOnce(insertProfileQuery);
    mockCreateClient.mockResolvedValue({ from });
    mockGetAuthUser.mockResolvedValue({
      id: createdProfile.id,
      email: createdProfile.email,
      user_metadata: { display_name: "User" },
    });

    const { getProfile } = await import("./profiles");
    await expect(getProfile()).resolves.toEqual(createdProfile);

    expect(from).toHaveBeenCalledWith("profiles");
    expect(insertProfileQuery.insert).toHaveBeenCalledWith({
      id: createdProfile.id,
      email: createdProfile.email,
      display_name: "User",
    });
    expect(insertProfileQuery.select).toHaveBeenCalledWith(
      "id, email, role, display_name, bio, avatar_url, preferences, created_at, updated_at",
    );
    expect(insertProfileQuery.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("re-reads the profile when another request creates it first", async () => {
    const createdProfile = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "user@example.com",
      role: "member",
      display_name: "User",
      bio: null,
      avatar_url: null,
      preferences: {},
      created_at: "2026-06-12T00:00:00Z",
      updated_at: "2026-06-12T00:00:00Z",
    };
    const missingProfileQuery = makeQuery({
      data: null,
      error: { code: "PGRST116", message: "No rows found" },
    });
    const duplicateInsertQuery = makeQuery({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    const rereadProfileQuery = makeQuery({
      data: createdProfile,
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce(missingProfileQuery)
      .mockReturnValueOnce(duplicateInsertQuery)
      .mockReturnValueOnce(rereadProfileQuery);
    mockCreateClient.mockResolvedValue({ from });
    mockGetAuthUser.mockResolvedValue({
      id: createdProfile.id,
      email: createdProfile.email,
      user_metadata: { display_name: "User" },
    });

    const { getProfile } = await import("./profiles");
    await expect(getProfile()).resolves.toEqual(createdProfile);

    expect(duplicateInsertQuery.insert).toHaveBeenCalledTimes(1);
    expect(rereadProfileQuery.eq).toHaveBeenCalledWith("id", createdProfile.id);
  });

  it("retries a duplicate-create reread when the profile is not visible immediately", async () => {
    const createdProfile = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "user@example.com",
      role: "member",
      display_name: "User",
      bio: null,
      avatar_url: null,
      preferences: {},
      created_at: "2026-06-12T00:00:00Z",
      updated_at: "2026-06-12T00:00:00Z",
    };
    const missingProfileQuery = makeQuery({
      data: null,
      error: null,
    });
    const duplicateInsertQuery = makeQuery({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    const transientMissingRereadQuery = makeQuery({
      data: null,
      error: null,
    });
    const successfulRereadQuery = makeQuery({
      data: createdProfile,
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce(missingProfileQuery)
      .mockReturnValueOnce(duplicateInsertQuery)
      .mockReturnValueOnce(transientMissingRereadQuery)
      .mockReturnValueOnce(successfulRereadQuery);
    mockCreateClient.mockResolvedValue({ from });
    mockGetAuthUser.mockResolvedValue({
      id: createdProfile.id,
      email: createdProfile.email,
      user_metadata: { display_name: "User" },
    });

    const { getProfile } = await import("./profiles");
    await expect(getProfile()).resolves.toEqual(createdProfile);

    expect(transientMissingRereadQuery.eq).toHaveBeenCalledWith("id", createdProfile.id);
    expect(successfulRereadQuery.eq).toHaveBeenCalledWith("id", createdProfile.id);
  });
});
