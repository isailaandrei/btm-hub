import type { ShopProductWithVariants } from "@/lib/shop/types";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ products }: { products: ShopProductWithVariants[] }) {
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No shop products are available right now.
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
