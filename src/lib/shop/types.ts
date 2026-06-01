import type {
  Profile,
  ShopOrder,
  ShopOrderEvent,
  ShopOrderItem,
  ShopProduct,
  ShopProductMedia,
  ShopProductVariant,
  ShopShippingRate,
  ShopShippingZone,
} from "@/types/database";

export type ShopViewer = Pick<Profile, "id" | "role"> | null;

export interface ShopProductWithVariants extends ShopProduct {
  variants: ShopProductVariant[];
  media: ShopProductMedia[];
}

export interface ShopShippingZoneWithRates extends ShopShippingZone {
  rates: ShopShippingRate[];
}

export interface ShopOrderWithItems extends ShopOrder {
  items: ShopOrderItem[];
  events: ShopOrderEvent[];
  profile?: Pick<Profile, "id" | "email" | "display_name"> | null;
}

export interface CartLineInput {
  variantId: string;
  quantity: number;
}

export interface CartLine {
  variantId: string;
  quantity: number;
  productSlug?: string;
  productTitle?: string;
  variantTitle?: string;
  priceCents?: number;
  imageUrl?: string | null;
  requiresShipping?: boolean;
  requiresCustomerNotes?: boolean;
  customerNotesLabel?: string;
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
  shippingCountry?: string;
}

export interface ShopCheckoutOrder {
  orderId: string;
  orderNumber: string;
  checkoutAttemptId: string;
  reservationExpiresAt: string;
  stripeCheckoutSessionId: string | null;
  stripeCheckoutUrl: string | null;
  subtotalCents: number;
  requiresShipping: boolean;
  lineItems: ShopOrderItem[];
}
