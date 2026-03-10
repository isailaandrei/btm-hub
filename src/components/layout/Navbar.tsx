"use client";

import { useState } from "react";
import Link from "next/link";

export interface NavbarProps {
  variant?: "light" | "dark";
}

const NAV_LINKS = [
  { label: "Academy", href: "/academy" },
  { label: "Shop", href: "/shop" },
  { label: "Community", href: "/community" },
  { label: "Partners", href: "/partners" },
  { label: "Foundation", href: "/foundation" },
  { label: "Contact", href: "/contact" },
] as const;

export function Navbar({ variant = "dark" }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const isLight = variant === "light";

  const bgClass = isLight ? "bg-white border-b border-brand-border" : "bg-brand-near-black";
  const textClass = isLight ? "text-brand-text" : "text-white";
  const logoClass = isLight ? "text-brand-text" : "text-white";

  return (
    <nav className={`relative z-50 ${bgClass}`}>
      <div className="flex items-center justify-between px-5 py-4 md:px-24 md:py-6">
        {/* Logo */}
        <Link href="/" className={`text-lg font-medium md:text-2xl md:font-bold ${logoClass}`}>
          Behind the Mask
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-base font-normal transition-opacity hover:opacity-75 ${textClass}`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="flex h-6 w-6 flex-col justify-center gap-1.5 md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          <span
            className={`block h-0.5 w-6 bg-white transition-transform ${mobileOpen ? "translate-y-2 rotate-45" : ""}`}
          />
          <span
            className={`block h-0.5 w-6 bg-white transition-opacity ${mobileOpen ? "opacity-0" : ""}`}
          />
          <span
            className={`block h-0.5 w-6 bg-white transition-transform ${mobileOpen ? "-translate-y-2 -rotate-45" : ""}`}
          />
        </button>
      </div>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 top-[64px] z-40 bg-brand-near-black transition-transform duration-300 md:hidden ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col gap-6 px-5 py-8">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-lg text-white transition-opacity hover:opacity-75"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
