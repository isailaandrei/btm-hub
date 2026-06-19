import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";
import type { Profile } from "@/types/database";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockProfile: Profile = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "admin@test.com",
  display_name: "Admin User",
  bio: null,
  avatar_url: null,
  role: "admin",
  preferences: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue(mockProfile),
}));

const CONTACT_ID = "660e8400-e29b-41d4-a716-446655440001";
const SECOND_CONTACT_ID = "770e8400-e29b-41d4-a716-446655440002";
const TAG_ID = "880e8400-e29b-41d4-a716-446655440003";

describe("contact tag assignment timeline events", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
  });

  it("assignTag delegates to the RPC with the current admin for timeline attribution", async () => {
    mockSupabase.mockQueryResult({
      requested: 1,
      existing: 1,
      inserted: 1,
      already_assigned: 0,
      skipped_missing: 0,
      inserted_assignments: [
        {
          contact_id: CONTACT_ID,
          assigned_at: "2026-05-01T12:00:00.000Z",
        },
      ],
    });

    const { assignTag } = await import("./contacts");
    await assignTag(CONTACT_ID, TAG_ID);

    expect(mockSupabase.client.rpc).toHaveBeenCalledWith(
      "bulk_assign_contact_tags",
      {
        p_contact_ids: [CONTACT_ID],
        p_tag_id: TAG_ID,
        p_author_id: mockProfile.id,
        p_author_name: mockProfile.display_name,
      },
    );
  });

  it("bulkAssignTags delegates to the RPC with the current admin and keeps its public return shape", async () => {
    mockSupabase.mockQueryResult({
      requested: 2,
      existing: 2,
      inserted: 1,
      already_assigned: 1,
      skipped_missing: 0,
      inserted_assignments: [
        {
          contact_id: CONTACT_ID,
          assigned_at: "2026-05-01T12:00:00.000Z",
        },
      ],
    });

    const { bulkAssignTags } = await import("./contacts");
    const result = await bulkAssignTags([CONTACT_ID, SECOND_CONTACT_ID], TAG_ID);

    expect(mockSupabase.client.rpc).toHaveBeenCalledWith(
      "bulk_assign_contact_tags",
      {
        p_contact_ids: [CONTACT_ID, SECOND_CONTACT_ID],
        p_tag_id: TAG_ID,
        p_author_id: mockProfile.id,
        p_author_name: mockProfile.display_name,
      },
    );
    expect(result).toEqual({
      requested: 2,
      existing: 2,
      inserted: 1,
      alreadyAssigned: 1,
      skippedMissing: 0,
    });
  });

  it("unassignTag delegates to the removal RPC with the current admin for timeline attribution", async () => {
    mockSupabase.mockQueryResult({
      requested: 1,
      existing: 1,
      removed: 1,
      not_assigned: 0,
      skipped_missing: 0,
      removed_assignments: [
        {
          contact_id: CONTACT_ID,
          assigned_at: "2026-05-01T12:00:00.000Z",
          removed_at: "2026-05-02T12:00:00.000Z",
        },
      ],
    });

    const { unassignTag } = await import("./contacts");
    await unassignTag(CONTACT_ID, TAG_ID);

    expect(mockSupabase.client.rpc).toHaveBeenCalledWith(
      "bulk_unassign_contact_tags",
      {
        p_contact_ids: [CONTACT_ID],
        p_tag_id: TAG_ID,
        p_author_id: mockProfile.id,
        p_author_name: mockProfile.display_name,
      },
    );
  });

  it("bulkUnassignTags delegates to the removal RPC and keeps its public return shape", async () => {
    mockSupabase.mockQueryResult({
      requested: 2,
      existing: 2,
      removed: 1,
      not_assigned: 1,
      skipped_missing: 0,
      removed_assignments: [
        {
          contact_id: CONTACT_ID,
          assigned_at: "2026-05-01T12:00:00.000Z",
          removed_at: "2026-05-02T12:00:00.000Z",
        },
      ],
    });

    const { bulkUnassignTags } = await import("./contacts");
    const result = await bulkUnassignTags(
      [CONTACT_ID, SECOND_CONTACT_ID],
      TAG_ID,
    );

    expect(mockSupabase.client.rpc).toHaveBeenCalledWith(
      "bulk_unassign_contact_tags",
      {
        p_contact_ids: [CONTACT_ID, SECOND_CONTACT_ID],
        p_tag_id: TAG_ID,
        p_author_id: mockProfile.id,
        p_author_name: mockProfile.display_name,
      },
    );
    expect(result).toEqual({
      requested: 2,
      existing: 2,
      removed: 1,
      notAssigned: 1,
      skippedMissing: 0,
    });
  });
});
