"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import { getInitials, useNavbarAuth } from "@/components/layout/use-navbar-auth";
import type { NavbarUser } from "@/lib/data/auth";
import { SITE_NAV } from "./site-map";

/**
 * The site header — one component for the homepage and every marketing
 * subpage, so the navigation looks identical everywhere.
 *
 * Desktop: the top-level links sit inline in the bar (logo · links · auth).
 * Hovering the links opens a mega-menu panel beneath the header showing the
 * full sitemap — each section ready to grow sub-links (Academy → Experiences
 * → trips) without reworking the layout. Auth / admin live in the bar itself.
 *
 * Mobile: a hamburger opens the full-screen sitemap (with auth), since there
 * is no room for inline links or hover.
 *
 * `transparent` (homepage): fixed over the hero, transparent at the top and
 * darkening once scrolled. Otherwise (subpages): a solid bar in normal flow.
 */

const LOGO_SRC = "/images/home/logo.png";

export function SiteHeader({
  transparent = false,
  initialUser,
}: {
  transparent?: boolean;
  initialUser?: NavbarUser;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user } = useNavbarAuth(initialUser);
  const pathname = usePathname();

  // Delay closing the hover panel so the pointer can travel from the links
  // down into the panel without it snapping shut.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openMenu = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setMenuOpen(true);
  };
  const closeMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMenuOpen(false), 120);
  };
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // Close everything whenever the route changes.
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setMenuOpen(false);
    setMobileOpen(false);
  }

  // Transparent header gains a dark background once scrolled off the hero.
  useEffect(() => {
    if (!transparent) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [transparent]);

  // Lock body scroll + close on Escape while the mobile menu is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  const barBg = !transparent
    ? "bg-[#020306]"
    : scrolled || menuOpen
      ? "bg-[#020306]/90 shadow-lg shadow-black/20 backdrop-blur-sm"
      : "bg-transparent";

  return (
    <header
      className={cn(
        "z-40 transition-colors duration-300",
        transparent ? "fixed inset-x-0 top-0" : "relative",
        barBg,
      )}
    >
      <div className="mx-auto flex max-w-[1680px] items-center justify-between px-5 py-4 md:px-12 md:py-5">
        <Logo onNavigate={() => setMobileOpen(false)} />

        {/* Desktop: inline links (hover opens the mega-menu) */}
        <div
          className="hidden md:block"
          onMouseEnter={openMenu}
          onMouseLeave={closeMenu}
        >
          <nav className="flex items-center gap-8">
            {SITE_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="font-display text-[15px] text-white/90 transition-colors hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Desktop: auth / admin */}
        <div className="hidden md:block">
          <SiteBarAuth user={user} />
        </div>

        {/* Mobile: hamburger */}
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="-mr-1 grid size-10 place-items-center text-white md:hidden"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>

      {/* Desktop mega-menu panel */}
      <div
        onMouseEnter={openMenu}
        onMouseLeave={closeMenu}
        className={cn(
          "absolute inset-x-0 top-full hidden border-t border-white/10 bg-[#020306]/97 backdrop-blur-sm transition-opacity duration-200 md:block",
          menuOpen
            ? "visible opacity-100"
            : "pointer-events-none invisible opacity-0",
        )}
      >
        <div className="mx-auto max-w-[1680px] px-12 py-10">
          <div className="grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
            {SITE_NAV.map((section) => (
              <div key={section.href}>
                <Link
                  href={section.href}
                  onClick={() => setMenuOpen(false)}
                  className="block font-display text-lg font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:text-white/70"
                >
                  {section.label}
                </Link>
                {section.children?.length ? (
                  <ul className="mt-3 space-y-2">
                    {section.children.map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          onClick={() => setMenuOpen(false)}
                          className="text-sm text-white/55 transition-colors hover:text-white"
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <MobileMenu
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        user={user}
      />
    </header>
  );
}

function Logo({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/"
      aria-label="Behind the Mask home"
      onClick={onNavigate}
      className="shrink-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_SRC} alt="Behind the Mask" className="h-8 w-auto md:h-9" />
    </Link>
  );
}

/** Auth / admin cluster shown inline in the bar (desktop). */
function SiteBarAuth({ user }: { user: NavbarUser }) {
  if (!user) {
    return (
      <div className="flex items-center gap-5">
        <Link
          href="/login"
          className="font-display text-[15px] text-white/85 transition-colors hover:text-white"
        >
          Log In
        </Link>
        <Link
          href="/register"
          className="rounded-full bg-white px-6 py-2 font-display text-[15px] text-[#020306] transition-colors hover:bg-white/90"
        >
          Join
        </Link>
      </div>
    );
  }

  const initials = getInitials(user.displayName);

  return (
    <div className="flex items-center gap-4">
      {user.role === "admin" && (
        <Link
          href="/admin"
          className="rounded-full border border-white/70 px-5 py-2 font-display text-[15px] text-white transition-colors hover:bg-white/10"
        >
          Admin
        </Link>
      )}
      <Link
        href="/profile"
        aria-label="Your profile"
        className="relative grid size-9 place-items-center overflow-hidden rounded-full border border-white/40 transition-colors hover:border-white"
      >
        {user.avatarUrl ? (
          <Image src={user.avatarUrl} alt="" fill sizes="36px" className="object-cover" />
        ) : (
          <span className="font-display text-sm text-white">{initials}</span>
        )}
      </Link>
      <form action={logout} className="flex items-center">
        <button
          type="submit"
          className="font-display text-[15px] text-white/70 transition-colors hover:text-white"
        >
          Log Out
        </button>
      </form>
    </div>
  );
}

/** Full-screen sitemap for small screens (with auth). */
function MobileMenu({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: NavbarUser;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      className={cn(
        "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#020306]/97 text-white backdrop-blur-sm transition-opacity duration-300 md:hidden",
        open ? "visible opacity-100" : "pointer-events-none invisible opacity-0",
      )}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <Logo onNavigate={onClose} />
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
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

      <nav className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
        {SITE_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className="font-display text-4xl font-semibold uppercase leading-none tracking-[0.14em] text-white/90 transition-colors hover:text-white"
          >
            {item.label}
          </Link>
        ))}

        <MobileMenuAuth user={user} onNavigate={onClose} />
      </nav>
    </div>
  );
}

function MobileMenuAuth({
  user,
  onNavigate,
}: {
  user: NavbarUser;
  onNavigate: () => void;
}) {
  if (!user) {
    return (
      <div className="mt-10 flex items-center gap-5">
        <Link
          href="/login"
          onClick={onNavigate}
          className="font-display text-base text-white/80 transition-colors hover:text-white"
        >
          Log In
        </Link>
        <Link
          href="/register"
          onClick={onNavigate}
          className="rounded-full bg-white px-8 py-2.5 font-display text-base text-[#020306] transition-colors hover:bg-white/90"
        >
          Join
        </Link>
      </div>
    );
  }

  const initials = getInitials(user.displayName);

  return (
    <div className="mt-10 flex items-center gap-6">
      {user.role === "admin" && (
        <Link
          href="/admin"
          onClick={onNavigate}
          className="rounded-full border border-white/80 px-6 py-2.5 font-display text-base text-white transition-colors hover:bg-white/10"
        >
          Admin
        </Link>
      )}
      <Link
        href="/profile"
        onClick={onNavigate}
        className="flex items-center gap-3 font-display text-base text-white/85 transition-colors hover:text-white"
      >
        <span className="grid size-9 place-items-center overflow-hidden rounded-full border border-white/40 text-sm">
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt=""
              width={36}
              height={36}
              className="h-full w-full object-cover"
            />
          ) : (
            initials
          )}
        </span>
        Profile
      </Link>
      <form action={logout}>
        <button
          type="submit"
          onClick={onNavigate}
          className="font-display text-base text-white/70 transition-colors hover:text-white"
        >
          Log Out
        </button>
      </form>
    </div>
  );
}
