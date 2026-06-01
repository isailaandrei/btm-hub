import type { ShopProductWithVariants } from "@/lib/shop/types";
import { ProductGallery } from "./ProductGallery";
import { ProductPurchasePanel } from "./ProductPurchasePanel";
import { RichContentBlocks } from "./RichContentBlocks";

export function ProductDetail({ product }: { product: ShopProductWithVariants }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-10 md:py-14">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)] lg:items-start">
        <ProductGallery media={product.media} title={product.title} />
        <ProductPurchasePanel product={product} />
      </div>
      <RichContentBlocks blocks={product.content_blocks} />
    </div>
  );
}
