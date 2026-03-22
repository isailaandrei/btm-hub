import Link from "next/link";
import { PROGRAMS } from "@/lib/academy/programs";
import { SanityImage } from "@/components/sanity/SanityImage";
import { getAllProgramsCms } from "@/lib/data/sanity";

export default async function AcademyPage() {
  const programs = Object.values(PROGRAMS);
  const cmsData = await getAllProgramsCms();
  const cmsBySlug = new Map(cmsData.map((p) => [p.slug, p]));

  return (
    <div className="min-h-screen bg-muted px-5 py-20">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-center text-[length:var(--font-size-h1)] font-medium text-foreground">
          BTM Academy
        </h1>
        <p className="mx-auto mb-12 max-w-lg text-center text-muted-foreground">
          Mentorship-based programs for underwater creatives. Choose a program
          and start your journey.
        </p>

        <div className="grid gap-6 sm:grid-cols-2">
          {programs.map((program) => {
            const cms = cmsBySlug.get(program.slug);
            const isOpen = cms?.applicationOpen ?? program.applicationOpen;

            return (
              <Link
                key={program.slug}
                href={`/academy/${program.slug}`}
                className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary"
              >
                {cms?.heroImage ? (
                  <div className="relative aspect-video overflow-hidden">
                    <SanityImage
                      source={cms.heroImage}
                      alt={cms.heroImage?.alt || program.name}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-muted">
                    <span className="text-5xl">{program.icon}</span>
                  </div>
                )}
                <div className="flex flex-1 flex-col p-6">
                  <h2 className="mb-2 text-[length:var(--font-size-h3)] font-medium text-foreground">
                    {program.name}
                  </h2>
                  <p className="mb-6 flex-1 text-sm text-muted-foreground">
                    {program.shortDescription}
                  </p>
                  {isOpen ? (
                    <span className="inline-flex w-fit items-center rounded-full border border-primary bg-primary/10 px-4 py-2 text-sm text-primary">
                      Apply Now
                    </span>
                  ) : (
                    <span className="inline-flex w-fit items-center rounded-full border border-border px-4 py-2 text-sm text-muted-foreground">
                      Coming Soon
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
