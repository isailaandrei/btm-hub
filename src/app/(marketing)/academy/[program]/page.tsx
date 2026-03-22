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
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-5 py-20">
      <h1 className="mb-4 text-[length:var(--font-size-h1)] font-medium text-foreground">
        {program.name}
      </h1>
      <p className="mb-8 max-w-md text-center text-muted-foreground">
        {program.shortDescription}
      </p>

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

      <Link
        href="/academy"
        className="mt-6 text-sm text-primary transition-opacity hover:opacity-75"
      >
        &larr; Back to Academy
      </Link>
    </div>
  );
}
