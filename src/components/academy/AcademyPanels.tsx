import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SanityImageSource } from "@sanity/image-url";

import { SanityImage } from "@/components/sanity/SanityImage";
import { editAttr } from "@/lib/sanity/data-attribute";

export type AcademyPanel = {
  slug: string;
  /** Admin-set programme name; renders nothing when cleared. */
  name?: string | null;
  /** Short hook shown under the name; renders nothing when cleared. */
  tag?: string | null;
  /** Admin-set portrait photo from Sanity; renders nothing when unset. */
  image?: SanityImageSource | null;
  /** The programme document `_id`, so the photo is click-to-edit in Studio. */
  editId?: string | null;
  /** Link to the programme's dedicated page. */
  href: string;
  /** Drives the subtle "Now enrolling" marker. */
  isOpen: boolean;
};

/**
 * The Academy hero: the four programmes *are* the hero. A slim brand caption
 * sits above four full-height panels — one photo per programme — so a visitor
 * sees every path at a glance. Each panel links to that programme's dedicated
 * page; scrolling past the hero reveals the deep-dive preview sections.
 *
 * All copy + imagery is Sanity-owned: the eyebrow, heading, per-panel name/tag
 * and photo each render only when set, so a cleared field disappears from the
 * live page (a photo-less panel shows the dark #020306 base — the four tiles
 * stay because the programmes are fixed).
 *
 * Server component: all motion is CSS `group-hover` (image drift, scrim lift,
 * arrow nudge), so there is no client JS and nothing to hydrate. On mobile the
 * panels fall into a 2×2 grid so all four still fit in roughly one screen; from
 * `md` up they become four columns filling the viewport height.
 *
 * The 1px dividers are the grid's `gap-px` over a `bg-white/10` container —
 * each panel's photo covers everything but the seams.
 */
export function AcademyPanels({
  panels,
  eyebrow,
  heading,
}: {
  panels: AcademyPanel[];
  eyebrow?: string | null;
  heading?: string | null;
}) {
  return (
    <section className="relative flex min-h-[100svh] flex-col bg-[#020306]">
      {(eyebrow || heading) && (
        <div className="mx-auto w-full max-w-[1420px] px-5 pb-7 pt-24 text-center sm:px-8 md:pt-28 lg:px-16">
          {eyebrow && (
            <p className="font-display text-xs uppercase tracking-[0.3em] text-white/60">
              {eyebrow}
            </p>
          )}
          {heading && (
            <h1 className="mx-auto mt-3 max-w-2xl font-display text-2xl leading-[1.1] text-white sm:text-3xl md:text-4xl">
              {heading}
            </h1>
          )}
        </div>
      )}

      <div className="grid flex-1 grid-cols-2 gap-px bg-white/10 md:grid-cols-4">
        {panels.map((panel, index) => (
          <Link
            key={panel.slug}
            href={panel.href}
            className="group relative isolate flex min-h-[42vh] items-end overflow-hidden bg-[#020306] md:min-h-0"
          >
            {panel.image && (
              <SanityImage
                source={panel.image}
                alt=""
                fill
                sizes="(min-width: 768px) 25vw, 50vw"
                className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                dataSanity={editAttr(panel.editId, "program", "panelImage")}
              />
            )}
            {/* legibility scrim + a wash that lifts on hover. `pointer-events-none`
                so a click reaches the photo beneath — both for the Link's
                navigation and the Studio Presentation image edit overlay. */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#020306] via-[#020306]/25 to-transparent" />
            <div className="pointer-events-none absolute inset-0 bg-[#020306]/20 transition-colors duration-500 group-hover:bg-transparent" />

            <div className="relative z-10 w-full p-5 pb-[11vh] md:p-7 md:pb-[12vh]">
              <span className="font-display text-xs tracking-widest text-white/50">
                {String(index + 1).padStart(2, "0")}
              </span>
              {panel.name && (
                <h2 className="mt-1.5 font-display text-xl leading-tight text-white sm:text-2xl">
                  {panel.name}
                </h2>
              )}
              {panel.tag && (
                <p className="mt-1 font-serif text-sm text-white/70">
                  {panel.tag}
                </p>
              )}
              <span className="mt-4 inline-flex items-center gap-1.5 font-display text-xs uppercase tracking-[0.2em] text-white/85">
                Explore
                <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
              {panel.isOpen && (
                <span className="mt-3 flex items-center gap-1.5 font-display text-[0.65rem] uppercase tracking-[0.2em] text-white/55">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  Now enrolling
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
