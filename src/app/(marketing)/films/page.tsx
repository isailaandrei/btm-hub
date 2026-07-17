import type { Metadata } from "next";
import { FilmsBrowser } from "@/components/films/FilmsBrowser";
import {
  getFilmCollections,
  getFilms,
  getFilmsPageSettings,
} from "@/lib/data/sanity";
import {
  filmHeroBackdrop,
  withCollectionFilmPosterUrls,
  withFilmPosterUrls,
} from "@/lib/films/posters";
import { editAttr } from "@/lib/sanity/data-attribute";

export const metadata: Metadata = {
  title: "Films - Behind The Mask",
  description: "Explore our underwater film portfolio.",
};

export default async function FilmsPage() {
  const [rawFilms, rawCollections, settings] = await Promise.all([
    getFilms(),
    getFilmCollections(),
    getFilmsPageSettings(),
  ]);

  const films = rawFilms ? await withFilmPosterUrls(rawFilms) : rawFilms;
  const posterUrlsByFilmId = new Map(
    films?.map((film) => [film._id, film.posterUrl]) ?? [],
  );
  const posterEditAttrsByFilmId = new Map(
    films?.map((film) => [film._id, film.posterEditAttr]) ?? [],
  );
  const collections = rawCollections
    ? withCollectionFilmPosterUrls(
        rawCollections,
        posterUrlsByFilmId,
        posterEditAttrsByFilmId,
      )
    : rawCollections;

  if (!films || films.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#020306] px-5 py-20 text-center text-white">
        <h1 className="mb-4 font-display text-4xl">Films</h1>
        <p className="max-w-md font-serif text-white/70">
          Our film portfolio is coming soon. Check back later.
        </p>
      </div>
    );
  }

  // The hero billboard spotlights the editor-flagged featured film, falling back
  // to the first (most-recent) film so the page always opens cinematically.
  const featuredFilm = films.find((film) => film.featured) ?? films[0];
  // Hero backdrop chain: dedicated hi-res `backdrop` → uploaded `poster` at hero
  // resolution → auto video thumbnail (lowest quality). See filmHeroBackdrop.
  const hero = filmHeroBackdrop(featuredFilm, 2400, 1350);
  const heroEditAttr =
    hero.source === "backdrop"
      ? editAttr(featuredFilm._id, "film", "backdrop")
      : hero.source === "poster"
        ? editAttr(featuredFilm._id, "film", "poster")
        : undefined; // auto video thumbnail — not a Sanity asset, nothing to open

  // `dark` makes the in-page shadcn controls (filter trigger, etc.) resolve dark
  // tokens; the deep #020306 base + white type carry the homepage's vibe.
  return (
    <div className="dark min-h-screen bg-[#020306] text-white">
      <FilmsBrowser
        films={films}
        collections={collections ?? []}
        featuredFilm={featuredFilm}
        heroImageUrl={hero.url}
        heroEditAttr={heroEditAttr}
        heroEyebrow={settings?.heroEyebrow}
        watchButtonLabel={settings?.watchButtonLabel}
        detailsButtonLabel={settings?.detailsButtonLabel}
        catalogueHeading={settings?.catalogueHeading}
        catalogueDescription={settings?.catalogueDescription}
        rowTitles={{
          featuredRowTitle: settings?.featuredRowTitle,
          latestRowTitle: settings?.latestRowTitle,
          allFilmsRowTitle: settings?.allFilmsRowTitle,
        }}
        rowVisibility={{
          showLatestRow: settings?.showLatestRow ?? true,
          showAllVideosRow: settings?.showAllVideosRow ?? true,
        }}
      />
    </div>
  );
}
