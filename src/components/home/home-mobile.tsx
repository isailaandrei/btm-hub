import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { FEATURES, HERO, IMG_BASE, WHAT_WE_DO } from "./content";
import { Parallax } from "./parallax";

/**
 * Mobile / tablet reflow of the homepage (shown below the `xl` breakpoint,
 * where the fixed 1680px desktop canvas would become too small to read).
 * Same content as {@link HomeDesktop}, restructured into a single readable
 * column. This layout is an adaptation — the Figma frame has no mobile design.
 */

function Flourish({ className }: { className?: string }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={`${IMG_BASE}/flourish.svg`} alt="" aria-hidden className={className} width={20} height={18} />
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="font-display text-3xl tracking-wide text-white">{title}</h2>
      <Flourish className="my-4 h-4 w-5" />
      <p className="max-w-md font-serif text-[15px] leading-relaxed text-white/75">{subtitle}</p>
    </div>
  );
}

export function HomeMobile() {
  return (
    <div className="bg-[#020306] text-white xl:hidden">
      {/* ---- Hero ---- */}
      <section className="relative min-h-[100svh] overflow-hidden">
        <Image
          src={`${IMG_BASE}/bg-hero.jpg`}
          alt="Diver in the open ocean"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/25 to-[#020306]" />

        <div className="relative flex min-h-[100svh] flex-col items-center justify-center px-6 text-center">
          {/* Hero copy — scroll parallax: drifts up and fades over the static
              background (static under reduced-motion). */}
          <Parallax speed={0.5} className="flex flex-col items-center">
            <h1 className="font-display text-5xl leading-[1.05] text-white sm:text-6xl">{HERO.headline}</h1>
            <Flourish className="my-6 h-4 w-5" />
            <p className="max-w-sm font-serif text-base leading-relaxed text-white/90">{HERO.intro.join(" ")}</p>
          </Parallax>
        </div>
      </section>

      {/* ---- WHAT WE DO ---- */}
      <section className="reveal px-6 py-16">
        <SectionHeading title={WHAT_WE_DO.title} subtitle={WHAT_WE_DO.subtitle} />
      </section>

      {/* ---- Features ---- */}
      <div className="space-y-20 px-6 pb-20">
        {FEATURES.map((feature) => (
          <section key={feature.id} className="flex flex-col gap-7">
            <div className="reveal">
              <p className="font-serif text-xs uppercase tracking-[0.25em] text-white/50">{feature.overline}</p>
              <h3 className="mt-3 whitespace-pre-line font-display text-3xl leading-[1.1] text-white">
                {feature.title}
              </h3>
              <p className="mt-4 font-serif text-[15px] leading-relaxed text-white/85">{feature.body}</p>
              <p className="mt-3 font-serif text-sm leading-relaxed text-white/50">{feature.lorem}</p>
              <Link
                href={feature.button.href}
                className="mt-7 inline-flex items-center rounded-full border border-white/80 px-7 py-3 font-display text-sm text-white transition-colors hover:bg-white/10"
              >
                {feature.button.label}
              </Link>
            </div>

            <div className="reveal grid grid-cols-2 gap-3">
              {feature.images.map((img, i) => (
                <div
                  key={img.src}
                  className={cn(
                    "relative overflow-hidden rounded-md",
                    i === 0 ? "col-span-2 aspect-[4/3]" : "aspect-square",
                  )}
                >
                    <Image src={img.src} alt={img.alt} fill sizes="100vw" className="object-cover" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
