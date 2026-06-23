"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { IMG_BASE, type FeatureImage } from "./content";

/**
 * Coverflow-style video carousel: the centered card is enlarged and
 * emphasized (full opacity + drop shadow + play button), neighbours are
 * scaled down and dimmed — matching the Figma's large-central / smaller-sides
 * composition, but scrollable for any number of videos.
 */
export function VideoCarousel({ videos, href }: { videos: FeatureImage[]; href?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const cards = useRef<Array<HTMLAnchorElement | null>>([]);
  const middle = Math.floor(videos.length / 2);
  const [active, setActive] = useState(middle);

  const updateActive = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    cards.current.forEach((c, i) => {
      if (!c) return;
      const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setActive(best);
  }, []);

  const centerOn = useCallback((i: number, behavior: ScrollBehavior = "smooth") => {
    const el = scroller.current;
    const c = cards.current[i];
    if (!el || !c) return;
    el.scrollTo({ left: c.offsetLeft + c.offsetWidth / 2 - el.clientWidth / 2, behavior });
  }, []);

  // Start with the middle (featured) video centered. `active` already defaults
  // to `middle`; the resulting scroll fires onScroll, which keeps it in sync.
  useEffect(() => {
    centerOn(middle, "auto");
  }, [centerOn, middle]);

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={() => requestAnimationFrame(updateActive)}
        className="flex snap-x snap-mandatory items-center gap-4 overflow-x-auto scroll-smooth px-[12%] py-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {videos.map((v, i) => {
          const isActive = i === active;
          return (
            <a
              key={i}
              ref={(el) => {
                cards.current[i] = el;
              }}
              href={href ?? "#"}
              target={href ? "_blank" : undefined}
              rel={href ? "noopener noreferrer" : undefined}
              className={cn(
                "group/card relative aspect-video shrink-0 snap-center overflow-hidden rounded-md bg-white/5 transition-all duration-500 ease-out",
                "w-[78%] sm:w-[56%] lg:w-[46%]",
                isActive
                  ? "z-10 scale-100 opacity-100 shadow-[0_0_54px_0_rgba(0,0,0,0.75)]"
                  : "scale-[0.8] opacity-50 hover:opacity-80",
              )}
            >
              <Image
                src={v.src}
                alt={v.alt}
                fill
                sizes="(min-width: 1024px) 46vw, 78vw"
                className="object-cover transition-transform duration-500 group-hover/card:scale-105"
              />
              <span
                className={cn(
                  "absolute inset-0 grid place-items-center transition-opacity duration-500",
                  isActive ? "opacity-100" : "opacity-70",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${IMG_BASE}/play-button.svg`}
                  alt=""
                  aria-hidden
                  className="h-16 w-16 drop-shadow-lg transition-transform duration-300 group-hover/card:scale-110"
                />
              </span>
            </a>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="Previous video"
        onClick={() => centerOn(Math.max(0, active - 1))}
        className="absolute left-4 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/50 p-3 text-white backdrop-blur transition hover:bg-black/80 md:flex"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Next video"
        onClick={() => centerOn(Math.min(videos.length - 1, active + 1))}
        className="absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/50 p-3 text-white backdrop-blur transition hover:bg-black/80 md:flex"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}
