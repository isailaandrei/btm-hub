import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(),
}));

const ADMIN_PROFILE = {
  id: "admin-1",
  email: "admin@example.com",
  display_name: "Admin",
  bio: null,
  avatar_url: null,
  role: "admin",
  preferences: {},
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
} as const;

const CONTACT_ID = "550e8400-e29b-41d4-a716-446655440001";
const FIELD_ID = "660e8400-e29b-41d4-a716-446655440002";

describe("contact info data access", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = await import("@/lib/supabase/server");
    const { requireAdmin } = await import("@/lib/auth/require-admin");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_PROFILE);
  });

  describe("getContactInfoFields", () => {
    it("queries fields ordered by sort_order", async () => {
      const fields = [
        { id: FIELD_ID, name: "Address", sort_order: 0, created_at: "2026-05-01T00:00:00.000Z" },
      ];
      mockSupabase.mockQueryResult(fields);

      const { getContactInfoFields } = await import("./contact-info");
      const result = await getContactInfoFields();

      expect(mockSupabase.client.from).toHaveBeenCalledWith("contact_info_fields");
      expect(mockSupabase.query.select).toHaveBeenCalledWith("*");
      expect(mockSupabase.query.order).toHaveBeenCalledWith("sort_order", {
        ascending: true,
      });
      expect(result).toBe(fields);
    });

    it("throws with context on error", async () => {
      mockSupabase.mockQueryResult(null, { message: "db down" });

      const { getContactInfoFields } = await import("./contact-info");
      await expect(getContactInfoFields()).rejects.toThrow(
        "Failed to load contact info fields: db down",
      );
    });
  });

  describe("getContactInfoValues", () => {
    it("queries values with the embedded field, filtered by contact", async () => {
      const rows = [
        {
          field_id: FIELD_ID,
          value: "123 Ocean Ave",
          updated_at: "2026-05-01T00:00:00.000Z",
          contact_info_fields: { id: FIELD_ID, name: "Address", sort_order: 0 },
        },
      ];
      mockSupabase.mockQueryResult(rows);

      const { getContactInfoValues } = await import("./contact-info");
      const result = await getContactInfoValues(CONTACT_ID);

      expect(mockSupabase.client.from).toHaveBeenCalledWith("contact_info_values");
      expect(mockSupabase.query.select).toHaveBeenCalledWith(
        "field_id, value, updated_at, contact_info_fields(id, name, sort_order)",
      );
      expect(mockSupabase.query.eq).toHaveBeenCalledWith("contact_id", CONTACT_ID);
      expect(result).toBe(rows);
    });

    it("throws with context on error", async () => {
      mockSupabase.mockQueryResult(null, { message: "db down" });

      const { getContactInfoValues } = await import("./contact-info");
      await expect(getContactInfoValues(CONTACT_ID)).rejects.toThrow(
        "Failed to load contact info values: db down",
      );
    });
  });

  describe("setContactInfoValue", () => {
    it("requires admin and upserts with an explicit updated_at", async () => {
      mockSupabase.mockQueryResult(null);

      const { setContactInfoValue } = await import("./contact-info");
      const { requireAdmin } = await import("@/lib/auth/require-admin");
      await setContactInfoValue(CONTACT_ID, FIELD_ID, "123 Ocean Ave");

      expect(vi.mocked(requireAdmin)).toHaveBeenCalledOnce();
      expect(mockSupabase.client.from).toHaveBeenCalledWith("contact_info_values");
      expect(mockSupabase.query.upsert).toHaveBeenCalledWith(
        {
          contact_id: CONTACT_ID,
          field_id: FIELD_ID,
          value: "123 Ocean Ave",
          updated_at: expect.any(String),
        },
        { onConflict: "contact_id,field_id" },
      );
    });

    it("throws with context on error", async () => {
      mockSupabase.mockQueryResult(null, { message: "constraint violation" });

      const { setContactInfoValue } = await import("./contact-info");
      await expect(
        setContactInfoValue(CONTACT_ID, FIELD_ID, "value"),
      ).rejects.toThrow("Failed to save contact info value: constraint violation");
    });
  });

  describe("createContactInfoFieldWithValue", () => {
    it("requires admin and calls the find-or-create RPC", async () => {
      const field = {
        id: FIELD_ID,
        name: "Address",
        sort_order: 0,
        created_at: "2026-05-01T00:00:00.000Z",
      };
      mockSupabase.mockQueryResult(field);

      const { createContactInfoFieldWithValue } = await import("./contact-info");
      const { requireAdmin } = await import("@/lib/auth/require-admin");
      const result = await createContactInfoFieldWithValue(
        CONTACT_ID,
        "Address",
        "123 Ocean Ave",
      );

      expect(vi.mocked(requireAdmin)).toHaveBeenCalledOnce();
      expect(mockSupabase.client.rpc).toHaveBeenCalledWith(
        "set_contact_info_field_value",
        {
          p_contact_id: CONTACT_ID,
          p_field_name: "Address",
          p_value: "123 Ocean Ave",
        },
      );
      expect(result).toBe(field);
    });

    it("throws with context on error", async () => {
      mockSupabase.mockQueryResult(null, { message: "rpc failed" });

      const { createContactInfoFieldWithValue } = await import("./contact-info");
      await expect(
        createContactInfoFieldWithValue(CONTACT_ID, "Address", "value"),
      ).rejects.toThrow("Failed to create contact info field: rpc failed");
    });
  });

  describe("removeContactInfoValue", () => {
    it("requires admin and deletes by contact and field", async () => {
      mockSupabase.mockQueryResult(null);

      const { removeContactInfoValue } = await import("./contact-info");
      const { requireAdmin } = await import("@/lib/auth/require-admin");
      await removeContactInfoValue(CONTACT_ID, FIELD_ID);

      expect(vi.mocked(requireAdmin)).toHaveBeenCalledOnce();
      expect(mockSupabase.client.from).toHaveBeenCalledWith("contact_info_values");
      expect(mockSupabase.query.eq).toHaveBeenNthCalledWith(1, "contact_id", CONTACT_ID);
      expect(mockSupabase.query.eq).toHaveBeenNthCalledWith(2, "field_id", FIELD_ID);
    });

    it("throws with context on error", async () => {
      mockSupabase.mockQueryResult(null, { message: "db down" });

      const { removeContactInfoValue } = await import("./contact-info");
      await expect(removeContactInfoValue(CONTACT_ID, FIELD_ID)).rejects.toThrow(
        "Failed to remove contact info value: db down",
      );
    });
  });
});
