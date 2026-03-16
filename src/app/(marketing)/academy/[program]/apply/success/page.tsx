import Link from "next/link";
import { getProgram } from "@/lib/academy/programs";
import { notFound } from "next/navigation";
import { ClearFormStorage } from "./clear-storage";

export default async function ApplicationSuccessPage({
  params,
}: {
  params: Promise<{ program: string }>;
}) {
  const { program: programSlug } = await params;
  const program = getProgram(programSlug);
  if (!program) return notFound();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-5 py-20">
      <ClearFormStorage programSlug={programSlug} />

      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
        <svg
          className="h-8 w-8 text-primary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      </div>

      <h1 className="mb-4 text-[length:var(--font-size-h1)] font-medium text-foreground">
        Application Submitted!
      </h1>
      <p className="mb-8 max-w-md text-center text-muted-foreground">
        Thank you for applying to {program.name}. We&apos;ll review your
        application and get back to you soon.
      </p>

      <Link
        href="/academy"
        className="rounded-lg bg-primary px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
      >
        Back to Academy
      </Link>
    </div>
  );
}
