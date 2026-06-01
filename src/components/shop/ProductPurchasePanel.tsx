"use client";

import {
  CheckIcon,
  MinusIcon,
  PackageCheckIcon,
  PlusIcon,
  ShieldCheckIcon,
  TruckIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addCartLine } from "@/lib/shop/cart-store";
import { formatEuroCents } from "@/lib/shop/money";
import type { ShopProductWithVariants } from "@/lib/shop/types";
import type { ShopProductVariant } from "@/types/database";

function StockLabel({ variant }: { variant: ShopProductVariant | undefined }) {
  if (!variant) return <span>Catalog preview</span>;

  if (!variant.track_inventory) return <span>Available</span>;

  if (variant.stock_quantity <= 0) return <span>Out of stock</span>;

  if (variant.stock_quantity <= variant.low_stock_threshold) {
    return <span>Low stock: {variant.stock_quantity} left</span>;
  }

  return <span>In stock</span>;
}

export function ProductPurchasePanel({
  product,
}: {
  product: ShopProductWithVariants;
}) {
  const activeVariants = product.variants.filter((variant) => variant.active);
  const [selectedVariantId, setSelectedVariantId] = useState(activeVariants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const selectedVariant = useMemo(
    () =>
      activeVariants.find((variant) => variant.id === selectedVariantId) ??
      activeVariants[0],
    [activeVariants, selectedVariantId],
  );
  const outOfStock =
    selectedVariant?.track_inventory && selectedVariant.stock_quantity <= 0;

  function addSelectedVariantToCart() {
    if (!selectedVariant || outOfStock) return;
    addCartLine({
      variantId: selectedVariant.id,
      quantity,
      productSlug: product.slug,
      productTitle: product.title,
      variantTitle: selectedVariant.title,
      priceCents: selectedVariant.price_cents,
      imageUrl: product.media[0]?.public_url ?? null,
      requiresShipping: product.requires_shipping,
      requiresCustomerNotes: product.requires_customer_notes,
      customerNotesLabel: product.customer_notes_label,
    });
    toast.success("Added to cart.");
  }

  return (
    <div className="space-y-7 lg:sticky lg:top-8">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge>New arrival</Badge>
          <Badge variant="outline" className="capitalize">
            {product.type}
          </Badge>
          {product.purchase_access === "members" ? (
            <Badge>Members only checkout</Badge>
          ) : null}
        </div>
        <h1 className="text-[length:var(--font-size-h1)] font-medium text-foreground">
          {product.title}
        </h1>
        <p className="text-muted-foreground">{product.short_description}</p>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <p className="text-3xl font-medium text-foreground">
            {selectedVariant
              ? formatEuroCents(selectedVariant.price_cents)
              : "Coming soon"}
          </p>
          <p className="pb-1 text-sm text-muted-foreground">
            Taxes calculated at checkout
          </p>
        </div>
      </div>

      {activeVariants.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-foreground">
              Select a variant
            </h2>
            <p className="text-xs text-muted-foreground">
              <StockLabel variant={selectedVariant} />
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {activeVariants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                className={`flex min-h-12 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  variant.id === selectedVariant?.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card hover:border-foreground"
                }`}
                aria-pressed={variant.id === selectedVariant?.id}
                onClick={() => setSelectedVariantId(variant.id)}
              >
                <span className="font-medium">{variant.title}</span>
                {variant.id === selectedVariant?.id ? (
                  <CheckIcon className="size-4" />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Quantity</h2>
        <div className="flex w-fit items-center rounded-full border border-border bg-card p-1">
          <button
            type="button"
            disabled={quantity <= 1}
            aria-label="Decrease quantity"
            className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
            onClick={() => setQuantity((current) => Math.max(1, current - 1))}
          >
            <MinusIcon className="size-4" />
          </button>
          <span className="w-10 text-center text-sm font-medium">{quantity}</span>
          <button
            type="button"
            disabled={quantity >= 99}
            aria-label="Increase quantity"
            className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
            onClick={() => setQuantity((current) => Math.min(99, current + 1))}
          >
            <PlusIcon className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Button
          type="button"
          size="lg"
          disabled={!selectedVariant || outOfStock}
          className="w-full"
          onClick={addSelectedVariantToCart}
        >
          {outOfStock ? "Out of stock" : "Add to cart"}
        </Button>
        <Button asChild type="button" size="lg" variant="outline">
          <Link href="/shop/cart">Cart</Link>
        </Button>
      </div>

      <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
        <div className="flex items-start gap-2">
          <TruckIcon className="mt-0.5 size-4 text-foreground" />
          <span>Flat-rate shipping zones</span>
        </div>
        <div className="flex items-start gap-2">
          <ShieldCheckIcon className="mt-0.5 size-4 text-foreground" />
          <span>EUR checkout with tax</span>
        </div>
        <div className="flex items-start gap-2">
          <PackageCheckIcon className="mt-0.5 size-4 text-foreground" />
          <span>Manual fulfillment</span>
        </div>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        <details open className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-sm font-medium text-foreground">
            Details
            <span className="text-muted-foreground transition-transform group-open:rotate-45">
              <PlusIcon className="size-4" />
            </span>
          </summary>
          <div className="px-4 pb-4 text-sm leading-6 text-muted-foreground">
            {product.short_description}
          </div>
        </details>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-sm font-medium text-foreground">
            Shipping & taxes
            <span className="text-muted-foreground transition-transform group-open:rotate-45">
              <PlusIcon className="size-4" />
            </span>
          </summary>
          <div className="space-y-2 px-4 pb-4 text-sm leading-6 text-muted-foreground">
            <p>Prices are charged in EUR.</p>
            <p>Taxes are calculated at checkout.</p>
            {product.requires_shipping ? (
              <p>Shipping is collected for physical products.</p>
            ) : (
              <p>No shipping address is required for this product type.</p>
            )}
          </div>
        </details>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-sm font-medium text-foreground">
            Fulfillment
            <span className="text-muted-foreground transition-transform group-open:rotate-45">
              <PlusIcon className="size-4" />
            </span>
          </summary>
          <div className="px-4 pb-4 text-sm leading-6 text-muted-foreground">
            Orders are fulfilled manually while checkout and inventory workflows
            are being phased in.
          </div>
        </details>
      </div>
    </div>
  );
}
