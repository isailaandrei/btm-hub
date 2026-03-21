import Link from "next/link";
import type { Metadata } from "next";
import { SanityImage } from "@/components/sanity/SanityImage";
import { getFilms } from "@/lib/data/sanity";

export const metadata: Metadata = {
  title: "Films — Behind The Mask",
  description: "Explore our underwater film portfolio.",
};

export default async function FilmsPage() {
  const films = await getFilms();

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
    <div className="min-h-screen bg-muted px-5 py-16 md:px-24">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-4 text-center text-[length:var(--font-size-h1)] font-medium text-foreground">
          Films
        </h1>
        <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
          Explore our underwater film portfolio — stories captured beneath the surface.
        </p>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {films.filter((film) => film.slug?.current).map((film) => (
            <Link
              key={film._id}
              href={`/films/${film.slug!.current}`}
              className="group overflow-hidden rounded-xl bg-background shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="relative aspect-video overflow-hidden">
                <SanityImage
                  source={film.heroImage}
                  alt={film.heroImage?.alt || film.title || ""}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                />
              </div>
              <div className="p-5">
                <h2 className="text-lg font-semibold text-foreground">
                  {film.title}
                </h2>
                {film.tagline && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {film.tagline}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  {film.releaseYear && <span>{film.releaseYear}</span>}
                  {film.duration && <span>{film.duration}</span>}
                  {film.status === "in-production" && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                      In Production
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
