import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveShopCheckoutSession } from "./stripe";

interface SupabaseRpcClient {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

interface SupabaseOrderQueryClient extends SupabaseRpcClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        not: (column: string, operator: string, value: unknown) => {
          lt: (column: string, value: unknown) => {
            order: (
              column: string,
              options: { ascending: boolean },
            ) => {
              limit: (
                count: number,
              ) => PromiseLike<{
                data: ReconcileCheckoutOrder[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  };
}

export interface ReconcileCheckoutOrder {
  id: string;
  stripe_checkout_session_id: string | null;
}

export interface CheckoutReconciliationResult {
  checked: number;
  finalized: number;
  released: number;
  skipped: number;
  failed: number;
}

function isPaidCheckoutSession(session: Stripe.Checkout.Session) {
  return session.payment_status === "paid";
}

function isExpiredCheckoutSession(session: Stripe.Checkout.Session) {
  return session.status === "expired";
}

async function callRpc(
  supabase: SupabaseRpcClient,
  name: string,
  args: Record<string, unknown>,
) {
  const { error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.message}`);
}

export async function reconcileCheckoutOrders(input: {
  supabase: SupabaseRpcClient;
  orders: ReconcileCheckoutOrder[];
  retrieveSession?: (sessionId: string) => Promise<Stripe.Checkout.Session>;
}): Promise<CheckoutReconciliationResult> {
  const retrieveSession = input.retrieveSession ?? retrieveShopCheckoutSession;
  const result: CheckoutReconciliationResult = {
    checked: 0,
    finalized: 0,
    released: 0,
    skipped: 0,
    failed: 0,
  };

  for (const order of input.orders) {
    const sessionId = order.stripe_checkout_session_id;
    if (!sessionId) {
      result.skipped += 1;
      continue;
    }

    result.checked += 1;
    try {
      const session = await retrieveSession(sessionId);

      if (isPaidCheckoutSession(session)) {
        await callRpc(input.supabase, "shop_finalize_paid_order_from_checkout", {
          p_event_id: `reconcile_checkout_completed_${session.id}`,
          p_session: session,
        });
        result.finalized += 1;
      } else if (isExpiredCheckoutSession(session)) {
        await callRpc(input.supabase, "shop_release_order_for_checkout_session", {
          p_event_id: `reconcile_checkout_expired_${session.id}`,
          p_stripe_checkout_session_id: session.id,
        });
        result.released += 1;
      } else {
        result.skipped += 1;
      }
    } catch (error) {
      result.failed += 1;
      console.warn("Failed to reconcile shop checkout session.", {
        orderId: order.id,
        stripeCheckoutSessionId: sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

export async function reconcileStaleCheckoutSessions(input?: {
  limit?: number;
  now?: Date;
}) {
  const supabase = (await createAdminClient()) as unknown as SupabaseOrderQueryClient;
  const limit = input?.limit ?? 25;
  const now = input?.now ?? new Date();

  const { data, error } = await supabase
    .from("shop_orders")
    .select("id, stripe_checkout_session_id")
    .eq("status", "pending")
    .not("stripe_checkout_session_id", "is", null)
    .lt("reservation_expires_at", now.toISOString())
    .order("reservation_expires_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load stale checkout sessions: ${error.message}`);
  }

  return reconcileCheckoutOrders({
    supabase,
    orders: data ?? [],
  });
}
