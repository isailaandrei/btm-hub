import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

describe("shop shipping data fetchers", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SHOW_MOCK_SHOP_PRODUCT;
    mockSupabase = createMockSupabaseClient();
    mockSupabase.mockQueryResult([]);

    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
  });

  it("loads active shipping zones ordered for checkout", async () => {
    const { listActiveShippingZones } = await import("./shop-shipping");

    await listActiveShippingZones();

    expect(mockSupabase.client.from).toHaveBeenCalledWith("shop_shipping_zones");
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("active", true);
    expect(mockSupabase.query.order).toHaveBeenCalledWith("sort_order", {
      ascending: true,
    });
  });

  it("does not invent shipping zones unless mock shop preview is enabled", async () => {
    const { listActiveShippingZones } = await import("./shop-shipping");

    await expect(listActiveShippingZones()).resolves.toEqual([]);
  });

  it("throws a loud error when shipping zone loading fails outside mock preview", async () => {
    mockSupabase.mockQueryResult(null, { message: "TypeError: fetch failed" });
    const { listActiveShippingZones } = await import("./shop-shipping");

    await expect(listActiveShippingZones()).rejects.toThrow(
      "Failed to load shipping zones: TypeError: fetch failed",
    );
  });

  it("provides mock shipping zones for the mock shop preview", async () => {
    process.env.NEXT_PUBLIC_SHOW_MOCK_SHOP_PRODUCT = "1";
    const {
      allowedShippingCountries,
      findShippingZoneForCountry,
      listActiveShippingZones,
    } = await import("./shop-shipping");

    const zones = await listActiveShippingZones();

    expect(zones).toHaveLength(3);
    expect(zones[0]?.name).toBe("Portugal");
    expect(zones[0]?.rates[0]?.price_cents).toBe(500);
    expect(findShippingZoneForCountry(zones, "us")?.name).toBe("International");
    expect(allowedShippingCountries(zones)).toEqual(
      expect.arrayContaining(["PT", "ES", "GB", "US", "CA"]),
    );
  });

  it("uses mock shipping zones when Supabase is unavailable in mock preview", async () => {
    process.env.NEXT_PUBLIC_SHOW_MOCK_SHOP_PRODUCT = "1";
    mockSupabase.mockQueryResult(null, { message: "TypeError: fetch failed" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { listActiveShippingZones } = await import("./shop-shipping");

    const zones = await listActiveShippingZones();

    expect(zones).toHaveLength(3);
    expect(zones[0]?.rates[0]?.price_cents).toBe(500);
    expect(warn).toHaveBeenCalledWith(
      "Using mock shop shipping zones because shipping zone loading failed in mock preview mode.",
      { message: "TypeError: fetch failed" },
    );
    warn.mockRestore();
  });
});
