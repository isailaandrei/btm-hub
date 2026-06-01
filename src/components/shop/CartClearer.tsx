"use client";

import { useEffect } from "react";
import { clearCart } from "@/lib/shop/cart-store";

export function CartClearer() {
  useEffect(() => {
    clearCart();
  }, []);

  return null;
}
