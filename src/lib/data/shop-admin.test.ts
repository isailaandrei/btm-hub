import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(),
}));

describe("shop admin data mutations", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    mockSupabase.mockQueryResult({ id: "product-1" });

    const { createClient } = await import("@/lib/supabase/server");
    const { requireAdmin } = await import("@/lib/auth/require-admin");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1", role: "admin" } as never);
  });

  it("creates products through shop_products after requiring admin", async () => {
    const { requireAdmin } = await import("@/lib/auth/require-admin");
    const { createShopProduct } = await import("./shop-admin");

    await createShopProduct({
      title: "Mask Tee",
      slug: "mask-tee",
      type: "physical",
      visibility: "members",
      purchaseAccess: "members",
      shortDescription: "BTM shirt",
    });

    expect(requireAdmin).toHaveBeenCalled();
    expect(mockSupabase.client.from).toHaveBeenCalledWith("shop_products");
    expect(mockSupabase.query.insert).toHaveBeenCalledWith(expect.objectContaining({
      title: "Mask Tee",
      slug: "mask-tee",
      type: "physical",
      requires_shipping: true,
    }));
  });

  it("updates product content after validating content blocks", async () => {
    const { updateShopProductContent } = await import("./shop-admin");

    await updateShopProductContent("product-1", [
      { type: "rich_text", body: "Cold-water training." },
    ]);

    expect(mockSupabase.client.from).toHaveBeenCalledWith("shop_products");
    expect(mockSupabase.query.update).toHaveBeenCalledWith(expect.objectContaining({
      content_blocks: [{ type: "rich_text", body: "Cold-water training." }],
    }));
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("id", "product-1");
  });
});
