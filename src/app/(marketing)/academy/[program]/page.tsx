import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CheckIcon } from "lucide-react";
import { PortableText } from "@portabletext/react";
import { SanityImage } from "@/components/sanity/SanityImage";
import { portableTextComponents } from "@/lib/sanity/portable-text";
import { getProgramShowcase } from "@/lib/data/programs";
import { PROGRAM_SLUGS } from "@/lib/academy/programs";
import { PROGRAM_MARKETING } from "@/lib/academy/marketing";
import { detailHeroImage, detailOverviewImage } from "@/lib/academy/images";
import type { ProgramSlug } from "@/types/database";

const FLOURISH = "/images/home/flourish.svg";

export async function generateStaticParams() {
  return PROGRAM_SLUGS.map((slug) => ({ program: slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ program: string }>;
}): Promise<Metadata> {
  const { program: slug } = await params;
  const data = await getProgramShowcase(slug);
  if (!data) return {};
  return {
    title: `${data.config.name} — Behind The Mask Academy`,
    description: data.cms?.seoDescription ?? data.config.shortDescription,
  };
}

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ program: string }>;
}) {
  const { program: programSlug } = await params;
  const data = await getProgramShowcase(programSlug);
  if (!data) return notFound();

  const { config: program, cms } = data;
  // Local marketing copy + academy photos are the always-present baseline;
  // Sanity CMS fields enrich the page when they exist.
  const marketing = PROGRAM_MARKETING[program.slug as ProgramSlug];
  const heroImage = detailHeroImage(cms);
  const overviewImage = detailOverviewImage(cms);
  const highlights =
    cms?.highlights && cms.highlights.length > 0
      ? cms.highlights
      : marketing.highlights;

  return (
    <div className="dark min-h-screen bg-[#020306] text-white">
      {/* Hero — the programme's signature photo (same shot as its Academy panel) */}
      <section className="relative isolate flex min-h-[70vh] w-full items-end overflow-hidden bg-[#020306] md:min-h-[80vh]">
        <div className="absolute inset-0 -z-10">
          {heroImage ? (
            <SanityImage
              source={heroImage}
              alt={cms?.heroImage?.alt || program.name}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          ) : (
            <Image
              src={marketing.panelImage}
              alt=""
              aria-hidden
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          )}
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#020306] via-[#020306]/30 to-[#020306]/60" />
        </div>

        <div className="mx-auto w-full max-w-[1420px] px-5 pb-16 pt-28 sm:px-8 md:pb-20 lg:px-16">
          <Link
            href="/academy"
            className="inline-flex items-center gap-1.5 font-display text-xs uppercase tracking-[0.2em] text-white/60 transition-colors hover:text-white"
          >
            <ArrowLeftIcon className="size-3.5" />
            Academy
          </Link>
          <p className="mt-6 font-display text-xs uppercase tracking-[0.3em] text-white/70">
            {marketing.overline}
          </p>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] text-white sm:text-5xl md:text-6xl">
            {program.name}
          </h1>
          <p className="mt-5 max-w-xl font-serif text-base leading-relaxed text-white/80 sm:text-lg">
            {program.shortDescription}
          </p>
          <div className="mt-8">
            {program.applicationOpen ? (
              <Link
                href={`/academy/${programSlug}/apply`}
                className="inline-flex items-center rounded-full bg-white px-7 py-3 font-display text-sm text-neutral-950 transition-colors hover:bg-white/90"
              >
                Apply
              </Link>
            ) : (
              <span className="inline-flex items-center rounded-full border border-white/20 px-7 py-3 font-display text-sm text-white/50">
                Applications closed
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Overview — the pitch + what you'll get, alongside a second photo */}
      <section className="border-t border-white/5 py-16 md:py-24">
        <div className="mx-auto grid max-w-[1420px] items-center gap-10 px-5 sm:px-8 md:grid-cols-2 md:gap-16 lg:px-16">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
            {overviewImage ? (
              <SanityImage
                source={overviewImage}
                alt={program.name}
                fill
                className="object-cover"
                sizes="(min-width: 768px) 50vw, 100vw"
              />
            ) : (
              <Image
                src={marketing.placeholderImage}
                alt=""
                aria-hidden
                fill
                className="object-cover"
                sizes="(min-width: 768px) 50vw, 100vw"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#020306]/45 to-transparent" />
          </div>

          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={FLOURISH} alt="" aria-hidden className="mb-4 h-3.5 w-5" />
            {cms?.fullDescription ? (
              <div className="max-w-xl font-serif text-base leading-relaxed text-white/80 [&_a]:text-white [&_a]:underline [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-white [&_p]:mt-4">
                <PortableText
                  value={cms.fullDescription}
                  components={portableTextComponents}
                />
              </div>
            ) : (
              <p className="max-w-xl font-serif text-base leading-relaxed text-white/80 sm:text-lg">
                {marketing.description}
              </p>
            )}

            <h2 className="mt-8 font-display text-xs uppercase tracking-[0.3em] text-white/60">
              What you&apos;ll get
            </h2>
            <ul className="mt-4 space-y-2.5">
              {highlights.map((highlight: string) => (
                <li
                  key={highlight}
                  className="flex items-start gap-3 font-serif text-sm text-white/75"
                >
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-white/50" />
                  {highlight}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CMS-enriched sections — only render when Sanity content exists */}
      {cms && (
        <div className="mx-auto max-w-[1420px] px-5 sm:px-8 lg:px-16">
          {cms.curriculum && (
            <section className="border-t border-white/5 py-14 md:py-20">
              <h2 className="mb-6 font-display text-2xl text-white sm:text-3xl">
                Curriculum
              </h2>
              <div className="max-w-3xl font-serif text-white/80 [&_a]:text-white [&_a]:underline [&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-xl [&_h3]:text-white [&_p]:mt-4">
                <PortableText
                  value={cms.curriculum}
                  components={portableTextComponents}
                />
              </div>
            </section>
          )}

          {cms.instructor && (
            <section className="border-t border-white/5 py-14 md:py-20">
              <h2 className="mb-6 font-display text-2xl text-white sm:text-3xl">
                Lead instructor
              </h2>
              <div className="flex items-center gap-4 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-full">
                  <SanityImage
                    source={cms.instructor.photo}
                    alt={cms.instructor.name || ""}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                </div>
                <div>
                  <p className="font-display text-white">
                    {cms.instructor.name}
                  </p>
                  {cms.instructor.title && (
                    <p className="font-serif text-sm text-white/60">
                      {cms.instructor.title}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {cms.gallery?.images && cms.gallery.images.length > 0 && (
            <section className="border-t border-white/5 py-14 md:py-20">
              <h2 className="mb-6 font-display text-2xl text-white sm:text-3xl">
                Gallery
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cms.gallery.images.map((image, i) => (
                  <div
                    key={i}
                    className="relative aspect-[3/2] overflow-hidden rounded-2xl ring-1 ring-white/10"
                  >
                    <SanityImage
                      source={image}
                      alt={image.alt || ""}
                      fill
                      className="object-cover"
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {cms.faqs && cms.faqs.length > 0 && (
            <section className="border-t border-white/5 py-14 md:py-20">
              <h2 className="mb-6 font-display text-2xl text-white sm:text-3xl">
                Frequently asked questions
              </h2>
              <div className="space-y-3">
                {cms.faqs.map((faq, i) => (
                  <details
                    key={i}
                    className="group rounded-2xl bg-white/5 p-5 ring-1 ring-white/10"
                  >
                    <summary className="cursor-pointer font-display text-white">
                      {faq.question}
                    </summary>
                    {faq.answer && (
                      <div className="mt-3 font-serif text-sm text-white/75 [&_a]:text-white [&_a]:underline [&_p]:mt-2">
                        <PortableText
                          value={faq.answer}
                          components={portableTextComponents}
                        />
                      </div>
                    )}
                  </details>
                ))}
              </div>
            </section>
          )}

          {cms.testimonials && cms.testimonials.length > 0 && (
            <section className="border-t border-white/5 py-14 md:py-20">
              <h2 className="mb-6 font-display text-2xl text-white sm:text-3xl">
                What students say
              </h2>
              <div className="grid gap-6 sm:grid-cols-2">
                {cms.testimonials.map((t, i) => (
                  <blockquote
                    key={i}
                    className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10"
                  >
                    <p className="font-serif text-sm italic text-white/80">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                    <footer className="mt-3 font-display text-sm text-white">
                      — {t.authorName}
                      {t.authorDetail && (
                        <span className="font-serif font-normal text-white/60">
                          , {t.authorDetail}
                        </span>
                      )}
                    </footer>
                  </blockquote>
                ))}
              </div>
            </section>
          )}

          {cms.pricing && (
            <section className="border-t border-white/5 py-14 md:py-20">
              <h2 className="mb-6 font-display text-2xl text-white sm:text-3xl">
                Pricing
              </h2>
              <div className="max-w-3xl font-serif text-white/80 [&_a]:text-white [&_a]:underline [&_p]:mt-4">
                <PortableText
                  value={cms.pricing}
                  components={portableTextComponents}
                />
              </div>
            </section>
          )}
        </div>
      )}

      {/* Closing apply band */}
      <section className="border-t border-white/5 px-5 py-20 text-center sm:px-8 md:py-24">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={FLOURISH} alt="" aria-hidden className="mx-auto mb-5 h-4 w-5" />
        <h2 className="font-display text-3xl text-white sm:text-4xl">
          {program.applicationOpen
            ? `Ready to join ${program.name}?`
            : "Applications aren't open yet"}
        </h2>
        <p className="mx-auto mt-4 max-w-md font-serif text-white/75">
          {program.applicationOpen
            ? "Every programme is mentorship-based and built around you. Send your application and we'll be in touch."
            : "This programme isn't taking applications right now — get in touch and we'll let you know when it opens."}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {program.applicationOpen ? (
            <Link
              href={`/academy/${programSlug}/apply`}
              className="inline-flex items-center rounded-full bg-white px-8 py-3 font-display text-sm text-neutral-950 transition-colors hover:bg-white/90"
            >
              Apply
            </Link>
          ) : (
            <Link
              href="/contact"
              className="inline-flex items-center rounded-full border border-white px-8 py-3 font-display text-sm text-white transition-colors hover:bg-white/10"
            >
              Get in touch
            </Link>
          )}
          <Link
            href="/academy"
            className="inline-flex items-center rounded-full border border-white/30 px-8 py-3 font-display text-sm text-white/80 transition-colors hover:bg-white/10"
          >
            All programmes
          </Link>
        </div>
      </section>
    </div>
  );
}
