import { isUUID } from "@/lib/validation-helpers";

const CONTACT_DETAIL_PATH_RE = /^\/admin\/contacts\/([^/]+)$/;

/**
 * Extract the contact id from a `/admin/contacts/:id` pathname, or `null` for
 * any other path. Returns `null` for non-UUID ids so malformed paths fall
 * through to normal route rendering rather than mounting the detail panel.
 */
export function contactIdFromPathname(pathname: string): string | null {
  const match = CONTACT_DETAIL_PATH_RE.exec(pathname);
  if (!match) return null;
  const id = match[1];
  return isUUID(id) ? id : null;
}
