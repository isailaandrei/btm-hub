import { IMG_BASE, VIDEOS } from "./content";
import { VideoCarousel } from "./video-carousel";

/**
 * "Enjoy our videos" section — shared by desktop and mobile (rendered once,
 * below the layout-specific content). Uses a scrollable {@link VideoCarousel}
 * instead of the Figma's fixed thumbnail collage.
 */
export function VideosSection() {
  return (
    <section className="bg-[#020306] px-5 py-20 text-white sm:px-8 lg:px-16">
      <div className="mx-auto max-w-[1420px]">
        <div className="flex flex-col items-center text-center">
          <h2 className="font-display text-3xl tracking-wide sm:text-4xl md:text-5xl">{VIDEOS.title}</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${IMG_BASE}/flourish.svg`} alt="" aria-hidden className="my-4 h-4 w-5" />
          <p className="max-w-md font-serif text-sm leading-relaxed text-white/80 sm:text-base">{VIDEOS.subtitle}</p>
        </div>

        <div className="mt-12">
          <VideoCarousel videos={VIDEOS.images} href={VIDEOS.button.href} />
        </div>

        <div className="mt-12 flex justify-center">
          <a
            href={VIDEOS.button.href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-white px-7 py-3 font-display text-sm text-white transition-colors hover:bg-white/10"
          >
            {VIDEOS.button.label}
          </a>
        </div>
      </div>
    </section>
  );
}
