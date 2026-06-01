import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function ShopCheckoutCanceledPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const { order_id: orderId } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <div className="rounded-lg border border-border bg-card p-8">
        <h1 className="text-3xl font-medium text-foreground">Checkout canceled</h1>
        <p className="mt-3 text-muted-foreground">
          Your payment was not completed. Your cart is still available so you can
          adjust items or try again.
        </p>
        {orderId ? (
          <p className="mt-4 break-all rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Order reservation: {orderId}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/shop/cart">Return to cart</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/shop">Back to shop</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
