import { requireAdmin } from "@/lib/auth/require-admin";
import { parseShopContentBlocks } from "@/lib/shop/content-blocks";
import type {
  ShopOrderWithItems,
  ShopProductWithVariants,
  ShopShippingZoneWithRates,
} from "@/lib/shop/types";
import {
  SHOP_PRODUCT_MEDIA_BUCKET,
  storagePathBelongsToShopProduct,
} from "@/lib/storage/shop-product-media";
import { createClient } from "@/lib/supabase/server";
import type {
  ShopFulfillmentStatus,
  ShopOrderEventType,
  ShopOrderStatus,
  ShopProductStatus,
  ShopProductType,
  ShopProductVisibility,
  ShopPurchaseAccess,
  ShopTaxBehavior,
} from "@/types/database";

const PRODUCT_SELECT = `
  *,
  variants:shop_product_variants(*),
  media:shop_product_media(*)
`;

const SHIPPING_SELECT = `
  *,
  rates:shop_shipping_rates(*)
`;

const ORDER_SELECT = `
  *,
  profile:profiles(id, email, display_name),
  items:shop_order_items(*),
  events:shop_order_events(*)
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

export async function listAdminShopProducts(): Promise<ShopProductWithVariants[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_products")
    .select(PRODUCT_SELECT)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load admin shop products: ${error.message}`);

  return ((data ?? []) as ShopProductWithVariants[]).map(sortProductRelations);
}

function sortShippingRelations(zone: ShopShippingZoneWithRates): ShopShippingZoneWithRates {
  return {
    ...zone,
    rates: [...(zone.rates ?? [])].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    }),
  };
}

function sortOrderRelations(order: ShopOrderWithItems): ShopOrderWithItems {
  return {
    ...order,
    items: [...(order.items ?? [])].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    }),
    events: [...(order.events ?? [])].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    ),
  };
}

export async function createShopProduct(input: {
  title: string;
  slug: string;
  type: ShopProductType;
  visibility: ShopProductVisibility;
  purchaseAccess: ShopPurchaseAccess;
  shortDescription: string;
}) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_products")
    .insert({
      title: input.title,
      slug: input.slug,
      type: input.type,
      visibility: input.visibility,
      purchase_access: input.purchaseAccess,
      short_description: input.shortDescription,
      requires_shipping: input.type === "physical",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create product: ${error.message}`);
  return data;
}

export async function updateShopProduct(input: {
  productId: string;
  title: string;
  slug: string;
  status: ShopProductStatus;
  type: ShopProductType;
  visibility: ShopProductVisibility;
  purchaseAccess: ShopPurchaseAccess;
  shortDescription: string;
  requiresCustomerNotes: boolean;
  customerNotesLabel: string;
  stripeTaxCode?: string | null;
  taxBehavior?: ShopTaxBehavior;
}) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_products")
    .update({
      title: input.title,
      slug: input.slug,
      status: input.status,
      type: input.type,
      visibility: input.visibility,
      purchase_access: input.purchaseAccess,
      short_description: input.shortDescription,
      requires_shipping: input.type === "physical",
      requires_customer_notes: input.requiresCustomerNotes,
      customer_notes_label: input.customerNotesLabel,
      stripe_tax_code: input.stripeTaxCode ?? null,
      tax_behavior: input.taxBehavior ?? "exclusive",
    })
    .eq("id", input.productId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update product: ${error.message}`);
  return data;
}

export async function updateShopProductContent(productId: string, blocks: unknown[]) {
  await requireAdmin();
  const contentBlocks = parseShopContentBlocks(blocks);
  const supabase = await createClient();
  const { error } = await supabase
    .from("shop_products")
    .update({ content_blocks: contentBlocks })
    .eq("id", productId);

  if (error) throw new Error(`Failed to update product content: ${error.message}`);
}

export async function createShopVariant(input: {
  productId: string;
  title: string;
  sku?: string | null;
  priceCents: number;
  trackInventory: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  active: boolean;
  sortOrder?: number;
  stripeTaxCode?: string | null;
  taxBehavior?: ShopTaxBehavior;
}) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_product_variants")
    .insert({
      product_id: input.productId,
      title: input.title,
      sku: input.sku ?? null,
      price_cents: input.priceCents,
      track_inventory: input.trackInventory,
      stock_quantity: input.stockQuantity,
      low_stock_threshold: input.lowStockThreshold,
      active: input.active,
      sort_order: input.sortOrder ?? 0,
      stripe_tax_code: input.stripeTaxCode ?? null,
      tax_behavior: input.taxBehavior ?? "exclusive",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create variant: ${error.message}`);
  return data;
}

export async function updateShopVariant(input: {
  variantId: string;
  title: string;
  sku?: string | null;
  priceCents: number;
  trackInventory: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  active: boolean;
  sortOrder: number;
  stripeTaxCode?: string | null;
  taxBehavior?: ShopTaxBehavior;
}) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_product_variants")
    .update({
      title: input.title,
      sku: input.sku ?? null,
      price_cents: input.priceCents,
      track_inventory: input.trackInventory,
      stock_quantity: input.stockQuantity,
      low_stock_threshold: input.lowStockThreshold,
      active: input.active,
      sort_order: input.sortOrder,
      stripe_tax_code: input.stripeTaxCode ?? null,
      tax_behavior: input.taxBehavior ?? "exclusive",
    })
    .eq("id", input.variantId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update variant: ${error.message}`);
  return data;
}

export async function recordShopProductMedia(input: {
  productId: string;
  storagePath: string;
  publicUrl: string;
  altText: string;
  caption: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  isPrimary: boolean;
  sortOrder: number;
}) {
  await requireAdmin();
  if (!storagePathBelongsToShopProduct(input.storagePath, input.productId)) {
    throw new Error("Invalid product media storage path.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_product_media")
    .insert({
      product_id: input.productId,
      storage_path: input.storagePath,
      public_url: input.publicUrl,
      alt_text: input.altText,
      caption: input.caption,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      width: input.width ?? null,
      height: input.height ?? null,
      is_primary: input.isPrimary,
      sort_order: input.sortOrder,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to record product media: ${error.message}`);
  return data;
}

export async function deleteShopProductMedia(mediaId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: media, error: loadError } = await supabase
    .from("shop_product_media")
    .select("id, storage_path")
    .eq("id", mediaId)
    .maybeSingle();

  if (loadError) throw new Error(`Failed to load product media: ${loadError.message}`);
  if (!media) throw new Error("Product media not found.");

  const storagePath = (media as { storage_path: string }).storage_path;
  const { error: removeError } = await supabase.storage
    .from(SHOP_PRODUCT_MEDIA_BUCKET)
    .remove([storagePath]);

  if (removeError) {
    throw new Error(`Failed to delete product media object: ${removeError.message}`);
  }

  const { error } = await supabase
    .from("shop_product_media")
    .delete()
    .eq("id", mediaId);

  if (error) throw new Error(`Failed to delete product media: ${error.message}`);
}

export async function listAdminShippingZones(): Promise<ShopShippingZoneWithRates[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_shipping_zones")
    .select(SHIPPING_SELECT)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load shipping zones: ${error.message}`);

  return ((data ?? []) as ShopShippingZoneWithRates[]).map(sortShippingRelations);
}

export async function upsertShippingZone(input: {
  id?: string;
  name: string;
  slug: string;
  allowedCountries: string[];
  active: boolean;
  sortOrder: number;
}) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_shipping_zones")
    .upsert({
      id: input.id,
      name: input.name,
      slug: input.slug,
      allowed_countries: input.allowedCountries,
      active: input.active,
      sort_order: input.sortOrder,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to save shipping zone: ${error.message}`);
  return data;
}

export async function upsertShippingRate(input: {
  id?: string;
  zoneId: string;
  name: string;
  description: string;
  priceCents: number;
  active: boolean;
  sortOrder: number;
  stripeTaxCode?: string | null;
  taxBehavior?: ShopTaxBehavior;
}) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_shipping_rates")
    .upsert({
      id: input.id,
      zone_id: input.zoneId,
      name: input.name,
      description: input.description,
      price_cents: input.priceCents,
      active: input.active,
      sort_order: input.sortOrder,
      stripe_tax_code: input.stripeTaxCode ?? null,
      tax_behavior: input.taxBehavior ?? "exclusive",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to save shipping rate: ${error.message}`);
  return data;
}

export async function listAdminShopOrders(input: {
  status?: ShopOrderStatus | "all";
  limit?: number;
} = {}): Promise<ShopOrderWithItems[]> {
  await requireAdmin();
  const supabase = await createClient();
  let query = supabase
    .from("shop_orders")
    .select(ORDER_SELECT)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);

  if (input.status && input.status !== "all") {
    query = query.eq("status", input.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load shop orders: ${error.message}`);

  return ((data ?? []) as ShopOrderWithItems[]).map(sortOrderRelations);
}

export async function updateOrderFulfillment(input: {
  orderId: string;
  fulfillmentStatus: ShopFulfillmentStatus;
  trackingCarrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
}) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("shop_orders")
    .update({
      fulfillment_status: input.fulfillmentStatus,
      tracking_carrier: input.trackingCarrier ?? null,
      tracking_number: input.trackingNumber ?? null,
      tracking_url: input.trackingUrl ?? null,
    })
    .eq("id", input.orderId);

  if (error) throw new Error(`Failed to update order fulfillment: ${error.message}`);

  const eventType: ShopOrderEventType =
    input.trackingCarrier || input.trackingNumber || input.trackingUrl
      ? "tracking_updated"
      : "fulfillment_updated";

  const { error: eventError } = await supabase
    .from("shop_order_events")
    .insert({
      order_id: input.orderId,
      type: eventType,
      message: "Fulfillment updated.",
      payload: {
        fulfillmentStatus: input.fulfillmentStatus,
        trackingCarrier: input.trackingCarrier ?? null,
        trackingNumber: input.trackingNumber ?? null,
        trackingUrl: input.trackingUrl ?? null,
      },
      customer_visible: true,
    });

  if (eventError) {
    throw new Error(`Failed to record fulfillment event: ${eventError.message}`);
  }
}
