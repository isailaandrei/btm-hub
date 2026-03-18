"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AuthButtons } from "./AuthButtons";

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

function LogoText({ className }: { className?: string }) {
  return (
    <span className={className}>Behind the Mask</span>
  );
}

export function Navbar({ variant = "dark" }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const isLight = variant === "light";

  const bgClass = isLight ? "bg-white border-b border-border" : "bg-neutral-950";
  const textClass = isLight ? "text-foreground" : "text-white";

  return (
    <nav className={`relative z-50 ${bgClass}`}>
      <div className="flex items-center justify-between px-5 py-4 md:px-24 md:py-6">
        {/* Logo */}
        <Link href="/" className="shrink-0">
          {isLight ? (
            <LogoText className="text-lg font-medium text-foreground md:text-2xl md:font-bold" />
          ) : (
            <>
              {/* Desktop: brand logo image (falls back to text if missing) */}
              {logoError ? (
                <LogoText className="hidden text-2xl font-bold text-white md:block" />
              ) : (
                <Image
                  src="/logo-white.png"
                  alt="Behind the Mask"
                  width={122}
                  height={40}
                  className="hidden md:block"
                  onError={() => setLogoError(true)}
                  priority
                />
              )}
              {/* Mobile: always text */}
              <LogoText className="text-lg font-medium text-white md:hidden" />
            </>
          )}
        </Link>

        {/* Desktop links + auth */}
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
          <AuthButtons variant={variant} />
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
        className={`fixed inset-0 top-[64px] z-40 bg-neutral-950 transition-transform duration-300 md:hidden ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col gap-6 px-5 py-8">
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
          <div className="mt-auto border-t border-border pt-6">
            <AuthButtons variant={variant} />
          </div>
        </div>
      </div>
    </nav>
  );
}
