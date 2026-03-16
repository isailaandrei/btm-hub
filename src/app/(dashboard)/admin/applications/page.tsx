import Link from "next/link";
import { getApplications, getApplicantName, type ApplicationFilters } from "@/lib/data/applications";
import type { ApplicationStatus, ProgramSlug } from "@/types/database";
import { STATUS_COLORS, STATUSES, PROGRAMS } from "./constants";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const filters: ApplicationFilters = {
    page: params.page ? parseInt(params.page, 10) : 1,
    limit: 20,
    program: PROGRAMS.includes(params.program as ProgramSlug)
      ? (params.program as ProgramSlug)
      : undefined,
    status: STATUSES.includes(params.status as ApplicationStatus)
      ? (params.status as ApplicationStatus)
      : undefined,
    search: params.search || undefined,
  };

  const { data: applications, count } = await getApplications(filters);
  const totalPages = Math.ceil(count / (filters.limit ?? 20));
  const currentPage = filters.page ?? 1;

  function buildUrl(overrides: Record<string, string | undefined>) {
    const merged = { ...params, ...overrides };
    const qs = Object.entries(merged)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return qs ? `?${qs}` : "";
  }

  return (
    <div>
      <h1 className="mb-6 text-[length:var(--font-size-h2)] font-medium text-white">
        Applications
      </h1>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <form className="flex items-center gap-3" method="get">
          {/* Preserve existing filters */}
          {params.program && <input type="hidden" name="program" value={params.program} />}
          {params.status && <input type="hidden" name="status" value={params.status} />}
          <input
            type="text"
            name="search"
            placeholder="Search by name or email..."
            defaultValue={params.search ?? ""}
            className="rounded-lg border border-brand-secondary bg-brand-near-black px-4 py-2 text-sm text-white placeholder-brand-cyan-blue-gray outline-none focus:border-brand-primary"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Search
          </button>
        </form>

        {/* Program filter */}
        <div className="flex gap-1">
          <Link
            href={`/admin/applications${buildUrl({ program: undefined, page: undefined })}`}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              !params.program
                ? "bg-brand-primary text-white"
                : "border border-brand-secondary text-brand-cyan-blue-gray hover:text-white"
            }`}
          >
            All Programs
          </Link>
          {PROGRAMS.map((p) => (
            <Link
              key={p}
              href={`/admin/applications${buildUrl({ program: p, page: undefined })}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                params.program === p
                  ? "bg-brand-primary text-white"
                  : "border border-brand-secondary text-brand-cyan-blue-gray hover:text-white"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex gap-1">
          <Link
            href={`/admin/applications${buildUrl({ status: undefined, page: undefined })}`}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              !params.status
                ? "bg-brand-primary text-white"
                : "border border-brand-secondary text-brand-cyan-blue-gray hover:text-white"
            }`}
          >
            All Statuses
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/applications${buildUrl({ status: s, page: undefined })}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                params.status === s
                  ? "bg-brand-primary text-white"
                  : "border border-brand-secondary text-brand-cyan-blue-gray hover:text-white"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="mb-4 text-sm text-brand-cyan-blue-gray">
        {count} application{count !== 1 ? "s" : ""} found
      </p>

      {/* Table */}
      {applications.length === 0 ? (
        <div className="rounded-lg border border-brand-secondary bg-brand-near-black p-8 text-center text-brand-cyan-blue-gray">
          No applications match your filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-brand-secondary">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-brand-secondary bg-brand-near-black text-brand-cyan-blue-gray">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Program</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Tags</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => {
                const name = getApplicantName(app.answers);
                const email = (app.answers.email as string) || "—";

                return (
                  <tr
                    key={app.id}
                    className="border-b border-brand-secondary transition-colors last:border-0 hover:bg-brand-secondary/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/applications/${app.id}`}
                        className="font-medium text-white hover:text-brand-primary"
                      >
                        {name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-brand-cyan-blue-gray">{email}</td>
                    <td className="px-4 py-3 capitalize text-brand-light-gray">{app.program}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[app.status]}`}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-brand-cyan-blue-gray">
                      {new Date(app.submitted_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {app.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-brand-secondary px-2 py-0.5 text-xs text-brand-light-gray"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {currentPage > 1 && (
            <Link
              href={`/admin/applications${buildUrl({ page: String(currentPage - 1) })}`}
              className="rounded-lg border border-brand-secondary px-4 py-2 text-sm text-white transition-colors hover:border-brand-light-gray"
            >
              Previous
            </Link>
          )}
          <span className="px-3 text-sm text-brand-cyan-blue-gray">
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages && (
            <Link
              href={`/admin/applications${buildUrl({ page: String(currentPage + 1) })}`}
              className="rounded-lg border border-brand-secondary px-4 py-2 text-sm text-white transition-colors hover:border-brand-light-gray"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
