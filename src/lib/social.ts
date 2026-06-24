/**
 * Canonical Behind the Mask social links. Single source of truth shared by the
 * site footer (and anywhere else that links out). Icons are the white monochrome
 * glyphs that previously lived on the homepage hero rail.
 */

export type SocialLink = {
  label: string;
  href: string;
  /** White PNG glyph in /public/images/home. */
  icon: string;
};

export const SOCIAL_LINKS: SocialLink[] = [
  // TODO: replace with the real Behind the Mask Facebook page URL.
  {
    label: "Facebook",
    href: "https://www.facebook.com",
    icon: "/images/home/icon-facebook.png",
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@BehindtheMask",
    icon: "/images/home/icon-youtube.png",
  },
];
