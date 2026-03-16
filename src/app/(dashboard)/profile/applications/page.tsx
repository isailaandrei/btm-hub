import Link from "next/link";
import { getMyApplications, getApplicantName } from "@/lib/data/applications";
import { getProgram } from "@/lib/academy/programs";
import type { ApplicationStatus } from "@/types/database";

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  reviewing: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
  accepted: "border-green-500/30 bg-green-500/10 text-green-400",
};

export default async function MyApplicationsPage() {
  const applications = await getMyApplications();

  return (
    <>
      <h1 className="mb-8 text-[length:var(--font-size-h1)] font-medium text-white">
        My Applications
      </h1>

      {applications.length === 0 ? (
        <div className="rounded-xl border border-brand-secondary bg-brand-near-black p-10 text-center">
          <div className="mb-4 text-4xl">🌊</div>
          <h2 className="mb-2 text-lg font-medium text-white">
            No applications yet
          </h2>
          <p className="mb-6 text-sm text-brand-cyan-blue-gray">
            Browse our academy programs and submit an application to get started.
          </p>
          <Link
            href="/academy"
            className="inline-block rounded-lg bg-brand-primary px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Browse Programs
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {applications.map((app) => {
            const program = getProgram(app.program);
            const name = getApplicantName(app.answers, "Application");
            const submittedDate = new Date(
              app.submitted_at,
            ).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            });

            return (
              <div
                key={app.id}
                className="rounded-xl border border-brand-secondary bg-brand-near-black p-5 transition-colors hover:border-brand-primary/40"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  {/* Left: program info */}
                  <div className="flex items-start gap-4">
                    <span className="text-3xl leading-none">
                      {program?.icon ?? "📄"}
                    </span>
                    <div>
                      <h3 className="text-base font-medium text-white">
                        {program?.name ?? app.program}
                      </h3>
                      <p className="mt-1 text-sm text-brand-cyan-blue-gray">
                        Applied as {name}
                      </p>
                      <p className="mt-0.5 text-xs text-brand-light-gray">
                        Submitted {submittedDate}
                      </p>
                    </div>
                  </div>

                  {/* Right: status */}
                  <span
                    className={`inline-flex w-fit shrink-0 rounded-full border px-3 py-1 text-xs font-medium capitalize ${STATUS_STYLES[app.status]}`}
                  >
                    {app.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
