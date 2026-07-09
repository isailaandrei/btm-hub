import { cache } from "react";
import { sanityFetch } from "@/lib/sanity/live";
import { client } from "@/lib/sanity/client";
import {
  FILMS_QUERY,
  FILM_BY_SLUG_QUERY,
  FEATURED_FILMS_QUERY,
  FILM_COLLECTIONS_QUERY,
  FILMS_PAGE_SETTINGS_QUERY,
  ALL_FILM_SLUGS_QUERY,
  PROGRAM_BY_SLUG_QUERY,
  ALL_PROGRAMS_CMS_QUERY,
  ACADEMY_PAGE_SETTINGS_QUERY,
  TEAM_MEMBERS_QUERY,
  TEAM_MEMBER_BY_SLUG_QUERY,
  ALL_TEAM_MEMBER_SLUGS_QUERY,
  PARTNERS_QUERY,
  FEATURED_PARTNERS_QUERY,
  HOMEPAGE_VIDEOS_QUERY,
} from "@/lib/sanity/queries";
import type {
  FILMS_QUERY_RESULT,
  FILM_BY_SLUG_QUERY_RESULT,
  FEATURED_FILMS_QUERY_RESULT,
  FILM_COLLECTIONS_QUERY_RESULT,
  FILMS_PAGE_SETTINGS_QUERY_RESULT,
  PROGRAM_BY_SLUG_QUERY_RESULT,
  ALL_PROGRAMS_CMS_QUERY_RESULT,
  ACADEMY_PAGE_SETTINGS_QUERY_RESULT,
  TEAM_MEMBERS_QUERY_RESULT,
  TEAM_MEMBER_BY_SLUG_QUERY_RESULT,
  PARTNERS_QUERY_RESULT,
  FEATURED_PARTNERS_QUERY_RESULT,
} from "@/../sanity.types";

// Re-export generated types for use by pages
export type FilmSummary = FILMS_QUERY_RESULT[number];
export type FilmDetail = FILM_BY_SLUG_QUERY_RESULT;
export type FeaturedFilm = FEATURED_FILMS_QUERY_RESULT[number];
export type FilmCollection = FILM_COLLECTIONS_QUERY_RESULT[number];
export type FilmsPageSettings = FILMS_PAGE_SETTINGS_QUERY_RESULT;
export type ProgramContent = PROGRAM_BY_SLUG_QUERY_RESULT;
export type ProgramCmsSummary = ALL_PROGRAMS_CMS_QUERY_RESULT[number];
export type AcademyPageSettings = ACADEMY_PAGE_SETTINGS_QUERY_RESULT;
export type TeamMember = TEAM_MEMBERS_QUERY_RESULT[number];
export type TeamMemberDetail = TEAM_MEMBER_BY_SLUG_QUERY_RESULT;
export type Partner = PARTNERS_QUERY_RESULT[number];
export type FeaturedPartner = FEATURED_PARTNERS_QUERY_RESULT[number];

// ---------------------------------------------------------------------------
// Films
// ---------------------------------------------------------------------------

export const getFilms = cache(async function getFilms() {
  const { data } = await sanityFetch({ query: FILMS_QUERY });
  return data;
});

export const getFilmBySlug = cache(async function getFilmBySlug(slug: string) {
  const { data } = await sanityFetch({
    query: FILM_BY_SLUG_QUERY,
    params: { slug },
  });
  return data;
});

export const getFeaturedFilms = cache(async function getFeaturedFilms() {
  const { data } = await sanityFetch({ query: FEATURED_FILMS_QUERY });
  return data;
});

export const getFilmCollections = cache(async function getFilmCollections() {
  const { data } = await sanityFetch({ query: FILM_COLLECTIONS_QUERY });
  return data;
});

export const getFilmsPageSettings = cache(async function getFilmsPageSettings() {
  const { data } = await sanityFetch({ query: FILMS_PAGE_SETTINGS_QUERY });
  return data;
});

// ---------------------------------------------------------------------------
// Homepage
// ---------------------------------------------------------------------------

export type HomepageVideo = { _id: string; title: string; youtubeId: string };

/**
 * Homepage carousel videos, owner-managed in Sanity. Resilient: on any fetch
 * error (or when none are configured) it returns [], so the homepage falls back
 * to its bundled list instead of crashing.
 */
export const getHomepageVideos = cache(async function getHomepageVideos() {
  try {
    return await client.fetch<HomepageVideo[]>(HOMEPAGE_VIDEOS_QUERY);
  } catch (error) {
    console.warn(
      "Failed to load homepage videos from Sanity; using the bundled fallback.",
      error,
    );
    return [] as HomepageVideo[];
  }
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
  return data;
});

export const getAllProgramsCms = cache(async function getAllProgramsCms() {
  const { data } = await sanityFetch({ query: ALL_PROGRAMS_CMS_QUERY });
  return data;
});

export const getAcademyPageSettings = cache(
  async function getAcademyPageSettings() {
    const { data } = await sanityFetch({ query: ACADEMY_PAGE_SETTINGS_QUERY });
    return data;
  },
);

// ---------------------------------------------------------------------------
// Team Members
// ---------------------------------------------------------------------------

export const getTeamMembers = cache(async function getTeamMembers() {
  const { data } = await sanityFetch({ query: TEAM_MEMBERS_QUERY });
  return data;
});

/** Uses plain client (not sanityFetch) — safe for generateStaticParams. */
export async function getAllTeamMemberSlugs() {
  return client.fetch<string[]>(ALL_TEAM_MEMBER_SLUGS_QUERY);
}

export const getTeamMemberBySlug = cache(async function getTeamMemberBySlug(
  slug: string,
) {
  const { data } = await sanityFetch({
    query: TEAM_MEMBER_BY_SLUG_QUERY,
    params: { slug },
  });
  return data;
});

// ---------------------------------------------------------------------------
// Partners
// ---------------------------------------------------------------------------

export const getPartners = cache(async function getPartners() {
  const { data } = await sanityFetch({ query: PARTNERS_QUERY });
  return data;
});

export const getFeaturedPartners = cache(async function getFeaturedPartners() {
  const { data } = await sanityFetch({ query: FEATURED_PARTNERS_QUERY });
  return data;
});
