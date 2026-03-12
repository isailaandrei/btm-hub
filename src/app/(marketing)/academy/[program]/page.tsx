import Link from "next/link";
import { getProgram } from "@/lib/academy/programs";
import { notFound } from "next/navigation";

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ program: string }>;
}) {
  const { program: programSlug } = await params;
  const program = getProgram(programSlug);
  if (!program) return notFound();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-background px-5 py-20">
      <span className="mb-4 text-5xl">{program.icon}</span>
      <h1 className="mb-4 text-[length:var(--font-size-h1)] font-medium text-white">
        {program.name}
      </h1>
      <p className="mb-8 max-w-md text-center text-brand-cyan-blue-gray">
        {program.shortDescription}
      </p>

      {program.applicationOpen ? (
        <Link
          href={`/academy/${programSlug}/apply`}
          className="rounded-lg bg-brand-primary px-8 py-3 font-medium text-white transition-opacity hover:opacity-90"
        >
          Apply Now
        </Link>
      ) : (
        <span className="rounded-lg border border-brand-secondary px-8 py-3 font-medium text-brand-cyan-blue-gray">
          Coming Soon
        </span>
      )}

      <Link
        href="/academy"
        className="mt-6 text-sm text-brand-primary transition-opacity hover:opacity-75"
      >
        &larr; Back to Academy
      </Link>
    </div>
  );
}
