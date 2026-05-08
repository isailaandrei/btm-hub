import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";
import type { Profile } from "@/types/database";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/data/profiles", () => ({
  getProfile: vi.fn(),
}));

describe("shop product data fetchers", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = await import("@/lib/supabase/server");
    const { getProfile } = await import("@/lib/data/profiles");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
    vi.mocked(getProfile).mockResolvedValue(null);
    mockSupabase.mockQueryResult([]);
  });

  it("loads public product listing ordered for storefront display", async () => {
    const { getShopProducts } = await import("./shop-products");

    await getShopProducts();

    expect(mockSupabase.client.from).toHaveBeenCalledWith("shop_products");
    expect(mockSupabase.query.select).toHaveBeenCalledWith(expect.stringContaining("variants:shop_product_variants(*)"));
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("status", "active");
    expect(mockSupabase.query.in).toHaveBeenCalledWith("visibility", ["public"]);
    expect(mockSupabase.query.order).toHaveBeenCalledWith("sort_order", { ascending: true });
  });

  it("includes member products when a profile is present", async () => {
    const { getProfile } = await import("@/lib/data/profiles");
    vi.mocked(getProfile).mockResolvedValue({ id: "profile-1", role: "member" } as Profile);

    const { getShopProducts } = await import("./shop-products");
    await getShopProducts();

    expect(mockSupabase.query.in).toHaveBeenCalledWith("visibility", ["public", "members"]);
  });

  it("loads a product by slug with variants and media", async () => {
    const { getShopProductBySlug } = await import("./shop-products");

    await getShopProductBySlug("mask-tee");

    expect(mockSupabase.client.from).toHaveBeenCalledWith("shop_products");
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("slug", "mask-tee");
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("status", "active");
    expect(mockSupabase.query.maybeSingle).toHaveBeenCalled();
  });

  it("throws a loud error when product loading fails", async () => {
    mockSupabase.mockQueryResult(null, { message: "database unavailable" });
    const { getShopProducts } = await import("./shop-products");

    await expect(getShopProducts()).rejects.toThrow(
      "Failed to load shop products: database unavailable",
    );
  });
});
