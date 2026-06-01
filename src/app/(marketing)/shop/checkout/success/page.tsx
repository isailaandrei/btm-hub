import Link from "next/link";
import { CartClearer } from "@/components/shop/CartClearer";
import { Button } from "@/components/ui/button";

export default async function ShopCheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; mock?: string }>;
}) {
  const { session_id: sessionId, mock } = await searchParams;
  const isMockCheckout = mock === "1";

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <CartClearer />
      <div className="rounded-lg border border-border bg-card p-8">
        <h1 className="text-3xl font-medium text-foreground">Order received</h1>
        <p className="mt-3 text-muted-foreground">
          {isMockCheckout
            ? "Mock Stripe checkout preview completed. No database order, notification, or fulfillment record was created."
            : "Stripe has accepted the checkout. Your order will appear in your profile after the payment webhook finishes processing."}
        </p>
        {sessionId ? (
          <p className="mt-4 break-all rounded-md bg-muted p-3 text-xs text-muted-foreground">
            {isMockCheckout ? "Mock checkout session" : "Checkout session"}: {sessionId}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          {isMockCheckout ? null : (
            <Button asChild>
              <Link href="/profile/orders">View orders</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/shop">Back to shop</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
