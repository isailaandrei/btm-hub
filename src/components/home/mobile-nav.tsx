"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { IMG_BASE, LOGIN_HREF, NAV_LINKS } from "./content";

/**
 * Mobile header: logo + hamburger that opens a full-screen menu with the nav
 * links and Log In. Locks body scroll and closes on Escape / backdrop tap.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="flex items-center justify-between px-5 pt-6">
      <Link href="/" aria-label="Behind the Mask home" onClick={() => setOpen(false)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${IMG_BASE}/logo.png`} alt="Behind the Mask" className="h-8 w-auto" />
      </Link>

      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(true)}
        className="-mr-2 grid size-11 place-items-center text-white"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {/* Full-screen menu */}
      <div
        id="mobile-menu"
        className={cn(
          "fixed inset-0 z-50 flex flex-col bg-[#020306]/95 backdrop-blur-sm transition-opacity duration-300",
          open ? "visible opacity-100" : "pointer-events-none invisible opacity-0",
        )}
      >
        <div className="flex items-center justify-between px-5 pt-6">
          <Link href="/" aria-label="Behind the Mask home" onClick={() => setOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${IMG_BASE}/logo.png`} alt="Behind the Mask" className="h-8 w-auto" />
          </Link>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="-mr-2 grid size-11 place-items-center text-white"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav className="flex flex-1 flex-col items-center justify-center gap-2 px-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="py-3 font-display text-2xl text-white/90 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={LOGIN_HREF}
            onClick={() => setOpen(false)}
            className="mt-6 rounded-full border border-white px-10 py-3 font-display text-base text-white transition-colors hover:bg-white/10"
          >
            Log In
          </Link>
        </nav>
      </div>
    </div>
  );
}
