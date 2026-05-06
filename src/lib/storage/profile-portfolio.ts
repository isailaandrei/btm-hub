export const PROFILE_PORTFOLIO_BUCKET = "profile-portfolio";

export const ALLOWED_PORTFOLIO_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type PortfolioImageMimeType =
  (typeof ALLOWED_PORTFOLIO_IMAGE_TYPES)[number];

const ALLOWED_TYPE_SET = new Set<string>(ALLOWED_PORTFOLIO_IMAGE_TYPES);

export function isAllowedPortfolioImageType(
  type: string,
): type is PortfolioImageMimeType {
  return ALLOWED_TYPE_SET.has(type);
}

export function extensionForPortfolioMimeType(type: string): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  throw new Error(`Unsupported portfolio image type: ${type}`);
}

export function portfolioStoragePath(profileId: string, mimeType: string) {
  const ext = extensionForPortfolioMimeType(mimeType);
  return `${profileId}/${crypto.randomUUID()}.${ext}`;
}

export function storagePathBelongsToProfile(
  storagePath: string,
  profileId: string,
) {
  return storagePath.startsWith(`${profileId}/`) && !storagePath.includes("..");
}

export function getProfilePortfolioUploadEndpoint(supabaseUrl: string) {
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
