import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { PortableText } from "@portabletext/react";
import { portableTextComponents } from "@/lib/sanity/portable-text";
import { getFilmBySlug, getAllFilmSlugs } from "@/lib/data/sanity";
import { getFilmEmbedState } from "@/lib/films/embed";
import { resolveFilmCredit } from "@/lib/films/credits";

export async function generateStaticParams() {
  const slugs = await getAllFilmSlugs();
  return (slugs ?? []).map((slug: string) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const film = await getFilmBySlug(slug);
  if (!film) return {};
  return {
    title: `${film.title} — Behind The Mask`,
    description: film.tagline ?? undefined,
  };
}

export default async function FilmPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const film = await getFilmBySlug(slug);
  if (!film) return notFound();
  const embedState = getFilmEmbedState(film.videoEmbed);

  return (
    <main className="min-h-screen bg-muted">
      <section className="bg-neutral-950 px-5 py-8 text-white md:px-8 md:py-12">
        <div className="mx-auto max-w-6xl">
          <div className="aspect-video overflow-hidden rounded-xl bg-neutral-900">
            {embedState.status === "available" ? (
              <iframe
                src={embedState.url}
                title={film.title ?? "Video"}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                sandbox="allow-scripts allow-same-origin allow-presentation"
                allowFullScreen
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-neutral-950 px-6 text-center text-sm text-neutral-300">
                {embedState.status === "missing"
                  ? "Video unavailable. Add a video embed URL in Sanity."
                  : "Video unavailable. Check the film embed URL in Sanity."}
              </div>
            )}
          </div>

          <div className="mt-6 max-w-4xl">
            <h1 className="text-3xl font-bold md:text-5xl">{film.title}</h1>
            {film.tagline && (
              <p className="mt-3 text-lg text-neutral-200">{film.tagline}</p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-300">
              {film.releaseYear && <span>{film.releaseYear}</span>}
              {film.duration && <span>{film.duration}</span>}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-5 py-12 md:px-0">
        <section className="mb-12" aria-labelledby="film-about-heading">
          <h2
            id="film-about-heading"
            className="mb-4 text-2xl font-bold text-foreground"
          >
            About
          </h2>
          {film.description ? (
            <PortableText
              value={film.description}
              components={portableTextComponents}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No about copy configured in Sanity.
            </p>
          )}
        </section>

        <section className="mb-12" aria-labelledby="film-credits-heading">
          <h2
            id="film-credits-heading"
            className="mb-4 text-2xl font-bold text-foreground"
          >
            Credits
          </h2>
          {film.credits && film.credits.length > 0 ? (
            <div className="divide-y divide-border rounded-lg border border-border bg-background">
              {film.credits.map((credit, i) => {
                const resolved = resolveFilmCredit(credit);
                const name = resolved.href ? (
                  resolved.href.startsWith("/") ? (
                    <Link
                      href={resolved.href}
                      className="font-medium text-foreground transition-opacity hover:opacity-75"
                    >
                      {resolved.name}
                    </Link>
                  ) : (
                    <a
                      href={resolved.href}
                      className="font-medium text-foreground transition-opacity hover:opacity-75"
                      target={
                        resolved.href.startsWith("http") ? "_blank" : undefined
                      }
                      rel={
                        resolved.href.startsWith("http")
                          ? "noopener noreferrer"
                          : undefined
                      }
                    >
                      {resolved.name}
                    </a>
                  )
                ) : (
                  <span className="font-medium text-foreground">
                    {resolved.name}
                  </span>
                );

                return (
                  <div
                    key={`${resolved.role}-${resolved.name}-${i}`}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div>
                      <div className="text-sm">{name}</div>
                      {resolved.externalLinks.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                          {resolved.externalLinks.map((link) => (
                            <a
                              key={`${link.label}-${link.url}`}
                              href={link.url}
                              target={
                                link.url.startsWith("http")
                                  ? "_blank"
                                  : undefined
                              }
                              rel={
                                link.url.startsWith("http")
                                  ? "noopener noreferrer"
                                  : undefined
                              }
                              className="text-xs text-primary transition-opacity hover:opacity-75"
                            >
                              {link.label}
                            </a>
                          ))}
                        </div>
                      )}
                      {resolved.invalidLinkCount > 0 && (
                        <p className="mt-2 text-xs text-destructive">
                          {resolved.invalidLinkCount} credit link unavailable.
                        </p>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {resolved.role}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No credits configured in Sanity.
            </p>
          )}
        </section>

        <Link
          href="/films"
          className="text-sm text-primary transition-opacity hover:opacity-75"
        >
          &larr; Back to Films
        </Link>
      </div>
    </main>
  );
}
