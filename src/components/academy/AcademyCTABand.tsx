import Link from "next/link";
import type { SanityImageSource } from "@sanity/image-url";

import { SanityImage } from "@/components/sanity/SanityImage";
import { editAttr } from "@/lib/sanity/data-attribute";

const FLOURISH = "/images/home/flourish.svg";

/**
 * Closing conversion band — catches anyone who scrolled all four programmes
 * without deciding, and routes the undecided to a conversation rather than a
 * dead end. A wide atmospheric still sits behind a heavy #020306 wash so the
 * copy stays legible while the ocean carries the mood.
 *
 * All copy + imagery is Sanity-owned: heading, body and button label each
 * render only when set (an empty label hides the button; the link target is
 * always `/contact`). With no background image the band is the #020306/80 wash
 * alone.
 */
export function AcademyCTABand({
  backgroundImage,
  heading,
  body,
  buttonLabel,
}: {
  backgroundImage?: SanityImageSource | null;
  heading?: string | null;
  body?: string | null;
  buttonLabel?: string | null;
}) {
  return (
    <section className="reveal relative isolate overflow-hidden border-t border-white/5 px-5 py-28 text-center sm:px-8">
      {backgroundImage && (
        <SanityImage
          source={backgroundImage}
          alt=""
          fill
          sizes="100vw"
          className="-z-10 object-cover"
          dataSanity={editAttr(
            "academyPageSettings",
            "academyPageSettings",
            "ctaImage",
          )}
        />
      )}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[#020306]/80" />
      <div className="mx-auto max-w-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={FLOURISH} alt="" aria-hidden className="mx-auto mb-5 h-4 w-5" />
        {heading && (
          <h2 className="font-display text-3xl text-white sm:text-4xl">
            {heading}
          </h2>
        )}
        {body && (
          <p className="mx-auto mt-4 max-w-md font-serif text-white/75">{body}</p>
        )}
        {buttonLabel && (
          <div className="mt-8 flex justify-center">
            <Link
              href="/contact"
              className="rounded-full border border-white px-8 py-3 font-display text-sm text-white transition-colors hover:bg-white/10"
            >
              {buttonLabel}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
