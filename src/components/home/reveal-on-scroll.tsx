"use client";

import { useEffect } from "react";

/**
 * Drives the `.reveal` scroll animation across the homepage. On mount it marks
 * <html> with [data-reveal-root] (so the hidden state in globals.css only kicks
 * in once JS is active — content stays visible without JS and under reduced
 * motion), then reveals each `.reveal` element as its top crosses into the
 * lower part of the viewport.
 *
 * Uses a passive scroll listener + rAF + getBoundingClientRect rather than
 * IntersectionObserver, which proved unreliable for the absolutely-positioned
 * elements inside the desktop canvas. One-shot per element; the page content is
 * static, so a single query on mount catches everything.
 */
export function RevealOnScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    root.setAttribute("data-reveal-root", "");

    let pending = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    let raf = 0;

    const reveal = () => {
      raf = 0;
      // Reveal once the element's top rises into the bottom ~12% of the viewport.
      const trigger = window.innerHeight * 0.88;
      const still: HTMLElement[] = [];
      for (const el of pending) {
        if (el.getBoundingClientRect().top < trigger) {
          el.classList.add("is-visible");
        } else {
          still.push(el);
        }
      }
      pending = still;
      if (pending.length === 0) window.removeEventListener("scroll", onScroll);
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(reveal);
    };

    reveal(); // initial pass — reveals anything already on screen
    if (pending.length) window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      root.removeAttribute("data-reveal-root");
    };
  }, []);

  return null;
}
