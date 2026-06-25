"use client"

import Image from "next/image"
import Link from "next/link"
import { PlayIcon } from "lucide-react"

import type { FilmBrowserFilm } from "@/lib/films/types"

/** Shared brand ornament (also used by the homepage section headers). */
const FLOURISH = "/images/home/flourish.svg"

type FilmsHeroProps = {
  film: FilmBrowserFilm
  /** Opens the shared playback modal owned by <FilmsBrowser>. */
  onPlay: () => void
}

/**
 * Cinematic billboard at the top of the Films page — and the page's ONLY
 * decorative image. It renders the featured film's own still as a single
 * full-bleed backdrop, darkened and dissolved into the #020306 base so it sets a
 * calm, atmospheric mood (the homepage manta/whale treatment) rather than the
 * busy multi-image collages of the homepage feature sections.
 *
 * Motion is reduced-motion-safe: a slow Ken-Burns drift on the image (gated by a
 * `prefers-reduced-motion` media query in globals.css) and a gentle fade/rise on
 * the copy via `motion-safe:` utilities — both fully static for users who ask
 * for reduced motion.
 */
export function FilmsHero({ film, onPlay }: FilmsHeroProps) {
  const title = film.title ?? "Untitled film"
  const meta = [film.releaseYear, film.duration].filter(Boolean).join("  ·  ")
  const slug = film.slug?.current

  return (
    <section
      aria-label="Featured film"
      className="relative isolate flex min-h-[68vh] w-full items-end overflow-hidden bg-[#020306] md:min-h-[80vh]"
    >
      {/* Single atmospheric backdrop — the featured film's own still. */}
      <div className="absolute inset-0 -z-10">
        {film.posterUrl ? (
          <Image
            src={film.posterUrl}
            alt=""
            aria-hidden
            fill
            priority
            sizes="100vw"
            className="films-hero-zoom object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-neutral-900 via-slate-900 to-primary/40" />
        )}
        {/* Scrims: a soft overall darken for legibility, a bottom dissolve into
            the catalog base, and a left wash so the copy always reads. */}
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#020306] via-[#020306]/30 to-[#020306]/70" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#020306]/80 via-[#020306]/20 to-transparent" />
      </div>

      <div className="mx-auto w-full max-w-[1420px] px-5 pb-14 pt-28 sm:px-8 md:pb-20 lg:px-16">
        <div className="max-w-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700">
          <p className="font-display text-xs uppercase tracking-[0.3em] text-white/70">
            Featured film
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FLOURISH} alt="" aria-hidden className="my-4 h-3.5 w-5" />
          <h2 className="font-display text-4xl leading-[1.05] text-white sm:text-5xl md:text-6xl">
            {title}
          </h2>
          {film.tagline && (
            <p className="mt-4 max-w-xl font-serif text-base leading-relaxed text-white/80 sm:text-lg">
              {film.tagline}
            </p>
          )}
          {meta && (
            <p className="mt-3 font-display text-sm text-white/60">{meta}</p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onPlay}
              className="inline-flex items-center gap-2.5 rounded-full bg-white px-7 py-3 font-display text-sm text-neutral-950 transition-colors hover:bg-white/90"
            >
              <PlayIcon className="size-4 fill-current" />
              Watch film
            </button>
            {slug && (
              <Link
                href={`/films/${slug}`}
                className="rounded-full border border-white/70 px-7 py-3 font-display text-sm text-white transition-colors hover:bg-white/10"
              >
                More details
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
