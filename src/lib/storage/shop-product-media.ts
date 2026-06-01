export const SHOP_PRODUCT_MEDIA_BUCKET = "shop-product-media";
export const MAX_SHOP_PRODUCT_MEDIA_BYTES = 10 * 1024 * 1024;

export const ALLOWED_SHOP_PRODUCT_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ShopProductMediaMimeType =
  (typeof ALLOWED_SHOP_PRODUCT_MEDIA_TYPES)[number];

const ALLOWED_TYPE_SET = new Set<string>(ALLOWED_SHOP_PRODUCT_MEDIA_TYPES);

export function isAllowedShopProductMediaType(
  type: string,
): type is ShopProductMediaMimeType {
  return ALLOWED_TYPE_SET.has(type);
}

export function extensionForShopProductMediaType(type: string): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  throw new Error(`Unsupported shop media type: ${type}`);
}

export function shopProductMediaStoragePath(productId: string, mimeType: string) {
  const ext = extensionForShopProductMediaType(mimeType);
  return `${productId}/${crypto.randomUUID()}.${ext}`;
}

export function storagePathBelongsToShopProduct(
  storagePath: string,
  productId: string,
) {
  return storagePath.startsWith(`${productId}/`) && !storagePath.includes("..");
}

export function getShopProductMediaUploadEndpoint(supabaseUrl: string) {
  const url = new URL(supabaseUrl);
  if (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1"
  ) {
    return `${url.origin}/storage/v1/upload/resumable`;
  }

  const projectRef = url.hostname.replace(".supabase.co", "");
  return `${url.protocol}//${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
}
