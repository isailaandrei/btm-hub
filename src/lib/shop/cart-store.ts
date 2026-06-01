"use client";

import { useSyncExternalStore } from "react";
import { normalizeMockShopVariantId } from "./mock-product-ids";
import type { CartLine } from "./types";

const CART_KEY = "btm-shop-cart";

interface CartSnapshot {
  lines: CartLine[];
}

const EMPTY_CART: CartSnapshot = { lines: [] };
const listeners = new Set<() => void>();
let lastRaw: string | null | undefined;
let lastSnapshot: CartSnapshot = EMPTY_CART;

function emitChange() {
  for (const listener of listeners) listener();
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readCart(): CartSnapshot {
  if (!canUseStorage()) return EMPTY_CART;
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (raw === lastRaw) return lastSnapshot;
    lastRaw = raw;
    if (!raw) {
      lastSnapshot = EMPTY_CART;
      return EMPTY_CART;
    }
    const parsed = JSON.parse(raw) as CartSnapshot;
    if (!Array.isArray(parsed.lines)) {
      lastSnapshot = EMPTY_CART;
      return EMPTY_CART;
    }
    lastSnapshot = {
      lines: parsed.lines
        .filter((line) => typeof line.variantId === "string" && line.variantId)
        .map((line) => ({
          ...line,
          variantId: normalizeMockShopVariantId(line.variantId),
          quantity: Math.max(1, Math.min(Number(line.quantity) || 1, 99)),
        })),
    };
    return lastSnapshot;
  } catch {
    lastSnapshot = EMPTY_CART;
    return EMPTY_CART;
  }
}

function writeCart(snapshot: CartSnapshot) {
  if (!canUseStorage()) return;
  const raw = JSON.stringify(snapshot);
  lastRaw = raw;
  lastSnapshot = snapshot;
  window.localStorage.setItem(CART_KEY, raw);
  emitChange();
}

export function getCart() {
  return readCart();
}

export function setCartLines(lines: CartLine[]) {
  writeCart({ lines });
}

export function addCartLine(line: CartLine) {
  const current = readCart();
  const existing = current.lines.find((item) => item.variantId === line.variantId);
  const nextLines = existing
    ? current.lines.map((item) =>
        item.variantId === line.variantId
          ? {
              ...item,
              ...line,
              quantity: Math.min(item.quantity + line.quantity, 99),
            }
          : item,
      )
    : [...current.lines, { ...line, quantity: Math.max(1, line.quantity) }];
  writeCart({ lines: nextLines });
}

export function updateCartLineQuantity(variantId: string, quantity: number) {
  const current = readCart();
  const nextQuantity = Math.max(0, Math.min(Math.floor(quantity), 99));
  const nextLines =
    nextQuantity === 0
      ? current.lines.filter((line) => line.variantId !== variantId)
      : current.lines.map((line) =>
          line.variantId === variantId ? { ...line, quantity: nextQuantity } : line,
        );
  writeCart({ lines: nextLines });
}

export function removeCartLine(variantId: string) {
  const current = readCart();
  writeCart({
    lines: current.lines.filter((line) => line.variantId !== variantId),
  });
}

export function clearCart() {
  writeCart(EMPTY_CART);
}

export function useCart() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      function handleStorage(event: StorageEvent) {
        if (event.key === CART_KEY) listener();
      }
      window.addEventListener("storage", handleStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", handleStorage);
      };
    },
    readCart,
    () => EMPTY_CART,
  );
}
