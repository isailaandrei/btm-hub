import Image from "next/image";
import Link from "next/link";

/** Shared brand assets (also used by the homepage). */
const FLOURISH = "/images/home/flourish.svg";
const HERO_IMAGE = "/images/home/bg-hero.jpg";

/**
 * Cinematic, photography-forward banner for the Academy page. One atmospheric
 * ocean still dissolved into the #020306 base (the homepage hero treatment),
 * with a single scroll CTA into the programmes. Reduced-motion-safe: the slow
 * `films-hero-zoom` drift is held still under `prefers-reduced-motion` (see
 * globals.css), and the copy entrance uses `motion-safe:` only.
 *
 * The background is a placeholder ocean shot for now; swap in a dedicated
 * academy hero image once the asset library lands.
 */
export function AcademyHero() {
  return (
    <section className="relative isolate flex min-h-[78vh] w-full items-end overflow-hidden bg-[#020306] md:min-h-[88vh]">
      <div className="absolute inset-0 -z-10">
        <Image
          src={HERO_IMAGE}
          alt=""
          aria-hidden
          fill
          priority
          sizes="100vw"
          className="films-hero-zoom object-cover"
        />
        <div className="absolute inset-0 bg-black/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#020306] via-[#020306]/30 to-[#020306]/65" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#020306]/75 via-[#020306]/15 to-transparent" />
      </div>

      <div className="mx-auto w-full max-w-[1420px] px-5 pb-16 pt-28 sm:px-8 md:pb-24 lg:px-16">
        <div className="max-w-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700">
          <p className="font-display text-xs uppercase tracking-[0.3em] text-white/70">
            Behind the Mask Academy
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FLOURISH} alt="" aria-hidden className="my-4 h-3.5 w-5" />
          <h1 className="font-display text-4xl leading-[1.05] text-white sm:text-5xl md:text-6xl">
            Learn to create beneath the surface
          </h1>
          <p className="mt-5 max-w-xl font-serif text-base leading-relaxed text-white/80 sm:text-lg">
            Mentorship-based programmes in underwater photography, film,
            freediving and more — built around your goals, taught by people who
            live in the water.
          </p>
          <div className="mt-8">
            <Link
              href="#programmes"
              className="inline-flex items-center rounded-full bg-white px-7 py-3 font-display text-sm text-neutral-950 transition-colors hover:bg-white/90"
            >
              Explore the programmes
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
