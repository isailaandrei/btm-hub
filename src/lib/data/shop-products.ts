import { cache } from "react";
import { getProfile } from "@/lib/data/profiles";
import {
  MOCK_SHOP_PRODUCT,
  shouldShowMockShopProduct,
} from "@/lib/shop/mock-product";
import { createClient } from "@/lib/supabase/server";
import type { ShopProductWithVariants } from "@/lib/shop/types";

const PRODUCT_SELECT = `
  *,
  variants:shop_product_variants(*),
  media:shop_product_media(*)
`;

function sortProductRelations(product: ShopProductWithVariants): ShopProductWithVariants {
  return {
    ...product,
    variants: [...(product.variants ?? [])].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    }),
    media: [...(product.media ?? [])].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    }),
  };
}

export const getShopProducts = cache(async function getShopProducts(): Promise<ShopProductWithVariants[]> {
  const profile = await getProfile();
  const supabase = await createClient();
  const visibility = profile ? ["public", "members"] : ["public"];

  const { data, error } = await supabase
    .from("shop_products")
    .select(PRODUCT_SELECT)
    .eq("status", "active")
    .in("visibility", visibility)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load shop products: ${error.message}`);

  const products = ((data ?? []) as ShopProductWithVariants[]).map(sortProductRelations);

  if (products.length === 0 && shouldShowMockShopProduct()) {
    return [MOCK_SHOP_PRODUCT];
  }

  return products;
});

export const getShopProductBySlug = cache(async function getShopProductBySlug(
  slug: string,
): Promise<ShopProductWithVariants | null> {
  const profile = await getProfile();
  const supabase = await createClient();
  const visibility = profile ? ["public", "members"] : ["public"];

  const { data, error } = await supabase
    .from("shop_products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .eq("status", "active")
    .in("visibility", visibility)
    .maybeSingle();

  if (error) throw new Error(`Failed to load shop product: ${error.message}`);
  if (!data) {
    if (slug === MOCK_SHOP_PRODUCT.slug && shouldShowMockShopProduct()) {
      return MOCK_SHOP_PRODUCT;
    }

    return null;
  }

  return sortProductRelations(data as ShopProductWithVariants);
});
