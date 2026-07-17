import Link from "next/link";
import { CheckIcon } from "lucide-react";
import type { SanityImageSource } from "@sanity/image-url";

import { SanityImage } from "@/components/sanity/SanityImage";
import { editAttr } from "@/lib/sanity/data-attribute";
import { cn } from "@/lib/utils";

const FLOURISH = "/images/home/flourish.svg";

type AcademyProgramSectionProps = {
  /** 0-based position; drives the alternating photo/text layout + index label. */
  index: number;
  /** Programme slug — used as the anchor id the hero panels scroll to. */
  slug: string;
  /** Admin-set copy; each renders only when present (cleared → omitted). */
  name?: string | null;
  overline?: string | null;
  description?: string | null;
  /** May be empty — the list renders only when it has entries. */
  highlights: string[];
  applyHref: string;
  detailHref: string;
  isOpen: boolean;
  /** Editable label for the Apply button (site-wide, from academy settings). */
  applyLabel: string;
  /** Real programme photo from Sanity; renders nothing when unset. */
  image?: SanityImageSource | null;
  /** The programme document `_id`, so the photo is click-to-edit in Studio. */
  editId?: string | null;
};

/**
 * One programme presented as an alternating photo/text block in the homepage's
 * cinematic language — a single image, an enticing pitch, three highlights, and
 * the apply CTA. Even rows put the image left, odd rows mirror it.
 *
 * All copy + imagery is Sanity-owned: a cleared field renders nothing. When the
 * photo is cleared the layout collapses to a single full-width text column so
 * the pitch isn't squeezed into half width.
 *
 * `.reveal` is safe here: the Academy page renders a fixed set of these at mount
 * (no client-side filtering), so <RevealOnScroll> always picks them up.
 */
export function AcademyProgramSection({
  index,
  slug,
  name,
  overline,
  description,
  highlights,
  applyHref,
  detailHref,
  isOpen,
  applyLabel,
  image,
  editId,
}: AcademyProgramSectionProps) {
  const reverse = index % 2 === 1;
  const number = String(index + 1).padStart(2, "0");
  const hasImage = Boolean(image);

  return (
    <section
      id={slug}
      className="reveal scroll-mt-24 border-t border-white/5 py-16 md:py-24"
    >
      <div
        className={cn(
          "mx-auto grid max-w-[1420px] items-center gap-10 px-5 sm:px-8 md:gap-16 lg:px-16",
          hasImage && "md:grid-cols-2",
        )}
      >
        {/* Image — the programme's single photo (omitted when unset) */}
        {image && (
          <div className={cn("relative", reverse ? "md:order-2" : "md:order-1")}>
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
              <SanityImage
                source={image}
                alt={name ?? ""}
                fill
                className="object-cover"
                sizes="(min-width: 768px) 50vw, 100vw"
                dataSanity={editAttr(editId, "program", "overviewImage")}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#020306]/45 to-transparent" />
              <span className="pointer-events-none absolute left-5 top-4 font-display text-sm text-white/70">
                {number}
              </span>
            </div>
          </div>
        )}

        {/* Text — the pitch */}
        <div className={cn(hasImage && (reverse ? "md:order-1" : "md:order-2"))}>
          {overline && (
            <p className="font-display text-xs uppercase tracking-[0.3em] text-white/60">
              {overline}
            </p>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FLOURISH} alt="" aria-hidden className="my-4 h-3.5 w-5" />
          {name && (
            <h2 className="font-display text-3xl leading-tight text-white sm:text-4xl md:text-5xl">
              {name}
            </h2>
          )}
          {description && (
            <p className="mt-5 max-w-xl font-serif text-base leading-relaxed text-white/80">
              {description}
            </p>
          )}

          {highlights.length > 0 && (
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
          )}

          <div className="mt-8 flex flex-wrap items-center gap-4">
            {isOpen ? (
              <Link
                href={applyHref}
                className="inline-flex items-center rounded-full bg-white px-7 py-3 font-display text-sm text-neutral-950 transition-colors hover:bg-white/90"
              >
                {applyLabel}
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
