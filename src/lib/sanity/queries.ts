import { defineQuery } from "next-sanity";

// ---------------------------------------------------------------------------
// Films
// ---------------------------------------------------------------------------

const FILM_CARD_FIELDS = `
  _id,
  title,
  slug,
  tagline,
  heroImage,
  thumbnailImage,
  videoEmbed,
  duration,
  releaseYear,
  status,
  featured,
  sortOrder,
  locations,
  subjects,
  formats,
  skills,
  displayTags
`;

export const FILMS_QUERY = defineQuery(`
  *[_type == "film" && defined(slug.current)] | order(sortOrder asc, releaseYear desc) {
    ${FILM_CARD_FIELDS}
  }
`);

export const FILM_BY_SLUG_QUERY = defineQuery(`
  *[_type == "film" && slug.current == $slug][0] {
    _id, title, slug, tagline, description, heroImage, thumbnailImage, videoEmbed,
    gallery, credits, releaseYear, duration, status, featured, sortOrder,
    locations, subjects, formats, skills, displayTags
  }
`);

export const FEATURED_FILMS_QUERY = defineQuery(`
  *[_type == "film" && featured == true && defined(slug.current)] | order(sortOrder asc) {
    ${FILM_CARD_FIELDS}
  }
`);

export const FILM_COLLECTIONS_QUERY = defineQuery(`
  *[_type == "filmCollection" && enabled == true] | order(sortOrder asc) {
    _id,
    title,
    slug,
    description,
    sortOrder,
    films[]->{
      ${FILM_CARD_FIELDS}
    }
  }
`);

export const ALL_FILM_SLUGS_QUERY = defineQuery(`
  *[_type == "film" && defined(slug.current)].slug.current
`);

// ---------------------------------------------------------------------------
// Programs (CMS content to merge with static config)
// ---------------------------------------------------------------------------

export const PROGRAM_BY_SLUG_QUERY = defineQuery(`
  *[_type == "program" && slug == $slug][0] {
    _id, slug, heroImage, heroVideo, fullDescription, highlights,
    curriculum, instructor->{ _id, name, slug, photo, role, title },
    gallery, faqs, testimonials, pricing, seoDescription, applicationOpen
  }
`);

export const ALL_PROGRAMS_CMS_QUERY = defineQuery(`
  *[_type == "program"] {
    _id, slug, heroImage, applicationOpen
  }
`);

// ---------------------------------------------------------------------------
// Team Members
// ---------------------------------------------------------------------------

export const TEAM_MEMBERS_QUERY = defineQuery(`
  *[_type == "teamMember"] | order(sortOrder asc) {
    _id, name, slug, photo, role, title, shortBio, specialties, socialLinks, featured
  }
`);

export const ALL_TEAM_MEMBER_SLUGS_QUERY = defineQuery(`
  *[_type == "teamMember" && defined(slug.current)].slug.current
`);

export const TEAM_MEMBER_BY_SLUG_QUERY = defineQuery(`
  *[_type == "teamMember" && slug.current == $slug][0] {
    _id, name, slug, photo, role, title, shortBio, fullBio, specialties, socialLinks
  }
`);

// ---------------------------------------------------------------------------
// Partners
// ---------------------------------------------------------------------------

export const PARTNERS_QUERY = defineQuery(`
  *[_type == "partner"] | order(sortOrder asc) {
    _id, name, slug, logo, logoDark, description, shortDescription,
    website, memberDiscount, tier, featured
  }
`);

export const FEATURED_PARTNERS_QUERY = defineQuery(`
  *[_type == "partner" && featured == true] | order(sortOrder asc) {
    _id, name, slug, logo, logoDark, shortDescription, website, memberDiscount
  }
`);
