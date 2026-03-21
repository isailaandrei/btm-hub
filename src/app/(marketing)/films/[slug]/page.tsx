import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { PortableText } from "@portabletext/react";
import { SanityImage } from "@/components/sanity/SanityImage";
import { portableTextComponents } from "@/lib/sanity/portable-text";
import { getFilmBySlug, getAllFilmSlugs } from "@/lib/data/sanity";

const ALLOWED_EMBED_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "player.vimeo.com",
  "vimeo.com",
];

function isAllowedEmbedUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === "https:" && ALLOWED_EMBED_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

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

  return (
    <div className="min-h-screen bg-muted">
      {/* Hero */}
      <div className="relative aspect-[21/9] w-full overflow-hidden bg-neutral-900">
        <SanityImage
          source={film.heroImage}
          alt={film.heroImage?.alt || film.title || ""}
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/80 to-transparent" />
        <div className="absolute bottom-0 left-0 p-6 md:p-12">
          <h1 className="text-3xl font-bold text-white md:text-5xl">
            {film.title}
          </h1>
          {film.tagline && (
            <p className="mt-2 text-lg text-neutral-200">{film.tagline}</p>
          )}
          <div className="mt-3 flex items-center gap-4 text-sm text-neutral-300">
            {film.releaseYear && <span>{film.releaseYear}</span>}
            {film.duration && <span>{film.duration}</span>}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-5 py-12 md:px-0">
        {/* Video embed */}
        {film.videoEmbed && isAllowedEmbedUrl(film.videoEmbed) && (
          <div className="mb-12 aspect-video overflow-hidden rounded-xl">
            <iframe
              src={film.videoEmbed}
              title={film.title ?? "Video"}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              sandbox="allow-scripts allow-same-origin"
              allowFullScreen
            />
          </div>
        )}

        {/* Description */}
        {film.description && (
          <div className="mb-12">
            <PortableText
              value={film.description}
              components={portableTextComponents}
            />
          </div>
        )}

        {/* Credits */}
        {film.credits && film.credits.length > 0 && (
          <div className="mb-12">
            <h2 className="mb-4 text-2xl font-bold text-foreground">Credits</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {film.credits.map((credit, i) => (
                  <div key={i} className="flex justify-between rounded-lg bg-background p-3">
                    <span className="text-sm font-medium text-foreground">
                      {credit.name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {credit.role}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        {/* Gallery */}
        {film.gallery?.images && film.gallery.images.length > 0 && (
          <div className="mb-12">
            <h2 className="mb-4 text-2xl font-bold text-foreground">Gallery</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {film.gallery.images.map((image, i) => (
                  <div key={i} className="overflow-hidden rounded-lg">
                    <SanityImage
                      source={image}
                      alt={image.alt || ""}
                      width={600}
                      height={400}
                      className="w-full object-cover"
                    />
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        <Link
          href="/films"
          className="text-sm text-primary transition-opacity hover:opacity-75"
        >
          &larr; Back to Films
        </Link>
      </div>
    </div>
  );
}
