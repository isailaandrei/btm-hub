import type {
  FilmBrowserFilm,
  FilmFilterOptions,
  FilmFilterState,
  FilmMetadataKey,
} from "./types";

export const FILM_METADATA_KEYS: FilmMetadataKey[] = [
  "locations",
  "subjects",
  "formats",
  "skills",
];

export function createEmptyFilmFilters(): FilmFilterState {
  return {
    locations: [],
    subjects: [],
    formats: [],
    skills: [],
  };
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanMetadataValue(value: string): string | null {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : null;
}

function valuesFor(film: FilmBrowserFilm, key: FilmMetadataKey): string[] {
  const values = film[key] ?? [];
  const seen = new Set<string>();
  const cleanedValues: string[] = [];

  for (const value of values) {
    if (!value) continue;
    const cleaned = cleanMetadataValue(value);
    if (!cleaned) continue;
    const normalized = normalizeText(cleaned);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    cleanedValues.push(cleaned);
  }

  return cleanedValues;
}

function searchableValues(film: FilmBrowserFilm): string[] {
  return [
    film.title,
    film.tagline,
    film.duration,
    film.releaseYear ? String(film.releaseYear) : null,
    ...(film.displayTags ?? []),
    ...FILM_METADATA_KEYS.flatMap((key) => valuesFor(film, key)),
  ].filter((value): value is string => Boolean(value?.trim()));
}

export function buildFilmFilterOptions(films: FilmBrowserFilm[]): FilmFilterOptions {
  return FILM_METADATA_KEYS.reduce((options, key) => {
    const byNormalized = new Map<string, string>();
    for (const value of films.flatMap((film) => valuesFor(film, key))) {
      byNormalized.set(normalizeText(value), value);
    }
    options[key] = Array.from(byNormalized.values()).sort((a, b) => a.localeCompare(b));
    return options;
  }, createEmptyFilmFilters());
}

export function countActiveFilmFilters(filters: FilmFilterState): number {
  return FILM_METADATA_KEYS.reduce((count, key) => count + filters[key].length, 0);
}

export function toggleFilmFilter(
  filters: FilmFilterState,
  key: FilmMetadataKey,
  value: string,
): FilmFilterState {
  const selected = new Set(filters[key]);
  if (selected.has(value)) {
    selected.delete(value);
  } else {
    selected.add(value);
  }

  return {
    ...filters,
    [key]: Array.from(selected),
  };
}

function filmMatchesSearch(film: FilmBrowserFilm, search: string): boolean {
  const query = normalizeText(search);
  if (!query) return true;

  return searchableValues(film).some((value) => normalizeText(value).includes(query));
}

function filmMatchesFilters(film: FilmBrowserFilm, filters: FilmFilterState): boolean {
  return FILM_METADATA_KEYS.every((key) => {
    const selected = filters[key];
    if (selected.length === 0) return true;
    const filmValues = new Set(valuesFor(film, key).map(normalizeText));
    return selected.some((value) => filmValues.has(normalizeText(value)));
  });
}

export function filterFilms(
  films: FilmBrowserFilm[],
  search: string,
  filters: FilmFilterState,
): FilmBrowserFilm[] {
  return films.filter((film) => filmMatchesSearch(film, search) && filmMatchesFilters(film, filters));
}
