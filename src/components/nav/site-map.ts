export type NavNode = {
  label: string;
  href: string;
  children?: NavNode[];
};

/**
 * Top-level site navigation, shared by the homepage and every marketing
 * subpage through {@link SiteHeader} so the nav is identical everywhere.
 *
 * Flat for now (Academy · Team · Films · Community · Contact). `children` is
 * kept on the type so a section can grow a sub-menu later
 * (e.g. Academy → Experiences → trips) without reworking the menu — the
 * proof-of-concept demonstrated that 3-level layout.
 */
export const SITE_NAV: NavNode[] = [
  { label: "Academy", href: "/academy" },
  { label: "Team", href: "/team" },
  { label: "Films", href: "/films" },
  { label: "Community", href: "/community" },
  { label: "Contact", href: "/contact" },
];
