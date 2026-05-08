import type {
  Profile,
  ShopProduct,
  ShopProductMedia,
  ShopProductVariant,
} from "@/types/database";

export type ShopViewer = Pick<Profile, "id" | "role"> | null;

export interface ShopProductWithVariants extends ShopProduct {
  variants: ShopProductVariant[];
  media: ShopProductMedia[];
}

export interface CartLineInput {
  variantId: string;
  quantity: number;
}

export interface ValidatedCartLine {
  product: ShopProduct;
  variant: ShopProductVariant;
  quantity: number;
  lineSubtotalCents: number;
}

export interface CartValidationResult {
  lines: ValidatedCartLine[];
  subtotalCents: number;
  requiresShipping: boolean;
  customerNotesRequired: boolean;
}

export interface StartShopCheckoutInput {
  checkoutAttemptId: string;
  lines: CartLineInput[];
  customerNotes?: string;
}
