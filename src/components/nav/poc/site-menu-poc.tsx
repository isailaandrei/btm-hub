"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SITE_MAP_POC, type NavNode } from "./site-map.poc";

/**
 * Navbar PROOF-OF-CONCEPT: a full-screen "sitemap" overlay that lays out every
 * section at once, three levels deep (top → sub-section → list). Reuses the
 * overlay mechanics from `home/mobile-nav.tsx` (own open state, body-scroll
 * lock, Escape to close, opacity transition). Placeholder content only.
 *
 * Desktop: a multi-column grid — everything visible at once.
 * Mobile: the same grid stacks to one column (the thing we want to eyeball).
 */
export function SiteMenuPoc() {
  const [open, setOpen] = useState(false);

  // Lock body scroll + close on Escape while the menu is open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 font-display text-lg text-white transition-colors hover:bg-white/10"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        Menu
      </button>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        className={cn(
          "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#020306]/97 text-white backdrop-blur-sm transition-opacity duration-300",
          open
            ? "visible opacity-100"
            : "pointer-events-none invisible opacity-0",
        )}
      >
        <div className="flex items-center justify-between px-6 py-5">
          <span className="font-display text-lg tracking-wide text-white/90">
            Behind the Mask
          </span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="-mr-2 grid size-11 place-items-center text-white"
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav className="mx-auto w-full max-w-6xl flex-1 px-8 pb-20 pt-4">
          <div className="grid gap-x-12 gap-y-14 text-left sm:grid-cols-2 lg:grid-cols-3">
            {SITE_MAP_POC.map((section) => (
              <SectionColumn
                key={section.label}
                node={section}
                onNavigate={() => setOpen(false)}
              />
            ))}
          </div>
        </nav>
      </div>
    </>
  );
}

function SectionColumn({
  node,
  onNavigate,
}: {
  node: NavNode;
  onNavigate: () => void;
}) {
  const categoryClass =
    "block border-b border-white/20 pb-2 font-display text-[1.7rem] font-semibold uppercase leading-none tracking-[0.12em] text-white";

  return (
    <div>
      {/* Level 1 — CATEGORY: big, uppercase, underlined so sections stand out */}
      {node.href ? (
        <Link
          href={node.href}
          onClick={onNavigate}
          className={cn(categoryClass, "transition-colors hover:text-white/70")}
        >
          {node.label}
        </Link>
      ) : (
        <h2 className={categoryClass}>{node.label}</h2>
      )}

      {node.children?.length ? (
        <ul className="mt-5 space-y-3.5">
          {node.children.map((child) => (
            <li key={child.label}>
              {/* Level 2 — sub-section: medium weight */}
              <Link
                href={child.href ?? "#"}
                onClick={onNavigate}
                className="text-[15px] font-medium text-white/90 transition-colors hover:text-white"
              >
                {child.label}
              </Link>

              {child.children?.length ? (
                <ul className="mt-2 space-y-1.5 border-l border-white/20 pl-4">
                  {child.children.map((leaf) => (
                    <li key={leaf.label}>
                      {/* Level 3 — list item: small, muted, marked + indented */}
                      <Link
                        href={leaf.href ?? "#"}
                        onClick={onNavigate}
                        className="flex items-center gap-1.5 text-[13px] text-white/55 transition-colors hover:text-white"
                      >
                        <span aria-hidden className="text-white/30">
                          ›
                        </span>
                        {leaf.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
