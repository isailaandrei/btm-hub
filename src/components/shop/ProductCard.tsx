import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatEuroCents } from "@/lib/shop/money";
import type { ShopProductWithVariants } from "@/lib/shop/types";

export function ProductCard({ product }: { product: ShopProductWithVariants }) {
  const primaryMedia =
    product.media.find((item) => item.is_primary) ?? product.media[0];
  const firstVariant =
    product.variants.find((variant) => variant.active) ?? product.variants[0];

  return (
    <Link href={`/shop/${product.slug}`} className="group block h-full">
      <Card className="h-full overflow-hidden rounded-lg">
        <div className="aspect-[4/5] bg-muted">
          {primaryMedia?.public_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primaryMedia.public_url}
              alt={primaryMedia.alt_text || product.title}
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          ) : null}
        </div>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-medium text-foreground">
              {product.title}
            </h2>
            <Badge variant="outline" className="capitalize">
              {product.type}
            </Badge>
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {product.short_description}
          </p>
          <p className="text-sm font-medium text-foreground">
            {firstVariant
              ? formatEuroCents(firstVariant.price_cents)
              : "Coming soon"}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
