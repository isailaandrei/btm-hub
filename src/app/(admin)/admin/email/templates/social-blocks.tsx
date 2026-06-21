import { createElement } from "react";
import {
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Music2,
  Share2,
  Twitter,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import type {
  BlockGroupItem,
  BlockItem,
  CommandProps,
} from "@maily-to/core/blocks";

/**
 * Social-icon insert blocks. The admin designs the footer themselves and drops
 * in social logos — either one at a time, or all on a single line via the
 * "Social icons row" command (a Columns block, so they sit side by side and each
 * link stays editable). Each icon is a block `image` (the only node whose link
 * Maily lets you edit): click it and set its "External Link" to your profile.
 * Icons are the committed brand-logo PNGs in public/email/social/.
 */
const SOCIAL_PLATFORMS: {
  key: string;
  label: string;
  iconFile: string;
  baseUrl: string;
  menuIcon: LucideIcon;
}[] = [
  { key: "instagram", label: "Instagram", iconFile: "instagram.png", baseUrl: "https://instagram.com/", menuIcon: Instagram },
  { key: "facebook", label: "Facebook", iconFile: "facebook.png", baseUrl: "https://facebook.com/", menuIcon: Facebook },
  { key: "youtube", label: "YouTube", iconFile: "youtube.png", baseUrl: "https://youtube.com/", menuIcon: Youtube },
  { key: "tiktok", label: "TikTok", iconFile: "tiktok.png", baseUrl: "https://tiktok.com/", menuIcon: Music2 },
  { key: "x", label: "X (Twitter)", iconFile: "x.png", baseUrl: "https://x.com/", menuIcon: Twitter },
  { key: "linkedin", label: "LinkedIn", iconFile: "linkedin.png", baseUrl: "https://linkedin.com/", menuIcon: Linkedin },
  { key: "website", label: "Website", iconFile: "website.png", baseUrl: "https://", menuIcon: Globe },
];

const ICON_DISPLAY_SIZE = 40;
const COLUMN_WIDTH = Math.round(100 / SOCIAL_PLATFORMS.length);

/** Absolute origin the email icons are served from. The admin app and the public
 *  site share an origin, so the current origin is correct in dev and prod (and
 *  reachable, unlike a not-yet-deployed canonical URL). */
function iconBaseUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "";
}

function iconImageNode(platform: (typeof SOCIAL_PLATFORMS)[number]) {
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

const singleIconCommands: BlockItem[] = SOCIAL_PLATFORMS.map((platform) => ({
  title: platform.label,
  description: `Insert a linked ${platform.label} icon`,
  searchTerms: ["social", "icon", "logo", platform.key, platform.label.toLowerCase()],
  icon: createElement(platform.menuIcon, { size: 18 }),
  command: ({ editor, range }: CommandProps) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent(iconImageNode(platform))
      .run();
  },
}));

/** Inserts every social icon on one line (a Columns row); the admin deletes the
 *  platforms they don't use and sets each link. */
const socialRowCommand: BlockItem = {
  title: "Social icons row",
  description: "All social logos on a single line",
  searchTerms: ["social", "row", "icons", "footer", "line"],
  icon: createElement(Share2, { size: 18 }),
  command: ({ editor, range }: CommandProps) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent({
        type: "columns",
        attrs: { gap: 8 },
        content: SOCIAL_PLATFORMS.map((platform) => ({
          type: "column",
          attrs: { width: COLUMN_WIDTH, verticalAlign: "middle" },
          content: [iconImageNode(platform)],
        })),
      })
      .run();
  },
};

export const socialBlockGroup: BlockGroupItem = {
  title: "Social icons",
  commands: [socialRowCommand, ...singleIconCommands],
};
