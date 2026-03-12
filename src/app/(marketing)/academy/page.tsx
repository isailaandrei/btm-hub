import Link from "next/link";
import { PROGRAMS } from "@/lib/academy/programs";

export default function AcademyPage() {
  const programs = Object.values(PROGRAMS);

  return (
    <div className="min-h-screen bg-brand-secondary px-5 py-20">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-center text-[length:var(--font-size-h1)] font-medium text-white">
          BTM Academy
        </h1>
        <p className="mx-auto mb-12 max-w-lg text-center text-brand-cyan-blue-gray">
          Mentorship-based programs for underwater creatives. Choose a program
          and start your journey.
        </p>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((program) => (
            <Link
              key={program.slug}
              href={`/academy/${program.slug}`}
              className="group flex flex-col rounded-lg border border-brand-secondary bg-brand-near-black p-6 transition-colors hover:border-brand-primary"
            >
              <span className="mb-4 text-4xl">{program.icon}</span>
              <h2 className="mb-2 text-[length:var(--font-size-h3)] font-medium text-white">
                {program.name}
              </h2>
              <p className="mb-6 flex-1 text-sm text-brand-cyan-blue-gray">
                {program.shortDescription}
              </p>
              {program.applicationOpen ? (
                <span className="inline-flex w-fit items-center rounded-full border border-brand-primary bg-brand-primary/10 px-4 py-2 text-sm text-brand-primary">
                  Apply Now
                </span>
              ) : (
                <span className="inline-flex w-fit items-center rounded-full border border-brand-secondary px-4 py-2 text-sm text-brand-cyan-blue-gray">
                  Coming Soon
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
