"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll-driven parallax for foreground hero copy. As the page scrolls, the
 * wrapped content drifts upward faster than the page and fades out, so it
 * separates from the static background photo for a sense of depth — without
 * touching the background composition or its section gradients.
 *
 * Implementation notes:
 * - Imperative: transform/opacity are written straight to the DOM inside a rAF,
 *   so scrolling never triggers a React re-render.
 * - Honors `prefers-reduced-motion` (renders static, full opacity) and re-syncs
 *   if the user toggles the OS setting.
 */
export function Parallax({
  speed = 0.35,
  fade = 0.85,
  className,
  children,
}: {
  /** Upward drift as a fraction of the scroll offset (higher = more motion). */
  speed?: number;
  /** Viewports of scroll over which the content fades to 0 (0 disables fade). */
  fade?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;

    const render = () => {
      raf = 0;
      const y = window.scrollY;
      el.style.transform = `translate3d(0, ${(-y * speed).toFixed(2)}px, 0)`;
      if (fade > 0) {
        const o = Math.max(0, Math.min(1, 1 - y / (window.innerHeight * fade)));
        el.style.opacity = o.toFixed(3);
      }
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(render);
    };

    const sync = () => {
      if (reduce.matches) {
        window.removeEventListener("scroll", onScroll);
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        el.style.transform = "";
        el.style.opacity = "";
      } else {
        window.addEventListener("scroll", onScroll, { passive: true });
        render();
      }
    };

    sync();
    reduce.addEventListener("change", sync);

    return () => {
      window.removeEventListener("scroll", onScroll);
      reduce.removeEventListener("change", sync);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [speed, fade]);

  return (
    <div ref={ref} className={className} style={{ willChange: "transform, opacity" }}>
      {children}
    </div>
  );
}
