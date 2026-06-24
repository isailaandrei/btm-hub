import { createElement } from "react";
import { Share2 } from "lucide-react";
import type {
  BlockGroupItem,
  BlockItem,
  CommandProps,
} from "@maily-to/core/blocks";

/**
 * Social-icon insert block. A single "Social icons row" command drops a Columns
 * row into the footer with the three brand icons aligned to the right of the
 * email — Instagram, YouTube, Facebook, in that order. Each icon is a
 * block `image` (the only node whose link Maily lets you edit): click it and set
 * its "External Link" to your profile. Icons are the committed brand-logo PNGs in
 * public/email/social/. The icons sit on the right because the row leads with a
 * wide empty filler column (Maily columns have no row-level alignment).
 */
const ROW_PLATFORMS: { label: string; iconFile: string; baseUrl: string }[] = [
  { label: "Instagram", iconFile: "instagram.png", baseUrl: "https://instagram.com/" },
  { label: "YouTube", iconFile: "youtube.png", baseUrl: "https://youtube.com/" },
  { label: "Facebook", iconFile: "facebook.png", baseUrl: "https://facebook.com/" },
];

const ICON_DISPLAY_SIZE = 40;
// Each icon column; the rest of the row is one empty filler column that pushes
// the icons to the right. Widths are percentages and sum to 100.
const ICON_COLUMN_WIDTH = 10;
const FILLER_COLUMN_WIDTH = 100 - ROW_PLATFORMS.length * ICON_COLUMN_WIDTH;

/** Absolute origin the email icons are served from. The admin app and the public
 *  site share an origin, so the current origin is correct in dev and prod (and
 *  reachable, unlike a not-yet-deployed canonical URL). */
function iconBaseUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "";
}

function iconImageNode(platform: (typeof ROW_PLATFORMS)[number]) {
  return {
    type: "image",
    attrs: {
      src: `${iconBaseUrl()}/email/social/${platform.iconFile}`,
      alt: platform.label,
      width: ICON_DISPLAY_SIZE,
      height: ICON_DISPLAY_SIZE,
      alignment: "center",
      externalLink: platform.baseUrl,
      isExternalLinkVariable: false,
    },
  };
}

/** A column with a column requires `block+` content; a 1px spacer is the lightest
 *  valid filler. It carries no height — the icon columns set the row height. */
function fillerColumn() {
  return {
    type: "column",
    attrs: { width: FILLER_COLUMN_WIDTH, verticalAlign: "middle" },
    content: [{ type: "spacer", attrs: { height: 1 } }],
  };
}

/** Inserts the three social icons on one line, aligned to the right of the email;
 *  the admin sets each icon's link. */
const socialRowCommand: BlockItem = {
  title: "Social icons row",
  description: "Instagram, YouTube & Facebook, aligned right",
  searchTerms: ["social", "row", "icons", "footer", "line", "instagram", "youtube", "facebook"],
  icon: createElement(Share2, { size: 18 }),
  command: ({ editor, range }: CommandProps) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent({
        type: "columns",
        attrs: { gap: 8 },
        content: [
          fillerColumn(),
          ...ROW_PLATFORMS.map((platform) => ({
            type: "column",
            attrs: { width: ICON_COLUMN_WIDTH, verticalAlign: "middle" },
            content: [iconImageNode(platform)],
          })),
        ],
      })
      .run();
  },
};

export const socialBlockGroup: BlockGroupItem = {
  title: "Social icons",
  commands: [socialRowCommand],
};
