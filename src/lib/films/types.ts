export type FilmMetadataKey = "locations" | "subjects" | "formats" | "skills";

export type FilmStatus = "published" | "in-production" | "coming-soon";

export type FilmBrowserFilm = {
  _id: string;
  title: string | null;
  slug?: { current?: string | null } | null;
  tagline?: string | null;
  videoEmbed?: string | null;
  posterUrl?: string | null;
  duration?: string | null;
  releaseYear?: number | null;
  status?: FilmStatus | string | null;
  featured?: boolean | null;
  sortOrder?: number | null;
  locations?: string[] | null;
  subjects?: string[] | null;
  formats?: string[] | null;
  skills?: string[] | null;
  displayTags?: string[] | null;
};

export type FilmBrowserCollection = {
  _id: string;
  title: string | null;
  slug?: { current?: string | null } | null;
  description?: string | null;
  sortOrder?: number | null;
  films?: FilmBrowserFilm[] | null;
};

export type FilmFilterState = Record<FilmMetadataKey, string[]>;

export type FilmFilterOptions = Record<FilmMetadataKey, string[]>;

export type FilmRow = {
  id: string;
  title: string;
  description?: string | null;
  films: FilmBrowserFilm[];
};
