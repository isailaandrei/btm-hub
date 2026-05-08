import { requireAdmin } from "@/lib/auth/require-admin";
import { parseShopContentBlocks } from "@/lib/shop/content-blocks";
import { createClient } from "@/lib/supabase/server";
import type {
  ShopFulfillmentStatus,
  ShopProductStatus,
  ShopProductType,
  ShopProductVisibility,
  ShopPurchaseAccess,
  ShopTaxBehavior,
} from "@/types/database";

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
  const { error } = await supabase
    .from("shop_product_media")
    .delete()
    .eq("id", mediaId);

  if (error) throw new Error(`Failed to delete product media: ${error.message}`);
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
}
