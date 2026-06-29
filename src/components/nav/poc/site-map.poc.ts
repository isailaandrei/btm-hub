/**
 * PLACEHOLDER sitemap for the navbar proof-of-concept. Content is illustrative
 * and all hrefs are dead ("#") — the POC only exists to see the 3-level layout
 * (category → sub-section → list, e.g. Academy → Experiences → trips).
 * Throwaway: not wired to real routes. Delete with the rest of the POC.
 */
export type NavNode = {
  label: string;
  href?: string;
  children?: NavNode[];
};

export const SITE_MAP_POC: NavNode[] = [
  {
    label: "Academy",
    children: [
      { label: "Apply + Info", href: "#" },
      {
        label: "Experiences",
        href: "#",
        children: [
          { label: "Maldives", href: "#" },
          { label: "Azores", href: "#" },
          { label: "Bali", href: "#" },
          { label: "Indonesia", href: "#" },
          { label: "Norway", href: "#" },
        ],
      },
      { label: "Mentors", href: "#" },
    ],
  },
  {
    label: "Creative",
    children: [
      { label: "Showreel / Portfolio", href: "#" },
      { label: "Services", href: "#" },
      {
        label: "Industries",
        href: "#",
        children: [
          { label: "Spas & Wellness", href: "#" },
          { label: "Pharmaceutical", href: "#" },
          { label: "Hospitality", href: "#" },
          { label: "Brands & Retail", href: "#" },
        ],
      },
      { label: "Get a quote", href: "#" },
    ],
  },
  {
    label: "Social",
    children: [
      { label: "Overview", href: "#" },
      { label: "Case studies", href: "#" },
      { label: "Work with us", href: "#" },
    ],
  },
  {
    label: "Community",
    children: [
      { label: "Join", href: "#" },
      { label: "Forum", href: "#" },
      { label: "Members", href: "#" },
    ],
  },
  {
    label: "Contact",
    href: "#",
  },
];
