import Link from "next/link";

const EXPLORE_LINKS = [
  { label: "Travel", href: "/travel" },
  { label: "Academy", href: "/academy" },
  { label: "Shop", href: "/shop" },
  { label: "Community", href: "/community" },
  { label: "Partners", href: "/partners" },
  { label: "Foundation", href: "/foundation" },
] as const;

const CONTACT_EMAILS = [
  "info@behind-the-mask.com",
  "info@behind-the-mask-travel.com",
] as const;

export function Footer() {
  return (
    <footer className="bg-brand-dark-navy px-5 py-10 md:px-24 md:py-12">
      {/* Top section */}
      <div className="flex flex-col gap-8 md:flex-row md:gap-12">
        {/* Brand */}
        <div className="flex flex-col gap-3 md:flex-1">
          <span className="text-lg font-medium text-white md:text-xl md:font-bold">
            Behind the Mask
          </span>
          <p className="text-sm text-brand-cyan-blue-gray md:text-sm">
            A community of creative ocean enthusiasts who observe, listen and
            document the underwater world.
          </p>
        </div>

        {/* Explore links */}
        <div className="flex flex-col gap-3 md:flex-1">
          <span className="text-base font-medium text-white">Explore</span>
          <div className="flex flex-col gap-3">
            {EXPLORE_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-brand-cyan-blue-gray transition-opacity hover:opacity-75"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div className="flex flex-col gap-3 md:flex-1">
          <span className="text-base font-medium text-white">Contact</span>
          {CONTACT_EMAILS.map((email) => (
            <a
              key={email}
              href={`mailto:${email}`}
              className="text-sm text-brand-cyan-blue-gray transition-opacity hover:opacity-75"
            >
              {email}
            </a>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="mt-8 flex flex-col items-center gap-2 md:flex-row md:justify-between">
        <span className="text-xs text-brand-cyan-blue-gray md:text-[13px]">
          &copy; {new Date().getFullYear()} Behind the Mask. All rights
          reserved.
        </span>
        <div className="flex gap-2 text-xs text-brand-cyan-blue-gray md:text-[13px]">
          <Link href="/imprint" className="transition-opacity hover:opacity-75">
            Imprint
          </Link>
          <span>&middot;</span>
          <Link href="/privacy" className="transition-opacity hover:opacity-75">
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
