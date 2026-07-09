import Image from "next/image";
import Link from "next/link";
import type { SanityImageSource } from "@sanity/image-url";

import { SanityImage } from "@/components/sanity/SanityImage";

const FLOURISH = "/images/home/flourish.svg";

/**
 * Closing conversion band — catches anyone who scrolled all four programmes
 * without deciding, and routes the undecided to a conversation rather than a
 * dead end. A wide atmospheric still sits behind a heavy #020306 wash so the
 * copy stays legible while the ocean carries the mood.
 *
 * The background is admin-editable via Sanity ({@link backgroundImage}); it
 * falls back to the shipped local still when unset.
 */
export function AcademyCTABand({
  backgroundImage,
}: {
  backgroundImage?: SanityImageSource | null;
}) {
  return (
    <section className="reveal relative isolate overflow-hidden border-t border-white/5 px-5 py-28 text-center sm:px-8">
      {backgroundImage ? (
        <SanityImage
          source={backgroundImage}
          alt=""
          fill
          sizes="100vw"
          className="-z-10 object-cover"
        />
      ) : (
        <Image
          src="/images/academy/cta-wide.jpg"
          alt=""
          aria-hidden
          fill
          sizes="100vw"
          className="-z-10 object-cover"
        />
      )}
      <div className="absolute inset-0 -z-10 bg-[#020306]/80" />
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
