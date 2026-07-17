import type {
  FilmBrowserCollection,
  FilmBrowserFilm,
  FilmRow,
  FilmRowTitles,
  FilmRowVisibilitySettings,
} from "./types";

const DEFAULT_ROW_VISIBILITY: FilmRowVisibilitySettings = {
  showLatestRow: true,
  showAllVideosRow: true,
};

function sortByReleaseYearDesc(films: FilmBrowserFilm[]): FilmBrowserFilm[] {
  return [...films].sort((a, b) => {
    const yearDelta = (b.releaseYear ?? 0) - (a.releaseYear ?? 0);
    if (yearDelta !== 0) return yearDelta;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

function sortBySortOrder(films: FilmBrowserFilm[]): FilmBrowserFilm[] {
  return [...films].sort((a, b) => {
    const orderDelta = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDelta !== 0) return orderDelta;
    return (b.releaseYear ?? 0) - (a.releaseYear ?? 0);
  });
}

function hasTitle(title: string | null | undefined): title is string {
  return Boolean(title?.trim());
}

export function buildFilmRows(
  films: FilmBrowserFilm[],
  collections: FilmBrowserCollection[],
  visibility: Partial<FilmRowVisibilitySettings> = DEFAULT_ROW_VISIBILITY,
  titles?: FilmRowTitles,
): FilmRow[] {
  const rowVisibility = { ...DEFAULT_ROW_VISIBILITY, ...visibility };
  const visibleFilmIds = new Set(films.map((film) => film._id));
  const curatedRows: FilmRow[] = collections
    .filter((collection) => hasTitle(collection.title))
    .map((collection) => ({
      id: `collection-${collection._id}`,
      title: collection.title!,
      description: collection.description,
      films:
        collection.films?.filter(
          (film): film is FilmBrowserFilm => Boolean(film?._id) && visibleFilmIds.has(film._id),
        ) ?? [],
    }))
    .filter((row) => row.films.length > 0);

  const featured = sortBySortOrder(films.filter((film) => film.featured));
  const latest = sortByReleaseYearDesc(films);
  const all = sortBySortOrder(films);

  return [
    ...curatedRows,
    ...(featured.length > 0
      ? [{ id: "featured", title: titles?.featuredRowTitle ?? null, films: featured }]
      : []),
    ...(rowVisibility.showLatestRow && latest.length > 0
      ? [{ id: "latest", title: titles?.latestRowTitle ?? null, films: latest }]
      : []),
    ...(rowVisibility.showAllVideosRow && all.length > 0
      ? [{ id: "all", title: titles?.allFilmsRowTitle ?? null, films: all }]
      : []),
  ];
}
