import { ProductGrid } from "@/components/shop/ProductGrid";
import { getShopProducts } from "@/lib/data/shop-products";

export default async function ShopPage() {
  const products = await getShopProducts();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 md:py-16">
      <div className="mb-8 flex flex-col gap-3">
        <h1 className="text-[length:var(--font-size-h1)] font-medium text-foreground">
          Shop
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Member-focused gear, tools, digital resources, and services from
          Behind The Mask.
        </p>
      </div>
      <ProductGrid products={products} />
    </div>
  );
}
