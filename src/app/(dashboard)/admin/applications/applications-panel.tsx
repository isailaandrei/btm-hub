"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAdminData } from "../admin-data-provider";
import { getApplicantName } from "@/lib/data/applicant-name";
import type { ApplicationStatus, ProgramSlug } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { STATUS_BADGE_CLASS } from "./constants";
import { ApplicationFilters } from "./filters";

const PAGE_SIZE = 20;

export function ApplicationsPanel() {
  const { applications, appsError, ensureApplications } = useAdminData();

  const [program, setProgram] = useState<ProgramSlug | undefined>();
  const [status, setStatus] = useState<ApplicationStatus | undefined>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const items = applications ?? [];

    let result = items;
    if (program) result = result.filter((a) => a.program === program);
    if (status) result = result.filter((a) => a.status === status);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((a) => {
        const name = getApplicantName(a.answers, "").toLowerCase();
        const email = ((a.answers.email as string) || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }

    return result;
  }, [applications, program, status, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(totalPages, 1));
  const paginated = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function onFilterChange(setter: (v: any) => void) {
    return (value: any) => {
      setter(value);
      setPage(1);
    };
  }

  if (applications === null) {
    if (appsError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/50 bg-destructive/5 p-12 text-center">
          <p className="text-sm font-medium text-destructive">{appsError}</p>
          <button
            type="button"
            onClick={() => ensureApplications()}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Retry
          </button>
        </div>
      );
    }

    return (
      <div className="animate-pulse">
        <div className="mb-6 h-8 w-48 rounded bg-muted" />
        <div className="mb-6 flex gap-3">
          <div className="h-10 w-64 rounded bg-muted" />
          <div className="h-10 w-44 rounded bg-muted" />
          <div className="h-10 w-40 rounded bg-muted" />
        </div>
        <div className="mb-4 h-5 w-32 rounded bg-muted" />
        <div className="rounded-lg border border-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b border-border px-4 py-4 last:border-0">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-[length:var(--font-size-h2)] font-medium text-foreground">
        Applications
      </h1>

      <div className="mb-6">
        <ApplicationFilters
          program={program}
          status={status}
          search={search}
          onProgramChange={onFilterChange(setProgram)}
          onStatusChange={onFilterChange(setStatus)}
          onSearchChange={onFilterChange(setSearch)}
        />
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        {filtered.length} application{filtered.length !== 1 ? "s" : ""} found
      </p>

      {paginated.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          No applications match your filters.
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-card text-muted-foreground">
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((app) => {
                const name = getApplicantName(app.answers);
                const email = (app.answers.email as string) || "—";

                return (
                  <TableRow key={app.id}>
                    <TableCell>
                      <Link
                        href={`/admin/applications/${app.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{email}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{app.program}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`capitalize ${STATUS_BADGE_CLASS[app.status]}`}
                      >
                        {app.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(app.submitted_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {app.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {currentPage > 1 && (
            <button
              type="button"
              onClick={() => setPage(currentPage - 1)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors hover:border-border"
            >
              Previous
            </button>
          )}
          <span className="px-3 text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages && (
            <button
              type="button"
              onClick={() => setPage(currentPage + 1)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors hover:border-border"
            >
              Next
            </button>
          )}
        </div>
      )}
    </div>
  );
}
