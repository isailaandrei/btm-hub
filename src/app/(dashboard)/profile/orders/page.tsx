import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMyShopOrders } from "@/lib/data/shop-orders";
import { formatEuroCents } from "@/lib/shop/money";

export default async function ProfileOrdersPage() {
  const orders = await getMyShopOrders();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-foreground">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Shop order history, payment status, and fulfillment updates.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 p-8">
          <p className="text-sm text-muted-foreground">No shop orders yet.</p>
          <Button asChild className="mt-4">
            <Link href="/shop">Visit shop</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <article key={order.id} className="rounded-lg border border-border p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-medium text-foreground">
                    {order.order_number}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={order.status === "paid" ? "default" : "outline"}>
                    {order.status.replaceAll("_", " ")}
                  </Badge>
                  <Badge variant="outline">
                    {order.fulfillment_status.replaceAll("_", " ")}
                  </Badge>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>
                      {item.quantity}x {item.product_title} · {item.variant_title}
                    </span>
                    <span>{formatEuroCents(item.line_subtotal_cents)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-medium text-foreground">
                  {formatEuroCents(order.total_cents)}
                </span>
              </div>

              {order.tracking_url || order.tracking_number ? (
                <div className="mt-4 rounded-md bg-muted p-3 text-sm">
                  <p className="font-medium text-foreground">Tracking</p>
                  <p className="text-muted-foreground">
                    {[order.tracking_carrier, order.tracking_number]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                  {order.tracking_url ? (
                    <Link
                      href={order.tracking_url}
                      className="text-primary hover:underline"
                    >
                      Open tracking
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
