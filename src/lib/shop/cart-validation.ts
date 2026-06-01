import { z } from "zod/v4";
import { isUUID } from "@/lib/validation-helpers";
import { normalizeMockShopVariantId } from "./mock-product-ids";
import type { CartLineInput } from "./types";

export const MAX_CART_LINES = 20;
export const MAX_CART_LINE_QUANTITY = 99;

const cartLineInputSchema = z.object({
  variantId: z
    .string()
    .trim()
    .min(1, "Variant is required")
    .refine((variantId) => isUUID(normalizeMockShopVariantId(variantId)), {
      message: "Variant must be a valid product variant.",
    }),
  quantity: z.number().int().min(1).max(MAX_CART_LINE_QUANTITY),
});

export const cartCheckoutInputSchema = z.object({
  checkoutAttemptId: z.string().trim().min(8).max(80),
  lines: z.array(cartLineInputSchema).min(1, "Your cart is empty.").max(MAX_CART_LINES),
  customerNotes: z.string().trim().max(2000).optional().default(""),
  shippingCountry: z.string().trim().length(2).optional(),
});

export function normalizeCartLines(lines: CartLineInput[]): CartLineInput[] {
  const merged = new Map<string, number>();

  for (const line of lines) {
    const parsed = cartLineInputSchema.parse(line);
    const variantId = normalizeMockShopVariantId(parsed.variantId);
    merged.set(
      variantId,
      Math.min(
        (merged.get(variantId) ?? 0) + parsed.quantity,
        MAX_CART_LINE_QUANTITY,
      ),
    );
  }

  const normalized = [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([variantId, quantity]) => ({ variantId, quantity }));

  if (normalized.length === 0) throw new Error("Your cart is empty.");
  if (normalized.length > MAX_CART_LINES) {
    throw new Error(`Your cart can contain up to ${MAX_CART_LINES} variants.`);
  }

  return normalized;
}

export function cartFingerprint(lines: CartLineInput[]) {
  return JSON.stringify(normalizeCartLines(lines));
}
