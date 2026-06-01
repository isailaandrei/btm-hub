"use client";

import { useEffect } from "react";
import { clearCheckoutAttemptId } from "@/lib/shop/checkout-attempt";
import { clearCart } from "@/lib/shop/cart-store";

export function CartClearer() {
  useEffect(() => {
    clearCart();
    clearCheckoutAttemptId();
  }, []);

  return null;
}
