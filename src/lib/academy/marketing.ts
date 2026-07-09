import type { ProgramSlug } from "@/types/database";

/**
 * Marketing copy for the public Academy page — distinct from the structural
 * {@link PROGRAMS} definitions (slugs, application state). Kept here so the
 * enticing wording is easy for an editor to tweak without touching layout.
 *
 * Two images per programme, both from the dedicated "BTM Academy Maldives 2025"
 * shoot in `/public/images/academy`. Both are now the *local fallbacks* behind
 * admin-editable Sanity images (see `src/lib/academy/images.ts`); the shipped
 * files below display until an admin uploads a photo in Studio:
 *  - `panelImage`   — fallback for the four-panel hero tile. Sanity
 *    `program.panelImage` wins when set.
 *  - `placeholderImage` — fallback for the deep-dive/overview blocks (both the
 *    Academy listing and the programme detail page). Sanity
 *    `program.overviewImage` wins; on the listing, legacy `program.heroImage`
 *    is the second choice before this local file.
 */
export type ProgramMarketing = {
  /** Small kicker above the programme name. */
  overline: string;
  /** Short hook shown under the programme name on its hero panel (3–5 words). */
  tag: string;
  /** Enticing lead paragraph (longer than the card shortDescription). */
  description: string;
  /** Three short "what you'll get" highlights. */
  highlights: string[];
  /** Local fallback for the four-panel hero tile (Sanity `panelImage` wins). */
  panelImage: string;
  /** Local fallback for the deep-dive/overview blocks (Sanity `overviewImage`,
   *  then legacy `heroImage` on the listing, win first). */
  placeholderImage: string;
};

export const PROGRAM_MARKETING: Record<ProgramSlug, ProgramMarketing> = {
  photography: {
    overline: "Mentorship programme",
    tag: "Shoot beneath the surface",
    description:
      "Learn to capture life beneath the surface with a working underwater photographer at your side — not a one-size-fits-all course, but training shaped around the images you want to make.",
    highlights: [
      "One-to-one mentorship with working pros",
      "Underwater lighting, composition & editing",
      "Leave with a publish-ready portfolio",
    ],
    panelImage: "/images/academy/photography.jpg",
    placeholderImage: "/images/academy/photography-wide.jpg",
  },
  filmmaking: {
    overline: "Mentorship programme",
    tag: "Tell the ocean's stories",
    description:
      "Tell stories the ocean deserves — from your first housed camera to a finished, festival-ready short. You'll learn the craft of underwater cinematography and the dive skills that make it possible.",
    highlights: [
      "Camera, housing & underwater dive-craft",
      "Story, cinematography & sound",
      "Edit and finish your own short film",
    ],
    panelImage: "/images/academy/filmmaking.jpg",
    placeholderImage: "/images/academy/filmmaking-wide.jpg",
  },
  freediving: {
    overline: "Training & creative coaching",
    tag: "Perform on a single breath",
    description:
      "Develop the breath-hold and the presence to perform on a single breath. Structured, safety-first training meets creative coaching, so you move, pose and stay calm far below the surface.",
    highlights: [
      "Progressive, coach-led breath-hold training",
      "Movement & modelling on one breath",
      "Safety-first, always supervised",
    ],
    panelImage: "/images/academy/freediving.jpg",
    placeholderImage: "/images/academy/freediving-wide.jpg",
  },
  internship: {
    overline: "Hands-on apprenticeship",
    tag: "Live and work with us",
    description:
      "Live and work alongside the Behind the Mask team. An extended, hands-on apprenticeship across every discipline — the deepest way to learn how we create, on real productions.",
    highlights: [
      "Contribute to real productions",
      "Rotate across film, photo & freediving",
      "Mentored by the whole team",
    ],
    panelImage: "/images/academy/internship.jpg",
    placeholderImage: "/images/academy/internship-wide.jpg",
  },
};
