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
  /** Hi-res uploaded-poster URL for the backdrop; falls back to the film thumbnail. */
  heroImageUrl?: string | null
  /** `data-sanity` click-to-edit attribute for whichever field resolved the backdrop. */
  dataSanity?: string
  /** Small caption above the title. Cleared = hidden. */
  eyebrow?: string | null
  /** Play-button label. Defaults to "Watch film" when empty. */
  watchLabel?: string | null
  /** "More details" link label. Defaults to "More details" when empty. */
  detailsLabel?: string | null
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
export function FilmsHero({
  film,
  onPlay,
  heroImageUrl,
  dataSanity,
  eyebrow,
  watchLabel,
  detailsLabel,
}: FilmsHeroProps) {
  const title = film.title ?? "Untitled film"
  const meta = [film.releaseYear, film.duration].filter(Boolean).join("  ·  ")
  const slug = film.slug?.current
  const backdrop = heroImageUrl ?? film.posterUrl

  return (
    <section
      aria-label="Featured film"
      className="relative isolate flex min-h-[68vh] w-full items-end overflow-hidden bg-[#020306] md:min-h-[80vh]"
    >
      {/* Single atmospheric backdrop — the featured film's own still. */}
      <div className="absolute inset-0 -z-10">
        {backdrop ? (
          <Image
            src={backdrop}
            alt=""
            aria-hidden
            fill
            priority
            sizes="100vw"
            className="films-hero-zoom object-cover"
            data-sanity={dataSanity}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-neutral-900 via-slate-900 to-primary/40" />
        )}
        {/* Scrims: a soft overall darken for legibility, a bottom dissolve into
            the catalog base, and a left wash so the copy always reads.
            `pointer-events-none` so a Presentation click reaches the backdrop
            image beneath instead of being swallowed by these overlays. */}
        <div className="pointer-events-none absolute inset-0 bg-black/30" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#020306] via-[#020306]/30 to-[#020306]/70" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#020306]/80 via-[#020306]/20 to-transparent" />
      </div>

      <div className="mx-auto w-full max-w-[1420px] px-5 pb-14 pt-28 sm:px-8 md:pb-20 lg:px-16">
        <div className="max-w-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700">
          {eyebrow && (
            <p className="font-display text-xs uppercase tracking-[0.3em] text-white/70">
              {eyebrow}
            </p>
          )}
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
              {watchLabel || "Watch film"}
            </button>
            {slug && (
              <Link
                href={`/films/${slug}`}
                className="rounded-full border border-white/70 px-7 py-3 font-display text-sm text-white transition-colors hover:bg-white/10"
              >
                {detailsLabel || "More details"}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
