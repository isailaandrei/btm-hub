"use client";

import { useState } from "react";
import { OrdersPanel } from "./orders-panel";
import { ProductsPanel } from "./products-panel";
import { ShippingRatesPanel } from "./shipping-rates-panel";

type ShopAdminTab = "products" | "shipping" | "orders";

export function ShopAdmin({ isVisible }: { isVisible: boolean }) {
  const [tab, setTab] = useState<ShopAdminTab>("products");

  if (!isVisible) return null;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-foreground">Shop</h1>
        <p className="text-sm text-muted-foreground">
          Manage catalog products, variants, inventory, and launch visibility.
        </p>
      </div>
      <div className="flex gap-2 border-b border-border pb-3">
        {[
          ["products", "Products"],
          ["shipping", "Shipping"],
          ["orders", "Orders"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            onClick={() => setTab(value as ShopAdminTab)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "products" ? <ProductsPanel /> : null}
      {tab === "shipping" ? <ShippingRatesPanel /> : null}
      {tab === "orders" ? <OrdersPanel /> : null}
    </section>
  );
}
