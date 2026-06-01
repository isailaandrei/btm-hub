"use client";

import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cartFingerprint } from "@/lib/shop/cart-validation";
import { formatEuroCents } from "@/lib/shop/money";
import {
  removeCartLine,
  updateCartLineQuantity,
  useCart,
} from "@/lib/shop/cart-store";
import { startShopCheckoutAction } from "@/app/(marketing)/shop/actions";

const CHECKOUT_ATTEMPT_KEY = "btm-shop-checkout-attempt";

const COUNTRY_LABELS: Record<string, string> = {
  AD: "Andorra",
  AE: "United Arab Emirates",
  AL: "Albania",
  AM: "Armenia",
  AR: "Argentina",
  AT: "Austria",
  AU: "Australia",
  BA: "Bosnia and Herzegovina",
  BE: "Belgium",
  BG: "Bulgaria",
  BR: "Brazil",
  CA: "Canada",
  CH: "Switzerland",
  CL: "Chile",
  CN: "China",
  CY: "Cyprus",
  CZ: "Czechia",
  DE: "Germany",
  DK: "Denmark",
  EE: "Estonia",
  ES: "Spain",
  FI: "Finland",
  FR: "France",
  GB: "United Kingdom",
  GR: "Greece",
  HK: "Hong Kong",
  HR: "Croatia",
  HU: "Hungary",
  IE: "Ireland",
  IS: "Iceland",
  IT: "Italy",
  JP: "Japan",
  KR: "South Korea",
  LI: "Liechtenstein",
  LT: "Lithuania",
  LU: "Luxembourg",
  LV: "Latvia",
  MA: "Morocco",
  MC: "Monaco",
  MT: "Malta",
  MX: "Mexico",
  NL: "Netherlands",
  NO: "Norway",
  NZ: "New Zealand",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  RS: "Serbia",
  SE: "Sweden",
  SG: "Singapore",
  SI: "Slovenia",
  SK: "Slovakia",
  TR: "Turkey",
  UA: "Ukraine",
  US: "United States",
  ZA: "South Africa",
};

function newCheckoutAttemptId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function checkoutAttemptIdForCart(lines: Array<{ variantId: string; quantity: number }>) {
  const fingerprint = cartFingerprint(lines);
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

export function CartReview({
  heading = "Cart",
  shippingCountries = [],
}: {
  heading?: string;
  shippingCountries?: string[];
}) {
  const cart = useCart();
  const [shippingCountry, setShippingCountry] = useState(shippingCountries[0] ?? "");
  const [customerNotes, setCustomerNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const subtotal = cart.lines.reduce(
    (sum, line) => sum + (line.priceCents ?? 0) * line.quantity,
    0,
  );
  const requiresShipping = cart.lines.some((line) => line.requiresShipping);
  const requiresNotes = cart.lines.some((line) => line.requiresCustomerNotes);
  const notesLabel =
    cart.lines.find((line) => line.requiresCustomerNotes)?.customerNotesLabel ??
    "Order notes";

  function submitCheckout() {
    setMessage(null);
    startTransition(async () => {
      const result = await startShopCheckoutAction({
        checkoutAttemptId: checkoutAttemptIdForCart(cart.lines),
        lines: cart.lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
        })),
        customerNotes,
        shippingCountry: requiresShipping ? shippingCountry : undefined,
      });

      if (result.success && result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }

      setMessage(result.message ?? "Checkout failed.");
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 md:py-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[length:var(--font-size-h1)] font-medium text-foreground">
            {heading}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Review your items before Stripe checkout.
          </p>
        </div>
        <Link href="/shop" className="text-sm font-medium text-primary hover:underline">
          Continue shopping
        </Link>
      </div>

      {cart.lines.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">Your cart is empty.</p>
          <Button asChild className="mt-4">
            <Link href="/shop">Shop products</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            {cart.lines.map((line) => (
              <div
                key={line.variantId}
                className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-[96px_1fr_auto]"
              >
                <div className="aspect-square overflow-hidden rounded-md bg-muted">
                  {line.imageUrl ? (
                    <Image
                      src={line.imageUrl}
                      alt={line.productTitle ?? "Cart item"}
                      width={96}
                      height={96}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-foreground">
                    {line.productTitle ?? "Shop product"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {line.variantTitle ?? "Variant"}
                  </p>
                  <p className="text-sm text-foreground">
                    {typeof line.priceCents === "number"
                      ? formatEuroCents(line.priceCents)
                      : "Price checked at checkout"}
                  </p>
                </div>
                <div className="flex items-center gap-2 sm:self-start">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Decrease quantity"
                    onClick={() => updateCartLineQuantity(line.variantId, line.quantity - 1)}
                  >
                    <MinusIcon className="size-4" />
                  </Button>
                  <span className="w-8 text-center text-sm font-medium">
                    {line.quantity}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Increase quantity"
                    onClick={() => updateCartLineQuantity(line.variantId, line.quantity + 1)}
                  >
                    <PlusIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remove item"
                    onClick={() => removeCartLine(line.variantId)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <aside className="h-fit space-y-5 rounded-lg border border-border bg-card p-5 lg:sticky lg:top-8">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground">
                {formatEuroCents(subtotal)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Shipping</span>
              <span className="font-medium text-foreground">
                {requiresShipping ? "Calculated next" : "Not required"}
              </span>
            </div>
            <div className="border-t border-border pt-4 text-sm text-muted-foreground">
              Taxes and final shipping are confirmed in Stripe Checkout.
            </div>

            {requiresShipping ? (
              <label className="block text-sm font-medium">
                Shipping country
                <select
                  value={shippingCountry}
                  onChange={(event) => setShippingCountry(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  disabled={shippingCountries.length === 0}
                >
                  {shippingCountries.map((code) => (
                    <option key={code} value={code}>
                      {COUNTRY_LABELS[code] ?? code}
                    </option>
                  ))}
                </select>
                {shippingCountries.length === 0 ? (
                  <span className="mt-1 block text-xs text-destructive">
                    Shipping is not configured yet.
                  </span>
                ) : null}
              </label>
            ) : null}

            {requiresNotes ? (
              <label className="block text-sm font-medium">
                {notesLabel}
                <textarea
                  value={customerNotes}
                  onChange={(event) => setCustomerNotes(event.target.value)}
                  className="mt-1 min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
            ) : (
              <label className="block text-sm font-medium">
                Order notes
                <textarea
                  value={customerNotes}
                  onChange={(event) => setCustomerNotes(event.target.value)}
                  className="mt-1 min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
            )}

            {message ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {message}
              </div>
            ) : null}

            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={isPending || (requiresShipping && shippingCountries.length === 0)}
              onClick={submitCheckout}
            >
              {isPending ? "Starting checkout..." : "Checkout"}
            </Button>
          </aside>
        </div>
      )}
    </div>
  );
}
