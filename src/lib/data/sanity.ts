import { cache } from "react";
import type { PortableTextBlock } from "@portabletext/react";
import { sanityFetch } from "@/lib/sanity/live";
import { client } from "@/lib/sanity/client";
import {
  FILMS_QUERY,
  FILM_BY_SLUG_QUERY,
  FEATURED_FILMS_QUERY,
  ALL_FILM_SLUGS_QUERY,
  PROGRAM_BY_SLUG_QUERY,
  TEAM_MEMBERS_QUERY,
  TEAM_MEMBER_BY_SLUG_QUERY,
  PARTNERS_QUERY,
  FEATURED_PARTNERS_QUERY,
} from "@/lib/sanity/queries";

// ---------------------------------------------------------------------------
// Sanity result types (until typegen is set up)
// ---------------------------------------------------------------------------

interface SanityImage {
  asset?: unknown;
  alt?: string;
  hotspot?: unknown;
}

interface SanitySlug {
  current: string;
}

interface Gallery {
  images?: Array<SanityImage & { caption?: string }>;
}

export interface FilmSummary {
  _id: string;
  title: string | null;
  slug: SanitySlug | null;
  tagline: string | null;
  heroImage: SanityImage | null;
  duration: string | null;
  releaseYear: number | null;
  status: string | null;
  featured: boolean | null;
}

export interface FilmDetail extends FilmSummary {
  description: PortableTextBlock[] | null;
  videoEmbed: string | null;
  gallery: Gallery | null;
  credits: Array<{ role?: string; name?: string }> | null;
}

export interface ProgramContent {
  _id: string;
  slug: string | null;
  heroImage: SanityImage | null;
  heroVideo: string | null;
  fullDescription: PortableTextBlock[] | null;
  highlights: string[] | null;
  curriculum: PortableTextBlock[] | null;
  instructor: {
    _id: string;
    name: string | null;
    slug: SanitySlug | null;
    photo: SanityImage | null;
    role: string | null;
    title: string | null;
  } | null;
  gallery: Gallery | null;
  faqs: Array<{ question?: string; answer?: PortableTextBlock[] }> | null;
  testimonials: Array<{
    quote?: string;
    authorName?: string;
    authorDetail?: string;
    authorImage?: SanityImage;
  }> | null;
  pricing: PortableTextBlock[] | null;
  seoDescription: string | null;
}

export interface TeamMember {
  _id: string;
  name: string | null;
  slug: SanitySlug | null;
  photo: SanityImage | null;
  role: string | null;
  title: string | null;
  shortBio: string | null;
  fullBio: PortableTextBlock[] | null;
  specialties: string[] | null;
  socialLinks: Array<{ platform?: string; url?: string }> | null;
  featured: boolean | null;
}

export interface Partner {
  _id: string;
  name: string | null;
  slug: SanitySlug | null;
  logo: SanityImage | null;
  logoDark: SanityImage | null;
  description: PortableTextBlock[] | null;
  shortDescription: string | null;
  website: string | null;
  memberDiscount: string | null;
  tier: string | null;
  featured: boolean | null;
}

export interface FeaturedPartner {
  _id: string;
  name: string | null;
  slug: SanitySlug | null;
  logo: SanityImage | null;
  logoDark: SanityImage | null;
  shortDescription: string | null;
  website: string | null;
  memberDiscount: string | null;
}

// ---------------------------------------------------------------------------
// Films
// ---------------------------------------------------------------------------

export const getFilms = cache(async function getFilms() {
  const { data } = await sanityFetch({ query: FILMS_QUERY });
  return data as FilmSummary[];
});

export const getFilmBySlug = cache(async function getFilmBySlug(slug: string) {
  const { data } = await sanityFetch({
    query: FILM_BY_SLUG_QUERY,
    params: { slug },
  });
  return data as FilmDetail | null;
});

export const getFeaturedFilms = cache(async function getFeaturedFilms() {
  const { data } = await sanityFetch({ query: FEATURED_FILMS_QUERY });
  return data as FilmSummary[];
});

/** Uses plain client (not sanityFetch) — safe for generateStaticParams. */
export async function getAllFilmSlugs() {
  return client.fetch<string[]>(ALL_FILM_SLUGS_QUERY);
}

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export const getProgramContent = cache(async function getProgramContent(
  slug: string,
) {
  const { data } = await sanityFetch({
    query: PROGRAM_BY_SLUG_QUERY,
    params: { slug },
  });
  return data as ProgramContent | null;
});

// ---------------------------------------------------------------------------
// Team Members
// ---------------------------------------------------------------------------

export const getTeamMembers = cache(async function getTeamMembers() {
  const { data } = await sanityFetch({ query: TEAM_MEMBERS_QUERY });
  return data as TeamMember[];
});

export const getTeamMemberBySlug = cache(async function getTeamMemberBySlug(
  slug: string,
) {
  const { data } = await sanityFetch({
    query: TEAM_MEMBER_BY_SLUG_QUERY,
    params: { slug },
  });
  return data as TeamMember | null;
});

// ---------------------------------------------------------------------------
// Partners
// ---------------------------------------------------------------------------

export const getPartners = cache(async function getPartners() {
  const { data } = await sanityFetch({ query: PARTNERS_QUERY });
  return data as Partner[];
});

export const getFeaturedPartners = cache(async function getFeaturedPartners() {
  const { data } = await sanityFetch({ query: FEATURED_PARTNERS_QUERY });
  return data as FeaturedPartner[];
});
