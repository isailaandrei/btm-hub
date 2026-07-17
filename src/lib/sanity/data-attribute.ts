import { createDataAttribute } from "next-sanity";
import { projectId, dataset } from "./env";

/**
 * Builds the `data-sanity` attribute value that makes an element click-to-edit
 * in the Studio Presentation tool: clicking it opens that exact field in the
 * editor (instead of navigating). Needed for images and other non-string fields
 * — strings become editable automatically via stega. The attribute is inert
 * outside the Presentation iframe (nothing reads it in production), so it is
 * safe to render unconditionally.
 *
 * `baseUrl` mirrors the Studio basePath (and the stega `studioUrl` in live.ts).
 *
 * @param id   the document `_id`
 * @param type the document `_type`
 * @param path the field path, e.g. `panelImage` or `gallery.images[_key=="…"]`
 */
export function editAttr(
  id: string | undefined | null,
  type: string,
  path: string,
): string | undefined {
  if (!id) return undefined;
  return createDataAttribute({
    projectId,
    dataset,
    baseUrl: "/studio",
    id,
    type,
    path,
  }).toString();
}
