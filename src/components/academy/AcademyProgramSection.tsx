import Image from "next/image";
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import type { SanityImageSource } from "@sanity/image-url";

import { SanityImage } from "@/components/sanity/SanityImage";
import { cn } from "@/lib/utils";

const FLOURISH = "/images/home/flourish.svg";

type AcademyProgramSectionProps = {
  /** 0-based position; drives the alternating photo/text layout + index label. */
  index: number;
  name: string;
  overline: string;
  description: string;
  highlights: string[];
  applyHref: string;
  detailHref: string;
  isOpen: boolean;
  /** Real programme photo from Sanity; falls back to placeholderImage. */
  heroImage?: SanityImageSource | null;
  placeholderImage: string;
};

/**
 * One programme presented as an alternating photo/text block in the homepage's
 * cinematic language — a single image, an enticing pitch, three highlights, and
 * the apply CTA. Even rows put the image left, odd rows mirror it.
 *
 * `.reveal` is safe here: the Academy page renders a fixed set of these at mount
 * (no client-side filtering), so <RevealOnScroll> always picks them up.
 */
export function AcademyProgramSection({
  index,
  name,
  overline,
  description,
  highlights,
  applyHref,
  detailHref,
  isOpen,
  heroImage,
  placeholderImage,
}: AcademyProgramSectionProps) {
  const reverse = index % 2 === 1;
  const number = String(index + 1).padStart(2, "0");

  return (
    <section className="reveal border-t border-white/5 py-16 md:py-24">
      <div className="mx-auto grid max-w-[1420px] items-center gap-10 px-5 sm:px-8 md:grid-cols-2 md:gap-16 lg:px-16">
        {/* Image — the programme's single photo */}
        <div className={cn("relative", reverse ? "md:order-2" : "md:order-1")}>
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
            {heroImage ? (
              <SanityImage
                source={heroImage}
                alt={name}
                fill
                className="object-cover"
                sizes="(min-width: 768px) 50vw, 100vw"
              />
            ) : (
              <Image
                src={placeholderImage}
                alt=""
                aria-hidden
                fill
                className="object-cover"
                sizes="(min-width: 768px) 50vw, 100vw"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#020306]/45 to-transparent" />
            <span className="absolute left-5 top-4 font-display text-sm text-white/70">
              {number}
            </span>
          </div>
        </div>

        {/* Text — the pitch */}
        <div className={cn(reverse ? "md:order-1" : "md:order-2")}>
          <p className="font-display text-xs uppercase tracking-[0.3em] text-white/60">
            {overline}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FLOURISH} alt="" aria-hidden className="my-4 h-3.5 w-5" />
          <h2 className="font-display text-3xl leading-tight text-white sm:text-4xl md:text-5xl">
            {name}
          </h2>
          <p className="mt-5 max-w-xl font-serif text-base leading-relaxed text-white/80">
            {description}
          </p>

          <ul className="mt-6 space-y-2.5">
            {highlights.map((highlight) => (
              <li
                key={highlight}
                className="flex items-start gap-3 font-serif text-sm text-white/75"
              >
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-white/50" />
                {highlight}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            {isOpen ? (
              <Link
                href={applyHref}
                className="inline-flex items-center rounded-full bg-white px-7 py-3 font-display text-sm text-neutral-950 transition-colors hover:bg-white/90"
              >
                Apply
              </Link>
            ) : (
              <span className="inline-flex items-center rounded-full border border-white/20 px-7 py-3 font-display text-sm text-white/50">
                Applications closed
              </span>
            )}
            <Link
              href={detailHref}
              className="rounded-full border border-white/60 px-7 py-3 font-display text-sm text-white transition-colors hover:bg-white/10"
            >
              Learn more
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
