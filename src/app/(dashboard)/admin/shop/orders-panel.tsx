"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEuroCents } from "@/lib/shop/money";
import type { ShopOrderWithItems } from "@/lib/shop/types";
import type { ShopFulfillmentStatus, ShopOrderStatus } from "@/types/database";
import {
  loadShopOrdersAction,
  type ShopAdminFormState,
  updateOrderFulfillmentFormAction,
} from "./actions";

const initialState: ShopAdminFormState = {
  errors: null,
  message: null,
  success: false,
  resetKey: 0,
};

const ORDER_STATUSES: Array<ShopOrderStatus | "all"> = [
  "all",
  "pending",
  "paid",
  "canceled",
  "refunded",
  "partially_refunded",
];

const FULFILLMENT_STATUSES: ShopFulfillmentStatus[] = [
  "unfulfilled",
  "in_progress",
  "fulfilled",
  "partially_fulfilled",
  "canceled",
];

function inputClassName() {
  return "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary disabled:opacity-60";
}

function FulfillmentForm({
  order,
  onSaved,
}: {
  order: ShopOrderWithItems;
  onSaved: () => Promise<void>;
}) {
  const [state, formAction, isPending] = useActionState(
    updateOrderFulfillmentFormAction,
    initialState,
  );
  const handledResetKeyRef = useRef(0);

  useEffect(() => {
    if (!state.success) return;
    if (state.resetKey === handledResetKeyRef.current) return;
    handledResetKeyRef.current = state.resetKey;
    void onSaved();
  }, [onSaved, state.resetKey, state.success]);

  return (
    <form action={formAction} className="grid gap-3 rounded-lg border border-border p-3">
      <input type="hidden" name="orderId" value={order.id} />
      <div className="grid gap-3 md:grid-cols-[0.8fr_1fr_1fr]">
        <label className="text-sm font-medium">
          Fulfillment
          <select
            name="fulfillmentStatus"
            defaultValue={order.fulfillment_status}
            className={inputClassName()}
            disabled={isPending}
          >
            {FULFILLMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Carrier
          <input
            name="trackingCarrier"
            defaultValue={order.tracking_carrier ?? ""}
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
        <label className="text-sm font-medium">
          Tracking number
          <input
            name="trackingNumber"
            defaultValue={order.tracking_number ?? ""}
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
      </div>
      <label className="text-sm font-medium">
        Tracking URL
        <input
          name="trackingUrl"
          defaultValue={order.tracking_url ?? ""}
          className={inputClassName()}
          disabled={isPending}
        />
      </label>
      <div className="flex items-center justify-between gap-3">
        {state.message ? (
          <p className={`text-sm ${state.success ? "text-primary" : "text-destructive"}`}>
            {state.message}
          </p>
        ) : null}
        <Button type="submit" size="sm" disabled={isPending} className="ml-auto">
          {isPending ? "Saving..." : "Update fulfillment"}
        </Button>
      </div>
    </form>
  );
}

export function OrdersPanel() {
  const [orders, setOrders] = useState<ShopOrderWithItems[]>([]);
  const [status, setStatus] = useState<ShopOrderStatus | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await loadShopOrdersAction({ status });
      setOrders(data.orders);
      setError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load shop orders.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Orders</CardTitle>
            <CardDescription>
              {isLoading
                ? "Loading orders..."
                : `${orders.length} order${orders.length === 1 ? "" : "s"}`}
            </CardDescription>
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ShopOrderStatus | "all")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {ORDER_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {orders.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            No orders yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Items</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{order.order_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleString()}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p>{order.customer_name || order.profile?.display_name || "Customer"}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.customer_email || order.profile?.email || "No email yet"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-2">
                      <Badge variant={order.status === "paid" ? "default" : "outline"}>
                        {order.status.replaceAll("_", " ")}
                      </Badge>
                      <Badge variant="outline">
                        {order.fulfillment_status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>{formatEuroCents(order.total_cents)}</TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      {order.items.map((item) => (
                        <p key={item.id} className="text-sm">
                          {item.quantity}x {item.product_title} · {item.variant_title}
                        </p>
                      ))}
                      <FulfillmentForm order={order} onSaved={loadOrders} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
