"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAdminData } from "../admin-data-provider";
import { ContactsFilters } from "./contacts-filters";
import { TAG_COLOR_CLASSES } from "../tags/tags-panel";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import type { ProgramSlug } from "@/types/database";

const PAGE_SIZES = [25, 50, 150] as const;
type PageSize = (typeof PAGE_SIZES)[number];

const PROGRAM_BADGE_CLASS: Record<string, string> = {
  filmmaking: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  photography: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  freediving: "border-teal-500/40 bg-teal-500/10 text-teal-400",
  internship: "border-purple-500/40 bg-purple-500/10 text-purple-400",
};

export function ContactsPanel() {
  const {
    contacts,
    tagCategories,
    tags,
    contactTags,
    applications,
    contactsError,
    ensureContacts,
    ensureApplications,
  } = useAdminData();

  const [search, setSearch] = useState("");
  const [selectedProgram, setSelectedProgram] = useState<ProgramSlug | undefined>();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [page, setPage] = useState(1);

  useEffect(() => {
    ensureContacts();
    ensureApplications();
  }, [ensureContacts, ensureApplications]);

  const filtered = useMemo(() => {
    const items = contacts ?? [];
    const apps = applications ?? [];
    const ctags = contactTags ?? [];

    let result = items;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q),
      );
    }

    if (selectedProgram) {
      result = result.filter((c) =>
        apps.some((a) => a.contact_id === c.id && a.program === selectedProgram),
      );
    }

    if (selectedTagIds.length > 0) {
      result = result.filter((c) =>
        selectedTagIds.every((tagId) =>
          ctags.some((ct) => ct.contact_id === c.id && ct.tag_id === tagId),
        ),
      );
    }

    return result;
  }, [contacts, applications, contactTags, search, selectedProgram, selectedTagIds]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const currentPage = Math.min(page, Math.max(totalPages, 1));
  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  function onFilterChange<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  function handleTagToggle(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
    setPage(1);
  }

  function handleClearTags() {
    setSelectedTagIds([]);
    setPage(1);
  }

  if (contacts === null) {
    if (contactsError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/50 bg-destructive/5 p-12 text-center">
          <p className="text-sm font-medium text-destructive">{contactsError}</p>
          <button
            type="button"
            onClick={() => ensureContacts()}
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
        </div>
        <div className="mb-4 h-5 w-32 rounded bg-muted" />
        <div className="rounded-lg border border-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-4 border-b border-border px-4 py-4 last:border-0"
            >
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-4 w-28 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-32 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-[length:var(--font-size-h2)] font-medium text-foreground">
        Contacts
      </h1>

      <div className="mb-6">
        <ContactsFilters
          search={search}
          selectedProgram={selectedProgram}
          selectedTagIds={selectedTagIds}
          tagCategories={tagCategories ?? []}
          tags={tags ?? []}
          onSearchChange={onFilterChange(setSearch)}
          onProgramChange={onFilterChange(setSelectedProgram)}
          onTagToggle={handleTagToggle}
          onClearTags={handleClearTags}
        />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length} contact{filtered.length !== 1 ? "s" : ""} found
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Show</span>
          {PAGE_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => { setPageSize(size); setPage(1); }}
              className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                pageSize === size
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {paginated.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          No contacts match your filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-card text-muted-foreground">
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Programs</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((contact) => {
                const contactApps = (applications ?? []).filter(
                  (a) => a.contact_id === contact.id,
                );
                const uniquePrograms = [
                  ...new Set(contactApps.map((a) => a.program)),
                ];

                const contactTagEntries = (contactTags ?? []).filter(
                  (ct) => ct.contact_id === contact.id,
                );

                return (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <Link
                        href={`/admin/contacts/${contact.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {contact.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.phone || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {uniquePrograms.map((program) => (
                          <Badge
                            key={program}
                            variant="outline"
                            className={`capitalize ${PROGRAM_BADGE_CLASS[program] ?? ""}`}
                          >
                            {program}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {contactTagEntries.map((ct) => {
                          const tag = (tags ?? []).find((t) => t.id === ct.tag_id);
                          if (!tag) return null;
                          const category = (tagCategories ?? []).find(
                            (c) => c.id === tag.category_id,
                          );
                          const color = category?.color ?? "blue";
                          return (
                            <Badge
                              key={ct.tag_id}
                              variant="outline"
                              className={TAG_COLOR_CLASSES[color] ?? ""}
                            >
                              {category?.name}: {tag.name}
                            </Badge>
                          );
                        })}
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
