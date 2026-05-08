import type { ShopProductWithVariants } from "@/lib/shop/types";
import { ProductGallery } from "./ProductGallery";
import { ProductPurchasePanel } from "./ProductPurchasePanel";
import { RichContentBlocks } from "./RichContentBlocks";

export function ProductDetail({ product }: { product: ShopProductWithVariants }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 md:py-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <ProductGallery media={product.media} title={product.title} />
        <ProductPurchasePanel product={product} />
      </div>
      <RichContentBlocks blocks={product.content_blocks} />
    </div>
  );
}
