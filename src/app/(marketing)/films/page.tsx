import type { Metadata } from "next";
import { FilmsBrowser } from "@/components/films/FilmsBrowser";
import {
  getFilmCollections,
  getFilms,
  getFilmsPageSettings,
} from "@/lib/data/sanity";
import {
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-5 py-20">
        <h1 className="mb-4 text-[length:var(--font-size-h1)] font-medium text-foreground">
          Films
        </h1>
        <p className="max-w-md text-center text-muted-foreground">
          Our film portfolio is coming soon. Check back later.
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-muted px-5 py-16 md:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl space-y-12">
        <header className="mx-auto max-w-3xl text-center">
          <h1 className="text-[length:var(--font-size-h1)] font-medium text-foreground">
            Stories captured beneath the surface
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Explore our underwater film portfolio through expeditions,
            conservation stories, behind-the-scenes craft, and field tutorials.
          </p>
        </header>

        <FilmsBrowser
          films={films}
          collections={collections ?? []}
          rowVisibility={{
            showLatestRow: settings?.showLatestRow ?? true,
            showAllVideosRow: settings?.showAllVideosRow ?? true,
          }}
        />
      </div>
    </main>
  );
}
