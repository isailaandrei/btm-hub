import type { Metadata } from "next";
import { FilmsBrowser } from "@/components/films/FilmsBrowser";
import {
  getFilmCollections,
  getFilms,
  getFilmsPageSettings,
} from "@/lib/data/sanity";
import {
  uploadedPosterImageUrl,
  withCollectionFilmPosterUrls,
  withFilmPosterUrls,
} from "@/lib/films/posters";

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
  const collections = rawCollections
    ? withCollectionFilmPosterUrls(rawCollections, posterUrlsByFilmId)
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
  // Hero backdrop: the featured film's uploaded poster at hero resolution,
  // falling back to its (lower-res) auto video thumbnail.
  const heroImageUrl =
    uploadedPosterImageUrl(featuredFilm.poster, 2400, 1350) ??
    featuredFilm.posterUrl;

  // `dark` makes the in-page shadcn controls (filter trigger, etc.) resolve dark
  // tokens; the deep #020306 base + white type carry the homepage's vibe.
  return (
    <div className="dark min-h-screen bg-[#020306] text-white">
      <FilmsBrowser
        films={films}
        collections={collections ?? []}
        featuredFilm={featuredFilm}
        heroImageUrl={heroImageUrl}
        rowVisibility={{
          showLatestRow: settings?.showLatestRow ?? true,
          showAllVideosRow: settings?.showAllVideosRow ?? true,
        }}
      />
    </div>
  );
}
