import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { constructShopStripeEvent } from "@/lib/shop/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

function isMockCheckoutPreview(session: Stripe.Checkout.Session) {
  return session.metadata?.mockCheckoutPreview === "1";
}

async function finalizeCheckoutSession(event: Stripe.Event, session: Stripe.Checkout.Session) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc(
    "shop_finalize_paid_order_from_checkout",
    {
      p_event_id: event.id,
      p_session: session,
    },
  );
  if (error) throw new Error(`Failed to finalize paid order: ${error.message}`);
  return data;
}

async function releaseExpiredCheckout(event: Stripe.Event, session: Stripe.Checkout.Session) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc(
    "shop_release_order_for_checkout_session",
    {
      p_event_id: event.id,
      p_stripe_checkout_session_id: session.id,
    },
  );
  if (error) throw new Error(`Failed to release expired checkout: ${error.message}`);
  return data;
}

async function recordRefund(event: Stripe.Event) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc("shop_record_refund_event", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_payload: event.data.object,
  });
  if (error) throw new Error(`Failed to record refund event: ${error.message}`);
  return data;
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = constructShopStripeEvent({ body, signature });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid Stripe webhook." },
      { status: 400 },
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      if (isMockCheckoutPreview(event.data.object as Stripe.Checkout.Session)) {
        return NextResponse.json({
          received: true,
          ignored: "mock_checkout_preview",
        });
      }
      await finalizeCheckoutSession(
        event,
        event.data.object as Stripe.Checkout.Session,
      );
    } else if (event.type === "checkout.session.expired") {
      if (isMockCheckoutPreview(event.data.object as Stripe.Checkout.Session)) {
        return NextResponse.json({
          received: true,
          ignored: "mock_checkout_preview",
        });
      }
      await releaseExpiredCheckout(
        event,
        event.data.object as Stripe.Checkout.Session,
      );
    } else if (
      event.type === "charge.refunded" ||
      event.type === "refund.updated"
    ) {
      await recordRefund(event);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
