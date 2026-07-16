import type { SanityImageSource } from "@sanity/image-url";

/**
 * Resolvers that map a CMS `program` document (nullable) to the Sanity image
 * for each Academy image slot. Each returns the CMS image or `null`; a `null`
 * result means the slot renders nothing (the Academy pages are fully CMS-driven,
 * with no local fallbacks).
 *
 * Slot mapping (single source of truth):
 *  - Listing panel grid    → panelImage
 *  - Listing deep-dive     → overviewImage, then legacy heroImage
 *  - Detail-page hero      → heroImage
 *  - Detail-page overview  → overviewImage (deliberately NOT heroImage)
 */

/**
 * The image fields these resolvers read, kept structural so both projections
 * satisfy it: the list projection (`ProgramCmsSummary`) and the by-slug
 * projection (`ProgramContent`).
 */
type ProgramImageFields = {
  heroImage?: SanityImageSource | null;
  panelImage?: SanityImageSource | null;
  overviewImage?: SanityImageSource | null;
};

type Cms = ProgramImageFields | null | undefined;

/** Academy grid tile (the four-panel hero). */
export function panelImage(cms: Cms): SanityImageSource | null {
  return cms?.panelImage ?? null;
}

/**
 * Listing deep-dive block. Prefers the dedicated overview photo, falling back
 * to the legacy `heroImage` so documents that only set `heroImage` do not
 * regress to the local placeholder.
 */
export function deepDiveImage(cms: Cms): SanityImageSource | null {
  return cms?.overviewImage ?? cms?.heroImage ?? null;
}

/** Detail-page hero. */
export function detailHeroImage(cms: Cms): SanityImageSource | null {
  return cms?.heroImage ?? null;
}

/**
 * Detail-page overview block. Deliberately NOT `heroImage`: the hero photo
 * already dominates the same page, so reusing it here would duplicate it.
 */
export function detailOverviewImage(cms: Cms): SanityImageSource | null {
  return cms?.overviewImage ?? null;
}
