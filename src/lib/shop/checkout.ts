import { getReservationExpiry } from "./reservations";
import type { CartLineInput, ShopCheckoutOrder } from "./types";
import type { ShopOrderItem } from "@/types/database";

interface SupabaseRpcClient {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

function mapCheckoutOrder(row: Record<string, unknown>): ShopCheckoutOrder {
  return {
    orderId: row.order_id as string,
    orderNumber: row.order_number as string,
    checkoutAttemptId: row.checkout_attempt_id as string,
    reservationExpiresAt:
      row.reservation_expires_at instanceof Date
        ? row.reservation_expires_at.toISOString()
        : String(row.reservation_expires_at),
    stripeCheckoutSessionId: (row.stripe_checkout_session_id as string | null) ?? null,
    stripeCheckoutUrl: (row.stripe_checkout_url as string | null) ?? null,
    subtotalCents: Number(row.subtotal_cents ?? 0),
    requiresShipping: Boolean(row.requires_shipping),
    lineItems: Array.isArray(row.line_items)
      ? (row.line_items as ShopOrderItem[])
      : [],
  };
}

export async function beginShopCheckout(input: {
  supabase: SupabaseRpcClient;
  profileId: string;
  checkoutAttemptId: string;
  lines: CartLineInput[];
  customerNotes?: string;
  now?: Date;
}) {
  const { data, error } = await input.supabase.rpc("shop_begin_checkout", {
    p_profile_id: input.profileId,
    p_checkout_attempt_id: input.checkoutAttemptId,
    p_lines: input.lines,
    p_customer_notes: input.customerNotes ?? "",
    p_reservation_expires_at: getReservationExpiry(input.now).toISOString(),
  });

  if (error) throw new Error(`Failed to reserve checkout: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new Error("Checkout reservation did not return an order.");
  }

  return mapCheckoutOrder(row as Record<string, unknown>);
}

export async function attachShopCheckoutSession(input: {
  supabase: SupabaseRpcClient;
  orderId: string;
  profileId: string;
  checkoutAttemptId: string;
  stripeCheckoutSessionId: string;
  stripeCheckoutUrl: string;
}) {
  const { error } = await input.supabase.rpc("shop_attach_checkout_session", {
    p_order_id: input.orderId,
    p_profile_id: input.profileId,
    p_checkout_attempt_id: input.checkoutAttemptId,
    p_stripe_checkout_session_id: input.stripeCheckoutSessionId,
    p_stripe_checkout_url: input.stripeCheckoutUrl,
  });

  if (error) throw new Error(`Failed to attach checkout session: ${error.message}`);
}

export async function releaseShopOrderReservations(input: {
  supabase: SupabaseRpcClient;
  orderId: string;
}) {
  const { error } = await input.supabase.rpc("shop_release_inventory_reservations", {
    p_order_id: input.orderId,
  });
  if (error) throw new Error(`Failed to release checkout reservation: ${error.message}`);
}
