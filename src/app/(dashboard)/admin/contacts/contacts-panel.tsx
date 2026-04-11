"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAdminData } from "../admin-data-provider";
import { ContactsFilters } from "./contacts-filters";
import { TAG_COLOR_CLASSES, PROGRAM_BADGE_CLASS } from "../constants";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import type { Application, ProgramSlug } from "@/types/database";
import {
  getFieldEntry,
  CURATED_FIELDS,
  type FieldRegistryEntry,
} from "./field-registry";
import { updatePreferences } from "./actions";
import { ColumnFilterPopover } from "./column-filter-popover";
import { ColumnSortToggle } from "./column-sort-toggle";
import {
  compareContacts,
  type SortState,
} from "./sort-helpers";
import { BulkActionBar } from "./bulk-action-bar";

const PAGE_SIZES = [25, 50, 150] as const;
type PageSize = (typeof PAGE_SIZES)[number];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function renderFieldValue(
  contactApps: Application[],
  field: FieldRegistryEntry,
): React.ReactNode {
  const entries: { program: string; value: string }[] = [];

  for (const app of contactApps) {
    // Top-level application fields (e.g., submitted_at) vs answers
    const raw = field.key === "submitted_at"
      ? app.submitted_at
      : app.answers[field.key];
    if (raw == null) continue;

    let display: string;
    if (field.type === "date") {
      display = formatDate(String(raw));
    } else if (Array.isArray(raw)) {
      display = raw.join(", ");
    } else {
      display = String(raw);
    }
    entries.push({ program: app.program, value: display });
  }

  if (entries.length === 0) return "—";
  if (entries.length === 1) return entries[0].value;
  return (
    <div className="flex flex-col gap-0.5">
      {entries.map((e, i) => (
        <div key={i}>
          <span className="text-muted-foreground/60">{e.program}:</span> {e.value}
        </div>
      ))}
    </div>
  );
}

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
    preferences,
    setPreferences,
    ensurePreferences,
  } = useAdminData();

  const [search, setSearch] = useState("");
  const [selectedProgram, setSelectedProgram] = useState<ProgramSlug | undefined>();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [page, setPage] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  // Columns the user has ever selected that aren't in CURATED_FIELDS —
  // these stick around in the ColumnPicker's Suggested section forever
  // so the user doesn't have to re-search for them next time.
  const [promotedColumns, setPromotedColumns] = useState<string[]>([]);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [sortBy, setSortBy] = useState<SortState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const visibleColumnsRef = useRef<string[]>([]);
  const promotedColumnsRef = useRef<string[]>([]);
  const initializedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    ensureContacts();
    ensureApplications();
  }, [ensureContacts, ensureApplications]);

  useEffect(() => {
    ensurePreferences();
  }, [ensurePreferences]);

  // Sync preferences to local state once (one-time initialization)
  useEffect(() => {
    if (initializedRef.current) return;
    const pref = preferences as {
      contacts_table?: {
        visible_columns?: string[];
        promoted_columns?: string[];
      };
    };
    const savedVisible = pref?.contacts_table?.visible_columns;
    const savedPromoted = pref?.contacts_table?.promoted_columns;
    if (Array.isArray(savedVisible)) {
      setVisibleColumns(savedVisible);
      visibleColumnsRef.current = savedVisible;
      if (Array.isArray(savedPromoted)) {
        setPromotedColumns(savedPromoted);
        promotedColumnsRef.current = savedPromoted;
      }
      initializedRef.current = true;
    }
  }, [preferences]);

  const { filtered, appsByContact } = useMemo(() => {
    const items = contacts ?? [];
    const apps = applications ?? [];
    const ctags = contactTags ?? [];

    // Precompute apps by contact
    const appsByContact = new Map<string, typeof apps>();
    for (const app of apps) {
      if (!app.contact_id) continue;
      const list = appsByContact.get(app.contact_id);
      if (list) list.push(app);
      else appsByContact.set(app.contact_id, [app]);
    }

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
        (appsByContact.get(c.id) ?? []).some((a) => a.program === selectedProgram),
      );
    }

    if (selectedTagIds.length > 0) {
      result = result.filter((c) =>
        selectedTagIds.every((tagId) =>
          ctags.some((ct) => ct.contact_id === c.id && ct.tag_id === tagId),
        ),
      );
    }

    // Column filters (application-derived fields). When a field has a
    // `canonical` normalization config (see FieldRegistryEntry), each
    // stored answer is first mapped to its canonical bucket and we match
    // against the canonical list; otherwise we match raw. "Other" catches
    // any value that falls outside the (canonical or raw) option list,
    // so free-text Other responses and unmappable legacy values surface
    // in one place without polluting the dropdown.
    const activeColumnFilters = Object.entries(columnFilters);
    if (activeColumnFilters.length > 0) {
      result = result.filter((c) => {
        const contactApps = appsByContact.get(c.id) ?? [];
        return activeColumnFilters.every(([fieldKey, values]) => {
          const field = getFieldEntry(fieldKey);
          const normalize = field?.canonical?.normalize;
          const canonicalOptions = new Set<string>(
            (field?.canonical?.options ??
              (field?.options as readonly string[] | undefined) ??
              []) as readonly string[],
          );
          const otherSelected = values.includes("Other");
          const canonicalSelected = values.filter((v) => v !== "Other");

          return contactApps.some((app) => {
            const raw = app.answers[fieldKey];
            if (raw == null) return false;
            const rawValues = Array.isArray(raw) ? raw.map(String) : [String(raw)];
            const matched = rawValues.map((v) =>
              normalize ? normalize(v) ?? v : v,
            );
            if (canonicalSelected.some((v) => matched.includes(v))) return true;
            if (otherSelected && matched.some((v) => v !== "" && !canonicalOptions.has(v))) {
              return true;
            }
            return false;
          });
        });
      });
    }

    // Sort (single-column, applied after all filters).
    if (sortBy) {
      const field = getFieldEntry(sortBy.key);
      result = [...result].sort((a, b) =>
        compareContacts(a, b, sortBy, appsByContact, field),
      );
    }

    return { filtered: result, appsByContact };
  }, [contacts, applications, contactTags, search, selectedProgram, selectedTagIds, columnFilters, sortBy]);

  const hasAnyFilter = search || selectedProgram || selectedTagIds.length > 0 || Object.keys(columnFilters).length > 0;

  const totalPages = Math.ceil(filtered.length / pageSize);
  const currentPage = Math.min(page, Math.max(totalPages, 1));
  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function onFilterChange<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
      clearSelection();
    };
  }

  function handleTagToggle(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
    setPage(1);
    clearSelection();
  }

  function handleClearTags() {
    setSelectedTagIds([]);
    setPage(1);
    clearSelection();
  }

  function handleColumnToggle(key: string) {
    // Compute next visible state from the ref (source of truth for the
    // debounced save below) and mirror it to React state for rendering.
    const wasVisible = visibleColumnsRef.current.includes(key);
    const isEnabling = !wasVisible;
    const nextVisible = wasVisible
      ? visibleColumnsRef.current.filter((k) => k !== key)
      : [...visibleColumnsRef.current, key];
    visibleColumnsRef.current = nextVisible;
    setVisibleColumns(nextVisible);

    // Permanently promote non-curated columns into the Suggested list on
    // enable, so the user doesn't have to re-search for them next time.
    // Never remove from promoted on deselect — the whole point is that
    // once the user has looked for a column, it stays within easy reach.
    const isCurated = CURATED_FIELDS.some((f) => f.key === key);
    if (
      isEnabling &&
      !isCurated &&
      !promotedColumnsRef.current.includes(key)
    ) {
      const nextPromoted = [...promotedColumnsRef.current, key];
      promotedColumnsRef.current = nextPromoted;
      setPromotedColumns(nextPromoted);
    }

    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const columns = visibleColumnsRef.current;
      const promoted = promotedColumnsRef.current;
      try {
        await updatePreferences({
          contacts_table: {
            visible_columns: columns,
            promoted_columns: promoted,
          },
        });
        // Update provider state so tab remounts get the latest value
        setPreferences((prev) => ({
          ...prev,
          contacts_table: {
            visible_columns: columns,
            promoted_columns: promoted,
          },
        }));
      } catch {
        toast.error("Failed to save column preferences.");
      }
    }, 1000);
  }

  function handleColumnFilterToggle(fieldKey: string, value: string) {
    setColumnFilters((prev) => {
      const current = prev[fieldKey] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (next.length === 0) {
        const { [fieldKey]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [fieldKey]: next };
    });
    setPage(1);
    clearSelection();
  }

  function handleColumnFilterClear(fieldKey: string) {
    setColumnFilters((prev) => {
      const { [fieldKey]: _, ...rest } = prev;
      return rest;
    });
    setPage(1);
    clearSelection();
  }

  function toggleSort(key: string) {
    setSortBy((prev) => {
      if (!prev || prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return null;
    });
    setPage(1);
    clearSelection();
  }

  function handleClearAllFilters() {
    setSearch("");
    setSelectedProgram(undefined);
    setSelectedTagIds([]);
    setColumnFilters({});
    setPage(1);
    clearSelection();
  }

  const allOnPageSelected = paginated.length > 0 && paginated.every((c) => selectedIds.has(c.id));

  function handleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const c of paginated) next.delete(c.id);
      } else {
        for (const c of paginated) next.add(c.id);
      }
      return next;
    });
  }

  function handleSelectOne(contactId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  const activeFields = useMemo(
    () => visibleColumns.map(getFieldEntry).filter((f): f is FieldRegistryEntry => f !== undefined),
    [visibleColumns],
  );

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
          visibleColumns={visibleColumns}
          promotedColumns={promotedColumns}
          onSearchChange={onFilterChange(setSearch)}
          onProgramChange={onFilterChange(setSelectedProgram)}
          onTagToggle={handleTagToggle}
          onClearTags={handleClearTags}
          onColumnToggle={handleColumnToggle}
        />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length} contact{filtered.length !== 1 ? "s" : ""} found
          {hasAnyFilter && (
            <button
              type="button"
              onClick={handleClearAllFilters}
              className="ml-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear all filters
            </button>
          )}
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Show</span>
          {PAGE_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => { setPageSize(size); setPage(1); clearSelection(); }}
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

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-card text-muted-foreground">
                <TableHead className="w-10">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all on page"
                  />
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center">
                    Name
                    <ColumnSortToggle
                      active={sortBy?.key === "name"}
                      direction={sortBy?.key === "name" ? sortBy.direction : null}
                      onClick={() => toggleSort("name")}
                      label="Name"
                    />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center">
                    Submitted
                    <ColumnSortToggle
                      active={sortBy?.key === "submitted_at"}
                      direction={sortBy?.key === "submitted_at" ? sortBy.direction : null}
                      onClick={() => toggleSort("submitted_at")}
                      label="Submitted"
                    />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center">
                    Email
                    <ColumnSortToggle
                      active={sortBy?.key === "email"}
                      direction={sortBy?.key === "email" ? sortBy.direction : null}
                      onClick={() => toggleSort("email")}
                      label="Email"
                    />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center">
                    Phone
                    <ColumnSortToggle
                      active={sortBy?.key === "phone"}
                      direction={sortBy?.key === "phone" ? sortBy.direction : null}
                      onClick={() => toggleSort("phone")}
                      label="Phone"
                    />
                  </span>
                </TableHead>
                <TableHead>Programs</TableHead>
                <TableHead>Tags</TableHead>
                {activeFields.map((field) => (
                  <TableHead key={field.key}>
                    <span className="inline-flex items-center">
                      {field.label}
                      {field.type !== "date" && (
                        <ColumnFilterPopover
                          field={field}
                          options={[...(field.canonical?.options ?? field.options), "Other"]}
                          selected={columnFilters[field.key] ?? []}
                          onToggle={(v) => handleColumnFilterToggle(field.key, v)}
                          onClear={() => handleColumnFilterClear(field.key)}
                        />
                      )}
                      <ColumnSortToggle
                        active={sortBy?.key === field.key}
                        direction={sortBy?.key === field.key ? sortBy.direction : null}
                        onClick={() => toggleSort(field.key)}
                        label={field.label}
                      />
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7 + activeFields.length}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No contacts match your filters.
                  </TableCell>
                </TableRow>
              ) : (
              paginated.map((contact) => {
                const contactApps = appsByContact.get(contact.id) ?? [];
                const uniquePrograms = [
                  ...new Set(contactApps.map((a) => a.program)),
                ];

                const contactTagEntries = (contactTags ?? []).filter(
                  (ct) => ct.contact_id === contact.id,
                );

                return (
                  <TableRow key={contact.id}>
                    <TableCell className="w-10">
                      <Checkbox
                        checked={selectedIds.has(contact.id)}
                        onCheckedChange={() => handleSelectOne(contact.id)}
                        aria-label={`Select ${contact.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/contacts/${contact.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {contact.name}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {contactApps.length === 1
                        ? formatDate(contactApps[0].submitted_at)
                        : contactApps.length > 1
                          ? (<div className="flex flex-col gap-0.5">
                              {contactApps.map((a) => (
                                <div key={a.id}>
                                  <span className="text-muted-foreground/60">{a.program}:</span> {formatDate(a.submitted_at)}
                                </div>
                              ))}
                            </div>)
                          : "—"}
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
                    {activeFields.map((field) => (
                      <TableCell key={field.key} className="whitespace-nowrap text-sm text-muted-foreground">
                        {renderFieldValue(contactApps, field)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
              )}
            </TableBody>
          </Table>
        </div>

      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          selectedIds={[...selectedIds]}
          tagCategories={tagCategories ?? []}
          tags={tags ?? []}
          onClearSelection={clearSelection}
        />
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {currentPage > 1 && (
            <button
              type="button"
              onClick={() => { setPage(currentPage - 1); clearSelection(); }}
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
              onClick={() => { setPage(currentPage + 1); clearSelection(); }}
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
