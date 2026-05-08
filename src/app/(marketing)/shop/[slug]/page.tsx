import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/shop/ProductDetail";
import { getShopProductBySlug } from "@/lib/data/shop-products";

export default async function ShopProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getShopProductBySlug(slug);

  if (!product) notFound();

  return <ProductDetail product={product} />;
}
