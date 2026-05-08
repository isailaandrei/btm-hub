import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEuroCents } from "@/lib/shop/money";
import type { ShopProductWithVariants } from "@/lib/shop/types";

export function ProductPurchasePanel({
  product,
}: {
  product: ShopProductWithVariants;
}) {
  const activeVariants = product.variants.filter((variant) => variant.active);
  const firstVariant = activeVariants[0];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
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
        <p className="text-2xl font-medium text-foreground">
          {firstVariant ? formatEuroCents(firstVariant.price_cents) : "Coming soon"}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Prices are charged in EUR. Taxes are calculated at checkout.
      </div>

      <Button type="button" disabled className="w-full">
        Cart coming in next phase
      </Button>
    </div>
  );
}
