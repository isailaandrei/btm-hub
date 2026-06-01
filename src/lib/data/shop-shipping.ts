import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  MOCK_SHOP_SHIPPING_ZONES,
  shouldShowMockShopProduct,
} from "@/lib/shop/mock-product";
import type { ShopShippingZoneWithRates } from "@/lib/shop/types";

const SHIPPING_SELECT = `
  *,
  rates:shop_shipping_rates(*)
`;

function sortShippingRelations(zone: ShopShippingZoneWithRates): ShopShippingZoneWithRates {
  return {
    ...zone,
    rates: [...(zone.rates ?? [])]
      .filter((rate) => rate.active)
      .sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.created_at.localeCompare(b.created_at);
      }),
  };
}

export const listActiveShippingZones = cache(async function listActiveShippingZones() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_shipping_zones")
    .select(SHIPPING_SELECT)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (shouldShowMockShopProduct()) {
      console.warn(
        "Using mock shop shipping zones because shipping zone loading failed in mock preview mode.",
        { message: error.message },
      );
      return MOCK_SHOP_SHIPPING_ZONES;
    }

    throw new Error(`Failed to load shipping zones: ${error.message}`);
  }

  const zones = ((data ?? []) as ShopShippingZoneWithRates[]).map(sortShippingRelations);

  if (zones.length === 0 && shouldShowMockShopProduct()) {
    return MOCK_SHOP_SHIPPING_ZONES;
  }

  return zones;
});

export function findShippingZoneForCountry(
  zones: ShopShippingZoneWithRates[],
  countryCode: string,
) {
  const normalized = countryCode.trim().toUpperCase();
  return zones.find((zone) => zone.allowed_countries.includes(normalized)) ?? null;
}

export function allowedShippingCountries(zones: ShopShippingZoneWithRates[]) {
  return [...new Set(zones.flatMap((zone) => zone.allowed_countries))].sort();
}
