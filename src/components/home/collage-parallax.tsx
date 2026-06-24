"use client";

import { useEffect } from "react";

/**
 * Continuous, reversible parallax for the feature collage photos. Each tagged
 * `[data-parallax]` layer pans within its (overflow-hidden) frame as the frame
 * passes through the viewport, so the photos drift at different rates and read
 * as layered depth — unlike the one-shot reveal on the surrounding text.
 *
 * The offset is a fraction of the frame's own height, so larger photos drift
 * more than small ones (the "different rates"). It stays below the image's
 * `scale-[1.18]` over-scale buffer (~9%), so the pan never exposes a frame edge.
 *
 * Imperative (writes transforms straight to the DOM in a rAF, no React
 * re-renders); a no-op under prefers-reduced-motion.
 */

// Max pan as a fraction of frame height. Must stay under the image over-scale
// buffer (scale-[1.18] → ~0.09 of height on each side).
const PAN = 0.07;

export function CollageParallax() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const layers = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    if (!layers.length) return;

    let raf = 0;

    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const mid = vh / 2;
      for (const layer of layers) {
        // Measure the (untransformed) frame, not the layer — the layer carries
        // the transform, so reading its own rect would feed back on itself.
        const frame = layer.parentElement;
        if (!frame) continue;
        const r = frame.getBoundingClientRect();
        if (r.height === 0 || r.bottom < 0 || r.top > vh) continue; // offscreen / hidden
        const center = r.top + r.height / 2;
        const progress = Math.max(-1, Math.min(1, (mid - center) / mid));
        layer.style.transform = `translate3d(0, ${(progress * r.height * PAN).toFixed(1)}px, 0)`;
      }
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
