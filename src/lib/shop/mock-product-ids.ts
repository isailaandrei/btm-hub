export const MOCK_SHOP_PRODUCT_ID = "00000000-0000-4000-8000-000000000001";
export const MOCK_SHOP_VARIANT_HOODIE_M_ID = "00000000-0000-4000-8000-000000000011";
export const MOCK_SHOP_VARIANT_HOODIE_L_ID = "00000000-0000-4000-8000-000000000012";

export const LEGACY_MOCK_SHOP_VARIANT_HOODIE_M_ID = "mock-shop-variant-hoodie-m";
export const LEGACY_MOCK_SHOP_VARIANT_HOODIE_L_ID = "mock-shop-variant-hoodie-l";

const MOCK_VARIANT_IDS = new Set([
  MOCK_SHOP_VARIANT_HOODIE_M_ID,
  MOCK_SHOP_VARIANT_HOODIE_L_ID,
]);

const LEGACY_MOCK_VARIANT_ID_ALIASES: Record<string, string> = {
  [LEGACY_MOCK_SHOP_VARIANT_HOODIE_M_ID]: MOCK_SHOP_VARIANT_HOODIE_M_ID,
  [LEGACY_MOCK_SHOP_VARIANT_HOODIE_L_ID]: MOCK_SHOP_VARIANT_HOODIE_L_ID,
};

export function normalizeMockShopVariantId(variantId: string) {
  return LEGACY_MOCK_VARIANT_ID_ALIASES[variantId] ?? variantId;
}

export function isMockShopVariantId(variantId: string) {
  return MOCK_VARIANT_IDS.has(normalizeMockShopVariantId(variantId));
}
