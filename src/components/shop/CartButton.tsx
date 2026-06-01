"use client";

import { ShoppingBagIcon } from "lucide-react";
import Link from "next/link";
import { useCart } from "@/lib/shop/cart-store";

export function CartButton({ variant = "dark" }: { variant?: "light" | "dark" }) {
  const cart = useCart();
  const count = cart.lines.reduce((sum, line) => sum + line.quantity, 0);
  const isLight = variant === "light";

  return (
    <Link
      href="/shop/cart"
      className={`relative inline-flex size-9 items-center justify-center rounded-full border transition-colors ${
        isLight
          ? "border-border text-foreground hover:border-primary"
          : "border-white/20 text-white hover:border-white"
      }`}
      aria-label={count > 0 ? `Cart with ${count} items` : "Cart"}
    >
      <ShoppingBagIcon className="size-4" />
      {count > 0 ? (
        <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-medium text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
