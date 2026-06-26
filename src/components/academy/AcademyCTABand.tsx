import Link from "next/link";

const FLOURISH = "/images/home/flourish.svg";

/**
 * Closing conversion band — catches anyone who scrolled all four programmes
 * without deciding, and routes the undecided to a conversation rather than a
 * dead end.
 */
export function AcademyCTABand() {
  return (
    <section className="reveal border-t border-white/5 bg-[#020306] px-5 py-24 text-center sm:px-8">
      <div className="mx-auto max-w-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={FLOURISH} alt="" aria-hidden className="mx-auto mb-5 h-4 w-5" />
        <h2 className="font-display text-3xl text-white sm:text-4xl">
          Not sure which path is yours?
        </h2>
        <p className="mx-auto mt-4 max-w-md font-serif text-white/75">
          Every programme is mentorship-based and built around you. Tell us where
          you are and what you want to create — we&apos;ll help you find the right
          fit.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/contact"
            className="rounded-full border border-white px-8 py-3 font-display text-sm text-white transition-colors hover:bg-white/10"
          >
            Get in touch
          </Link>
        </div>
      </div>
    </section>
  );
}
