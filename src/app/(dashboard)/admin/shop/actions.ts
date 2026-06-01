"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import {
  createShopProduct,
  createShopVariant,
  deleteShopProductMedia,
  listAdminShippingZones,
  listAdminShopOrders,
  listAdminShopProducts,
  recordShopProductMedia,
  updateShopProduct,
  updateShopProductContent,
  updateShopVariant,
  updateOrderFulfillment,
  upsertShippingRate,
  upsertShippingZone,
} from "@/lib/data/shop-admin";
import { parseEuroCentsInput } from "@/lib/shop/money";
import {
  isAllowedShopProductMediaType,
  MAX_SHOP_PRODUCT_MEDIA_BYTES,
  type ShopProductMediaMimeType,
} from "@/lib/storage/shop-product-media";

const productInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a URL-safe slug"),
  type: z.enum(["physical", "digital", "service"]),
  visibility: z.enum(["public", "members", "hidden"]),
  purchaseAccess: z.enum(["public", "members"]),
  shortDescription: z.string().trim().max(500),
});

const productUpdateInputSchema = productInputSchema.extend({
  productId: z.string().trim().min(1, "Product is required"),
  status: z.enum(["draft", "active", "archived"]),
  requiresCustomerNotes: z.boolean(),
  customerNotesLabel: z.string().trim().min(1, "Notes label is required").max(120),
  stripeTaxCode: z.string().trim().max(80).optional(),
  taxBehavior: z.enum(["exclusive", "inclusive"]).optional(),
});

const variantInputSchema = z.object({
  productId: z.string().trim().min(1, "Product is required"),
  title: z.string().trim().min(1, "Variant title is required").max(120),
  sku: z.string().trim().max(80).optional(),
  price: z.string().trim().min(1, "Price is required"),
  trackInventory: z.boolean(),
  stockQuantity: z.coerce.number().int().min(0),
  lowStockThreshold: z.coerce.number().int().min(0),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0),
  stripeTaxCode: z.string().trim().max(80).optional(),
  taxBehavior: z.enum(["exclusive", "inclusive"]).optional(),
});

const variantUpdateInputSchema = variantInputSchema.omit({ productId: true }).extend({
  variantId: z.string().trim().min(1, "Variant is required"),
});

const productMediaInputSchema = z.object({
  productId: z.string().trim().min(1, "Product is required"),
  storagePath: z.string().trim().min(1, "Storage path is required"),
  publicUrl: z.string().trim().min(1, "Public URL is required"),
  altText: z.string().trim().max(240).default(""),
  caption: z.string().trim().max(300).default(""),
  mimeType: z.string().refine(isAllowedShopProductMediaType, {
    message: "Product images must be JPEG, PNG, or WebP.",
  }),
  sizeBytes: z.number().int().positive().max(MAX_SHOP_PRODUCT_MEDIA_BYTES),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  isPrimary: z.boolean(),
  sortOrder: z.number().int().min(0),
});

const contentInputSchema = z.object({
  productId: z.string().trim().min(1, "Product is required"),
  richText: z.string().trim().max(8000).optional().default(""),
  bulletTitle: z.string().trim().max(120).optional().default("Highlights"),
  bullets: z.string().trim().max(5000).optional().default(""),
  specs: z.string().trim().max(5000).optional().default(""),
});

const shippingInputSchema = z.object({
  zoneId: z.string().trim().optional(),
  rateId: z.string().trim().optional(),
  name: z.string().trim().min(1, "Zone name is required").max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a URL-safe slug"),
  allowedCountries: z.string().trim().min(2, "Add at least one country code"),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0),
  rateName: z.string().trim().min(1, "Rate name is required").max(120),
  rateDescription: z.string().trim().max(300).optional().default(""),
  ratePrice: z.string().trim().min(1, "Shipping price is required"),
  rateActive: z.boolean(),
  rateTaxBehavior: z.enum(["exclusive", "inclusive"]).optional(),
  rateStripeTaxCode: z.string().trim().max(80).optional(),
});

const httpUrlSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .refine(
    (value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Tracking URL must start with http:// or https://" },
  );

const fulfillmentInputSchema = z.object({
  orderId: z.string().trim().min(1, "Order is required"),
  fulfillmentStatus: z.enum([
    "unfulfilled",
    "in_progress",
    "fulfilled",
    "partially_fulfilled",
    "canceled",
  ]),
  trackingCarrier: z.string().trim().max(120).optional(),
  trackingNumber: z.string().trim().max(120).optional(),
  trackingUrl: httpUrlSchema,
});

export interface ShopAdminFormState {
  errors: Record<string, string[]> | null;
  message: string | null;
  success: boolean;
  productId?: string;
  variantId?: string;
  mediaId?: string;
  orderId?: string;
  resetKey: number;
}

function validationErrors(error: z.ZodError) {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    errors[key] = [...(errors[key] ?? []), issue.message];
  }
  return errors;
}

function revalidateShopAdminPaths() {
  revalidatePath("/admin");
  revalidatePath("/shop");
}

function nextSuccessState(
  previousState: ShopAdminFormState,
  message: string,
  extra?: Pick<
    ShopAdminFormState,
    "productId" | "variantId" | "mediaId" | "orderId"
  >,
): ShopAdminFormState {
  return {
    errors: null,
    message,
    success: true,
    resetKey: previousState.resetKey + 1,
    ...extra,
  };
}

function nextErrorState(
  previousState: ShopAdminFormState,
  message: string,
  errors: Record<string, string[]> | null = null,
): ShopAdminFormState {
  return {
    errors,
    message,
    success: false,
    resetKey: previousState.resetKey,
  };
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function productFormInput(formData: FormData) {
  return {
    title: formString(formData, "title"),
    slug: formString(formData, "slug"),
    type: formString(formData, "type"),
    visibility: formString(formData, "visibility"),
    purchaseAccess: formString(formData, "purchaseAccess"),
    shortDescription: formString(formData, "shortDescription"),
  };
}

function variantFormInput(formData: FormData) {
  return {
    title: formString(formData, "title"),
    sku: formString(formData, "sku") || undefined,
    price: formString(formData, "price"),
    trackInventory: formData.has("trackInventory"),
    stockQuantity: formString(formData, "stockQuantity"),
    lowStockThreshold: formString(formData, "lowStockThreshold"),
    active: formData.has("active"),
    sortOrder: formString(formData, "sortOrder") || "0",
    stripeTaxCode: formString(formData, "stripeTaxCode") || undefined,
    taxBehavior: formString(formData, "taxBehavior") || "exclusive",
  };
}

function contentBlocksFromForm(input: z.infer<typeof contentInputSchema>) {
  const blocks: unknown[] = [];
  if (input.richText) {
    blocks.push({ type: "rich_text", body: input.richText });
  }

  const bulletItems = input.bullets
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (bulletItems.length > 0) {
    blocks.push({
      type: "bullets",
      title: input.bulletTitle || "Highlights",
      items: bulletItems,
    });
  }

  const specsRows = input.specs
    .split(/\r?\n/)
    .map((line) => {
      const [label, ...valueParts] = line.split(":");
      const value = valueParts.join(":").trim();
      return { label: label?.trim() ?? "", value };
    })
    .filter((row) => row.label && row.value);
  if (specsRows.length > 0) {
    blocks.push({ type: "specs", rows: specsRows });
  }

  return blocks;
}

function parseCountryCodes(value: string) {
  return value
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

function parseVariantPrice(
  previousState: ShopAdminFormState,
  price: string,
): { ok: true; priceCents: number } | { ok: false; state: ShopAdminFormState } {
  try {
    return { ok: true, priceCents: parseEuroCentsInput(price) };
  } catch (error) {
    return {
      ok: false,
      state: nextErrorState(previousState, "Check the variant fields.", {
        price: [
          error instanceof Error ? error.message : "Enter a valid EUR price",
        ],
      }),
    };
  }
}

export async function loadShopAdminDataAction() {
  const products = await listAdminShopProducts();
  return { products };
}

export async function loadShopShippingDataAction() {
  const zones = await listAdminShippingZones();
  return { zones };
}

export async function loadShopOrdersAction(input: { status?: string } = {}) {
  const status = input.status === "all" ? "all" : input.status;
  const orders = await listAdminShopOrders({
    status:
      status === "pending" ||
      status === "paid" ||
      status === "canceled" ||
      status === "refunded" ||
      status === "partially_refunded" ||
      status === "all"
        ? status
        : "all",
  });
  return { orders };
}

export async function createShopProductAction(input: unknown) {
  const parsed = productInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      errors: validationErrors(parsed.error),
      message: "Check the product fields.",
    };
  }

  const product = await createShopProduct(parsed.data);
  revalidateShopAdminPaths();

  return { productId: product.id as string, errors: {}, message: "Product created." };
}

export async function createShopProductFormAction(
  previousState: ShopAdminFormState,
  formData: FormData,
): Promise<ShopAdminFormState> {
  const parsed = productInputSchema.safeParse(productFormInput(formData));

  if (!parsed.success) {
    return nextErrorState(
      previousState,
      "Check the product fields.",
      validationErrors(parsed.error),
    );
  }

  try {
    const product = await createShopProduct(parsed.data);
    revalidateShopAdminPaths();
    return nextSuccessState(previousState, "Product created.", {
      productId: product.id as string,
    });
  } catch (error) {
    return nextErrorState(
      previousState,
      error instanceof Error ? error.message : "Failed to create product.",
    );
  }
}

export async function updateShopProductFormAction(
  previousState: ShopAdminFormState,
  formData: FormData,
): Promise<ShopAdminFormState> {
  const parsed = productUpdateInputSchema.safeParse({
    productId: formString(formData, "productId"),
    ...productFormInput(formData),
    status: formString(formData, "status"),
    requiresCustomerNotes: formData.has("requiresCustomerNotes"),
    customerNotesLabel: formString(formData, "customerNotesLabel") || "Order notes",
    stripeTaxCode: formString(formData, "stripeTaxCode") || undefined,
    taxBehavior: formString(formData, "taxBehavior") || "exclusive",
  });

  if (!parsed.success) {
    return nextErrorState(
      previousState,
      "Check the product fields.",
      validationErrors(parsed.error),
    );
  }

  try {
    const product = await updateShopProduct({
      ...parsed.data,
      stripeTaxCode: parsed.data.stripeTaxCode || null,
      taxBehavior: parsed.data.taxBehavior ?? "exclusive",
    });
    revalidateShopAdminPaths();
    return nextSuccessState(previousState, "Product updated.", {
      productId: product.id as string,
    });
  } catch (error) {
    return nextErrorState(
      previousState,
      error instanceof Error ? error.message : "Failed to update product.",
    );
  }
}

export async function createShopVariantFormAction(
  previousState: ShopAdminFormState,
  formData: FormData,
): Promise<ShopAdminFormState> {
  const parsed = variantInputSchema.safeParse({
    productId: formString(formData, "productId"),
    ...variantFormInput(formData),
  });

  if (!parsed.success) {
    return nextErrorState(
      previousState,
      "Check the variant fields.",
      validationErrors(parsed.error),
    );
  }

  const price = parseVariantPrice(previousState, parsed.data.price);
  if (!price.ok) return price.state;

  try {
    const variant = await createShopVariant({
      productId: parsed.data.productId,
      title: parsed.data.title,
      sku: parsed.data.sku || null,
      priceCents: price.priceCents,
      trackInventory: parsed.data.trackInventory,
      stockQuantity: parsed.data.stockQuantity,
      lowStockThreshold: parsed.data.lowStockThreshold,
      active: parsed.data.active,
      sortOrder: parsed.data.sortOrder,
      stripeTaxCode: parsed.data.stripeTaxCode || null,
      taxBehavior: parsed.data.taxBehavior ?? "exclusive",
    });
    revalidateShopAdminPaths();
    return nextSuccessState(previousState, "Variant created.", {
      variantId: variant.id as string,
    });
  } catch (error) {
    return nextErrorState(
      previousState,
      error instanceof Error ? error.message : "Failed to create variant.",
    );
  }
}

export async function updateShopVariantFormAction(
  previousState: ShopAdminFormState,
  formData: FormData,
): Promise<ShopAdminFormState> {
  const parsed = variantUpdateInputSchema.safeParse({
    variantId: formString(formData, "variantId"),
    ...variantFormInput(formData),
  });

  if (!parsed.success) {
    return nextErrorState(
      previousState,
      "Check the variant fields.",
      validationErrors(parsed.error),
    );
  }

  const price = parseVariantPrice(previousState, parsed.data.price);
  if (!price.ok) return price.state;

  try {
    const variant = await updateShopVariant({
      variantId: parsed.data.variantId,
      title: parsed.data.title,
      sku: parsed.data.sku || null,
      priceCents: price.priceCents,
      trackInventory: parsed.data.trackInventory,
      stockQuantity: parsed.data.stockQuantity,
      lowStockThreshold: parsed.data.lowStockThreshold,
      active: parsed.data.active,
      sortOrder: parsed.data.sortOrder,
      stripeTaxCode: parsed.data.stripeTaxCode || null,
      taxBehavior: parsed.data.taxBehavior ?? "exclusive",
    });
    revalidateShopAdminPaths();
    return nextSuccessState(previousState, "Variant updated.", {
      variantId: variant.id as string,
    });
  } catch (error) {
    return nextErrorState(
      previousState,
      error instanceof Error ? error.message : "Failed to update variant.",
    );
  }
}

export async function recordShopProductMediaAction(input: unknown) {
  const parsed = productMediaInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid product media.");
  }

  const media = await recordShopProductMedia({
    productId: parsed.data.productId,
    storagePath: parsed.data.storagePath,
    publicUrl: parsed.data.publicUrl,
    altText: parsed.data.altText,
    caption: parsed.data.caption,
    mimeType: parsed.data.mimeType as ShopProductMediaMimeType,
    sizeBytes: parsed.data.sizeBytes,
    width: parsed.data.width ?? null,
    height: parsed.data.height ?? null,
    isPrimary: parsed.data.isPrimary,
    sortOrder: parsed.data.sortOrder,
  });
  revalidateShopAdminPaths();
  return { mediaId: media.id as string };
}

export async function deleteShopProductMediaAction(mediaId: string) {
  if (!mediaId.trim()) throw new Error("Product media is required.");
  await deleteShopProductMedia(mediaId);
  revalidateShopAdminPaths();
}

export async function updateShopProductContentFormAction(
  previousState: ShopAdminFormState,
  formData: FormData,
): Promise<ShopAdminFormState> {
  const parsed = contentInputSchema.safeParse({
    productId: formString(formData, "productId"),
    richText: formString(formData, "richText"),
    bulletTitle: formString(formData, "bulletTitle") || "Highlights",
    bullets: formString(formData, "bullets"),
    specs: formString(formData, "specs"),
  });

  if (!parsed.success) {
    return nextErrorState(
      previousState,
      "Check the content fields.",
      validationErrors(parsed.error),
    );
  }

  try {
    await updateShopProductContent(
      parsed.data.productId,
      contentBlocksFromForm(parsed.data),
    );
    revalidateShopAdminPaths();
    return nextSuccessState(previousState, "Content updated.", {
      productId: parsed.data.productId,
    });
  } catch (error) {
    return nextErrorState(
      previousState,
      error instanceof Error ? error.message : "Failed to update content.",
    );
  }
}

export async function saveShippingZoneRateFormAction(
  previousState: ShopAdminFormState,
  formData: FormData,
): Promise<ShopAdminFormState> {
  const parsed = shippingInputSchema.safeParse({
    zoneId: formString(formData, "zoneId") || undefined,
    rateId: formString(formData, "rateId") || undefined,
    name: formString(formData, "name"),
    slug: formString(formData, "slug"),
    allowedCountries: formString(formData, "allowedCountries"),
    active: formData.has("active"),
    sortOrder: formString(formData, "sortOrder") || "0",
    rateName: formString(formData, "rateName"),
    rateDescription: formString(formData, "rateDescription"),
    ratePrice: formString(formData, "ratePrice"),
    rateActive: formData.has("rateActive"),
    rateTaxBehavior: formString(formData, "rateTaxBehavior") || "exclusive",
    rateStripeTaxCode: formString(formData, "rateStripeTaxCode") || undefined,
  });

  if (!parsed.success) {
    return nextErrorState(
      previousState,
      "Check the shipping fields.",
      validationErrors(parsed.error),
    );
  }

  let priceCents: number;
  try {
    priceCents = parseEuroCentsInput(parsed.data.ratePrice);
  } catch (error) {
    return nextErrorState(previousState, "Check the shipping fields.", {
      ratePrice: [
        error instanceof Error ? error.message : "Enter a valid EUR price",
      ],
    });
  }

  try {
    const zone = await upsertShippingZone({
      id: parsed.data.zoneId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      allowedCountries: parseCountryCodes(parsed.data.allowedCountries),
      active: parsed.data.active,
      sortOrder: parsed.data.sortOrder,
    });

    await upsertShippingRate({
      id: parsed.data.rateId,
      zoneId: zone.id as string,
      name: parsed.data.rateName,
      description: parsed.data.rateDescription,
      priceCents,
      active: parsed.data.rateActive,
      sortOrder: parsed.data.sortOrder,
      stripeTaxCode: parsed.data.rateStripeTaxCode || null,
      taxBehavior: parsed.data.rateTaxBehavior ?? "exclusive",
    });

    revalidateShopAdminPaths();
    return nextSuccessState(previousState, "Shipping zone saved.");
  } catch (error) {
    return nextErrorState(
      previousState,
      error instanceof Error ? error.message : "Failed to save shipping zone.",
    );
  }
}

export async function updateOrderFulfillmentFormAction(
  previousState: ShopAdminFormState,
  formData: FormData,
): Promise<ShopAdminFormState> {
  const parsed = fulfillmentInputSchema.safeParse({
    orderId: formString(formData, "orderId"),
    fulfillmentStatus: formString(formData, "fulfillmentStatus"),
    trackingCarrier: formString(formData, "trackingCarrier") || undefined,
    trackingNumber: formString(formData, "trackingNumber") || undefined,
    trackingUrl: formString(formData, "trackingUrl") || undefined,
  });

  if (!parsed.success) {
    return nextErrorState(
      previousState,
      "Check the fulfillment fields.",
      validationErrors(parsed.error),
    );
  }

  try {
    await updateOrderFulfillment({
      orderId: parsed.data.orderId,
      fulfillmentStatus: parsed.data.fulfillmentStatus,
      trackingCarrier: parsed.data.trackingCarrier || null,
      trackingNumber: parsed.data.trackingNumber || null,
      trackingUrl: parsed.data.trackingUrl || null,
    });
    revalidatePath("/admin");
    revalidatePath("/profile");
    return nextSuccessState(previousState, "Fulfillment updated.", {
      orderId: parsed.data.orderId,
    });
  } catch (error) {
    return nextErrorState(
      previousState,
      error instanceof Error ? error.message : "Failed to update fulfillment.",
    );
  }
}
