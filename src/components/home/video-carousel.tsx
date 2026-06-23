"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { IMG_BASE } from "./content";

export type CarouselVideo = { src: string; href: string; alt: string };

/**
 * Coverflow video carousel matching the Figma: the centered card is enlarged,
 * lifted with a shadow, and OVERLAPS its neighbours (which sit behind, scaled
 * down and dimmed). Scrollable / swipeable; arrows on desktop. Each card opens
 * its own YouTube video.
 */
export function VideoCarousel({ videos }: { videos: CarouselVideo[] }) {
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

  // Open on the featured (middle) video.
  useEffect(() => {
    centerOn(middle, "auto");
  }, [centerOn, middle]);

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={() => requestAnimationFrame(updateActive)}
        className="flex snap-x snap-mandatory items-center overflow-x-auto scroll-smooth px-[16%] py-10 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {videos.map((v, i) => {
          const isActive = i === active;
          return (
            <a
              key={v.href}
              ref={(el) => {
                cards.current[i] = el;
              }}
              href={v.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={v.alt}
              className={cn(
                "group/card relative -mx-[4%] aspect-video shrink-0 snap-center overflow-hidden rounded-md bg-black/40 transition-all duration-500 ease-out",
                "w-[64%] sm:w-[50%] lg:w-[44%]",
                isActive
                  ? "z-20 scale-[1.06] opacity-100 shadow-[0_0_60px_6px_rgba(0,0,0,0.85)]"
                  : "z-0 scale-[0.78] opacity-60",
              )}
            >
              <Image
                src={v.src}
                alt={v.alt}
                fill
                sizes="(min-width: 1024px) 46vw, 64vw"
                className="object-cover transition-transform duration-500 group-hover/card:scale-105"
              />
              <span
                className={cn(
                  "absolute inset-0 grid place-items-center transition-opacity duration-500",
                  isActive ? "opacity-100" : "opacity-0",
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
        className="absolute left-4 top-1/2 z-30 hidden -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/50 p-3 text-white backdrop-blur transition hover:bg-black/80 md:flex"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Next video"
        onClick={() => centerOn(Math.min(videos.length - 1, active + 1))}
        className="absolute right-4 top-1/2 z-30 hidden -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/50 p-3 text-white backdrop-blur transition hover:bg-black/80 md:flex"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}
