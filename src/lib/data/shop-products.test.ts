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
    delete process.env.NEXT_PUBLIC_SHOW_MOCK_SHOP_PRODUCT;
    delete process.env.VERCEL_ENV;
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

  it("does not show the mock product unless the demo flag is enabled", async () => {
    const { getShopProducts } = await import("./shop-products");

    const products = await getShopProducts();

    expect(products).toEqual([]);
  });

  it("shows a clearly marked mock product when the development catalog is empty", async () => {
    process.env.NEXT_PUBLIC_SHOW_MOCK_SHOP_PRODUCT = "1";
    const { getShopProducts } = await import("./shop-products");

    const products = await getShopProducts();

    expect(products).toHaveLength(1);
    expect(products[0]?.slug).toBe("mock-btm-freedive-hoodie");
    expect(products[0]?.title).toContain("Mock");
    expect(products[0]?.variants[0]?.price_cents).toBeGreaterThan(0);
    expect(products[0]?.media[0]?.public_url).toBe("/mock-shop-product.png");
    expect(products[0]?.media[0]?.mime_type).toBe("image/png");
  });

  it("uses the mock product when Supabase is unavailable in mock preview", async () => {
    process.env.NEXT_PUBLIC_SHOW_MOCK_SHOP_PRODUCT = "1";
    mockSupabase.mockQueryResult(null, { message: "TypeError: fetch failed" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { getShopProducts } = await import("./shop-products");

    const products = await getShopProducts();

    expect(products).toHaveLength(1);
    expect(products[0]?.slug).toBe("mock-btm-freedive-hoodie");
    expect(warn).toHaveBeenCalledWith(
      "Using mock shop product because product loading failed in mock preview mode.",
      { message: "TypeError: fetch failed" },
    );
    warn.mockRestore();
  });

  it("loads the mock product detail by slug when enabled", async () => {
    process.env.NEXT_PUBLIC_SHOW_MOCK_SHOP_PRODUCT = "1";
    mockSupabase.mockQueryResult(null);
    const { getShopProductBySlug } = await import("./shop-products");

    const product = await getShopProductBySlug("mock-btm-freedive-hoodie");

    expect(product?.title).toContain("Mock");
    expect(product?.content_blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "bullets" }),
      ]),
    );
  });
});
