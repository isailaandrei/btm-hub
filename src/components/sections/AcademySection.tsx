import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import { RoundedButton } from "@/components/ui/RoundedButton";

const PROGRAMS = ["Filmmaking", "Photography", "Freediving", "Internships"];

export function AcademySection() {
  return (
    <section className="bg-white px-5 py-12 md:px-24 md:py-24">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-16 lg:gap-24">
        {/* Image placeholder — shown first on mobile, second on desktop */}
        <div className="aspect-[540/380] w-full rounded-xl bg-accent md:order-2 md:w-1/2" />

        {/* Text content */}
        <div className="flex flex-col gap-5 md:order-1 md:w-1/2">
          <h2 className="text-[length:var(--font-size-h1)] font-bold text-foreground">
            Ocean Academy
          </h2>
          <p className="text-lg text-muted-foreground">
            Learn from the best. Our mentorship-based programs in underwater
            filmmaking, photography, and freediving are individually tailored —
            not one-size-fits-all courses.
          </p>
          <div className="flex flex-wrap gap-3">
            {PROGRAMS.map((program) => (
              <Tag key={program} variant="ghost">
                {program}
              </Tag>
            ))}
          </div>
          <div>
            <Link href="/academy">
              <RoundedButton variant="primary">Apply Now</RoundedButton>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
