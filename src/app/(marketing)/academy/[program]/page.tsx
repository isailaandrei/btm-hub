import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortableText } from "@portabletext/react";
import { SanityImage } from "@/components/sanity/SanityImage";
import { portableTextComponents } from "@/lib/sanity/portable-text";
import { getProgramShowcase } from "@/lib/data/programs";
import { PROGRAM_SLUGS } from "@/lib/academy/programs";

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
    description:
      data.cms?.seoDescription ?? data.config.shortDescription,
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

  return (
    <div className="min-h-screen bg-muted">
      {/* Hero section */}
      {cms?.heroImage ? (
        <div className="relative aspect-[21/9] w-full overflow-hidden bg-neutral-900">
          <SanityImage
            source={cms.heroImage}
            alt={cms.heroImage?.alt || program.name}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/80 to-transparent" />
          <div className="absolute bottom-0 left-0 p-6 md:p-12">
            <span className="mb-2 text-4xl">{program.icon}</span>
            <h1 className="text-3xl font-bold text-white md:text-5xl">
              {program.name}
            </h1>
            <p className="mt-2 max-w-xl text-lg text-neutral-200">
              {program.shortDescription}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center bg-muted px-5 pt-20 pb-10">
          <span className="mb-4 text-5xl">{program.icon}</span>
          <h1 className="mb-4 text-[length:var(--font-size-h1)] font-medium text-foreground">
            {program.name}
          </h1>
          <p className="mb-8 max-w-md text-center text-muted-foreground">
            {program.shortDescription}
          </p>
        </div>
      )}

      {/* CTA */}
      <div className="flex justify-center py-8">
        {program.applicationOpen ? (
          <Link
            href={`/academy/${programSlug}/apply`}
            className="rounded-lg bg-primary px-8 py-3 font-medium text-white transition-opacity hover:opacity-90"
          >
            Apply Now
          </Link>
        ) : (
          <span className="rounded-lg border border-border px-8 py-3 font-medium text-muted-foreground">
            Coming Soon
          </span>
        )}
      </div>

      {/* CMS-enriched content */}
      {cms && (
        <div className="mx-auto max-w-4xl px-5 pb-16 md:px-0">
          {/* Full description */}
          {cms.fullDescription && (
            <section className="mb-12">
              <PortableText
                value={cms.fullDescription}
                components={portableTextComponents}
              />
            </section>
          )}

          {/* Highlights */}
          {cms.highlights && cms.highlights.length > 0 && (
            <section className="mb-12">
              <h2 className="mb-4 text-2xl font-bold text-foreground">
                Program Highlights
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {cms.highlights.map((highlight: string, i: number) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-lg bg-background p-4"
                  >
                    <span className="mt-0.5 text-primary">&#10003;</span>
                    <span className="text-sm text-foreground">{highlight}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Curriculum */}
          {cms.curriculum && (
            <section className="mb-12">
              <h2 className="mb-4 text-2xl font-bold text-foreground">
                Curriculum
              </h2>
              <PortableText
                value={cms.curriculum}
                components={portableTextComponents}
              />
            </section>
          )}

          {/* Instructor */}
          {cms.instructor && (
            <section className="mb-12">
              <h2 className="mb-4 text-2xl font-bold text-foreground">
                Lead Instructor
              </h2>
              <div className="flex items-center gap-4 rounded-xl bg-background p-5">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full">
                  <SanityImage
                    source={cms.instructor.photo}
                    alt={cms.instructor.name || ""}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    {cms.instructor.name}
                  </p>
                  {cms.instructor.title && (
                    <p className="text-sm text-muted-foreground">
                      {cms.instructor.title}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Gallery */}
          {cms.gallery?.images && cms.gallery.images.length > 0 && (
            <section className="mb-12">
              <h2 className="mb-4 text-2xl font-bold text-foreground">
                Gallery
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cms.gallery.images.map((image, i) => (
                    <div key={i} className="overflow-hidden rounded-lg">
                      <SanityImage
                        source={image}
                        alt={image.alt || ""}
                        width={600}
                        height={400}
                        className="w-full object-cover"
                      />
                    </div>
                  ),
                )}
              </div>
            </section>
          )}

          {/* FAQs */}
          {cms.faqs && cms.faqs.length > 0 && (
            <section className="mb-12">
              <h2 className="mb-4 text-2xl font-bold text-foreground">
                Frequently Asked Questions
              </h2>
              <div className="space-y-4">
                {cms.faqs.map((faq, i) => (
                    <details
                      key={i}
                      className="group rounded-lg bg-background p-5"
                    >
                      <summary className="cursor-pointer font-medium text-foreground">
                        {faq.question}
                      </summary>
                      {faq.answer && (
                        <div className="mt-3">
                          <PortableText
                            value={faq.answer}
                            components={portableTextComponents}
                          />
                        </div>
                      )}
                    </details>
                  ),
                )}
              </div>
            </section>
          )}

          {/* Testimonials */}
          {cms.testimonials && cms.testimonials.length > 0 && (
            <section className="mb-12">
              <h2 className="mb-4 text-2xl font-bold text-foreground">
                What Students Say
              </h2>
              <div className="grid gap-6 sm:grid-cols-2">
                {cms.testimonials.map((t, i) => (
                    <blockquote
                      key={i}
                      className="rounded-xl bg-background p-6"
                    >
                      <p className="text-sm italic text-muted-foreground">
                        &ldquo;{t.quote}&rdquo;
                      </p>
                      <footer className="mt-3 text-sm font-medium text-foreground">
                        — {t.authorName}
                        {t.authorDetail && (
                          <span className="font-normal text-muted-foreground">
                            , {t.authorDetail}
                          </span>
                        )}
                      </footer>
                    </blockquote>
                  ),
                )}
              </div>
            </section>
          )}

          {/* Pricing */}
          {cms.pricing && (
            <section className="mb-12">
              <h2 className="mb-4 text-2xl font-bold text-foreground">
                Pricing
              </h2>
              <PortableText
                value={cms.pricing}
                components={portableTextComponents}
              />
            </section>
          )}
        </div>
      )}

      {/* Back link */}
      <div className="flex justify-center pb-16">
        <Link
          href="/academy"
          className="text-sm text-primary transition-opacity hover:opacity-75"
        >
          &larr; Back to Academy
        </Link>
      </div>
    </div>
  );
}
