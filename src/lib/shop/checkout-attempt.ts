"use client";

import { cartFingerprint } from "./cart-validation";

const CHECKOUT_ATTEMPT_KEY = "btm-shop-checkout-attempt";

function newCheckoutAttemptId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function checkoutAttemptIdForCart(
  lines: Array<{ variantId: string; quantity: number }>,
) {
  const fingerprint = cartFingerprint(lines);
  if (!canUseStorage()) return newCheckoutAttemptId();

  try {
    const raw = window.localStorage.getItem(CHECKOUT_ATTEMPT_KEY);
    const cached = raw
      ? (JSON.parse(raw) as { fingerprint?: string; checkoutAttemptId?: string })
      : null;

    if (cached?.fingerprint === fingerprint && cached.checkoutAttemptId) {
      return cached.checkoutAttemptId;
    }

    const checkoutAttemptId = newCheckoutAttemptId();
    window.localStorage.setItem(
      CHECKOUT_ATTEMPT_KEY,
      JSON.stringify({ fingerprint, checkoutAttemptId }),
    );
    return checkoutAttemptId;
  } catch {
    return newCheckoutAttemptId();
  }
}

export function clearCheckoutAttemptId() {
  if (!canUseStorage()) return;

  try {
    window.localStorage.removeItem(CHECKOUT_ATTEMPT_KEY);
  } catch {
    // Storage failures should not block cart updates or checkout recovery.
  }
}
