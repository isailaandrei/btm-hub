/**
 * Homepage content, transcribed verbatim from the Figma "BTM Draft" frame
 * (node 282:398). Placeholder lorem-ipsum and the design's original labels
 * (e.g. the "Acedemy" nav typo and the reused "ACADEMY" overlines) are kept
 * intentionally to stay faithful to the source. Shared by both the
 * pixel-faithful desktop canvas and the mobile reflow layout.
 */

export const IMG_BASE = "/images/home";

export const NAV_LINKS = [
  { label: "Acedemy", href: "/academy" },
  { label: "Shop", href: "/shop" },
  { label: "Community", href: "/community" },
  { label: "Partners", href: "/partners" },
  { label: "Foundation", href: "/foundation" },
] as const;

export const LOGIN_HREF = "/login";

// TODO: replace with the real Behind the Mask social URLs.
export const YOUTUBE_CHANNEL = "https://www.youtube.com/@BehindtheMask";

export const SOCIAL = {
  // TODO: real Behind the Mask Facebook URL.
  facebook: "https://www.facebook.com",
  youtube: YOUTUBE_CHANNEL,
};

/** YouTube helpers — `i.ytimg.com` is whitelisted in next.config.ts. */
export const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
export const ytWatch = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export const HERO = {
  headline: "LIFE IS AN OCEAN",
  // Line breaks preserved from the design.
  intro: [
    "We share a deep passion for the ocean and all life connected to it.",
    "We travel a lot, mainly for our favorite activity: scuba diving.",
    "We observe, listen and document along the way.",
  ],
};

export const WHAT_WE_DO = {
  title: "WHAT WE DO",
  subtitle:
    "Academy. Community. Shop. We connect people to the ocean through learning, stories, and shared passion.",
};

export type FeatureImage = {
  src: string;
  alt: string;
};

export type Feature = {
  id: string;
  overline: string;
  title: string;
  body: string;
  lorem: string;
  button: { label: string; href: string };
  /** First image is the lead/hero image for the mobile layout. */
  images: FeatureImage[];
};

export const FEATURES: Feature[] = [
  {
    id: "film",
    overline: "ACADEMY",
    title: "Underwater film\n& content",
    body: "We tell underwater stories through films, documentaries, and tutorials. Capturing the magic that happens down there.",
    lorem:
      "Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Donec quam felis, ultricies nec, pellentesque eu, pretium quis, sem. Nulla consequat massa quis enim.",
    button: { label: "Apply now", href: "/films" },
    images: [
      { src: `${IMG_BASE}/film-main.jpg`, alt: "Underwater filming" },
      { src: `${IMG_BASE}/film-2.jpg`, alt: "Diver with camera" },
      { src: `${IMG_BASE}/film-3.jpg`, alt: "Ocean scene" },
      { src: `${IMG_BASE}/film-4.jpg`, alt: "Underwater content" },
    ],
  },
  {
    id: "travel",
    overline: "EXPLORE",
    title: "Travel & Expeditions",
    body: "Dive into the unknown with our curated group expeditions to premier underwater destinations around the world.",
    lorem:
      "Donec pede justo, fringilla vel, aliquet nec, vulputate eget, arcu. In enim justo, rhoncus ut, imperdiet a, venenatis vitae, justo.",
    button: { label: "Get on board", href: "/academy" },
    images: [
      { src: `${IMG_BASE}/travel-1.jpg`, alt: "Expedition divers" },
      { src: `${IMG_BASE}/travel-2.jpg`, alt: "Diver descending" },
      { src: `${IMG_BASE}/travel-3.jpg`, alt: "Ocean expedition" },
    ],
  },
  {
    id: "community",
    overline: "ACADEMY",
    title: "Community Hub",
    body: "Connect with fellow ocean enthusiasts in forums, share trip reports, discuss gear, and learn from each other.",
    lorem:
      "Integer tincidunt. Cras dapibus. Vivamus elementum semper nisi. Aenean vulputate eleifend tellus. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim.",
    button: { label: "Connect now", href: "/community" },
    images: [
      { src: `${IMG_BASE}/community-1.jpg`, alt: "Community divers" },
      { src: `${IMG_BASE}/community-2.jpg`, alt: "Diver portrait" },
      { src: `${IMG_BASE}/community-3.jpg`, alt: "Group of divers" },
    ],
  },
  {
    id: "shop",
    overline: "EXPLORE",
    title: "Shop & Merch",
    body: "Gear up with Behind the Mask merchandise, digital products, and curated gear guides from our team.",
    lorem:
      "Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Donec quam felis, ultricies nec, pellentesque eu, pretium quis, sem. Nulla consequat massa quis enim.",
    button: { label: "Browse shop", href: "/shop" },
    images: [
      { src: `${IMG_BASE}/shop-1.jpg`, alt: "Shop lifestyle" },
      { src: `${IMG_BASE}/shop-2.jpg`, alt: "Diver merch" },
      { src: `${IMG_BASE}/shop-3.jpg`, alt: "Gear detail" },
    ],
  },
];

export const STATS = [
  { value: "60K", label: "community members" },
  { value: "30", label: "expeditions planned" },
  { value: "500", label: "Divers worldwide" },
  { value: "10", label: "years of ocean stories" },
] as const;

export type VideoItem = { id: string; title: string };

export const VIDEOS = {
  title: "ENJOY OUR VIDEOS",
  subtitle:
    "Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean massa.",
  button: { label: "More films", href: "/films" },
  // Real Behind the Mask videos. The middle item is the emphasized centre card.
  items: [
    { id: "8v-kApucQSk", title: "Liquid Blue — Freediving the Maldives with Scuba Spa Yang" },
    { id: "OzzuXOLTk_o", title: "Maybe You Will — Diving with SAVU in South Alor" },
    { id: "VSE5n53sFi0", title: "We Need More Ocean Ambassadors — BTM Academy Maldives with ScubaSpa" },
  ] satisfies VideoItem[],
};
