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
  type FieldRegistryEntry,
} from "./field-registry";
import { updatePreferences } from "./actions";
import { ColumnFilterPopover } from "./column-filter-popover";
import { ColumnSortToggle } from "./column-sort-toggle";
import {
  compareContacts,
  BUILTIN_COLUMN,
  type SortState,
} from "./sort-helpers";
import { BulkActionBar } from "./bulk-action-bar";

const PAGE_SIZES = [25, 50, 150] as const;
type PageSize = (typeof PAGE_SIZES)[number];

const BUILTIN_SORTABLE_COLUMNS: { key: string; label: string }[] = [
  { key: BUILTIN_COLUMN.name, label: "Name" },
  { key: BUILTIN_COLUMN.submittedAt, label: "Submitted" },
  { key: BUILTIN_COLUMN.email, label: "Email" },
  { key: BUILTIN_COLUMN.phone, label: "Phone" },
];

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
  // Every column the user has ever toggled on (including ones they later
  // deselected). Used to populate the ColumnPicker's "Previously selected"
  // section so the user sees their working set above the full alphabetical
  // list of every available column. Write-once per column — we never
  // remove from this set.
  const [previouslySelectedColumns, setPreviouslySelectedColumns] = useState<
    string[]
  >([]);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [sortBy, setSortBy] = useState<SortState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const visibleColumnsRef = useRef<string[]>([]);
  const previouslySelectedColumnsRef = useRef<string[]>([]);
  // `null` until the one-time preferences sync has run; `true` afterwards.
  // React 19's react-hooks/refs rule allows render-time ref writes only
  // via this `if (ref.current == null)` lazy-init pattern.
  const initializedRef = useRef<true | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    ensureContacts();
    ensureApplications();
  }, [ensureContacts, ensureApplications]);

  useEffect(() => {
    ensurePreferences();
  }, [ensurePreferences]);

  // Prevent a stale debounced save from firing after the component unmounts.
  useEffect(() => {
    return () => clearTimeout(saveTimeoutRef.current);
  }, []);

  // One-time sync from preferences context into local state as soon as
  // the context value has settable data. Uses React 19's ref lazy-init
  // pattern (`if (ref.current == null)`) to satisfy react-hooks/refs
  // while allowing the setState calls to run during render. The check
  // re-runs on every render until preferences is populated, at which
  // point initializedRef flips and subsequent renders skip the block.
  if (initializedRef.current == null) {
    const pref = preferences as {
      contacts_table?: {
        visible_columns?: string[];
        previously_selected_columns?: string[];
      };
    };
    const savedVisible = pref?.contacts_table?.visible_columns;
    if (Array.isArray(savedVisible)) {
      const savedPrev = pref?.contacts_table?.previously_selected_columns;
      // Fall back to `visible_columns` so the Previously-selected section
      // isn't empty on existing users' first post-upgrade picker open.
      const initialPrev = Array.isArray(savedPrev) ? savedPrev : savedVisible;
      setVisibleColumns(savedVisible);
      setPreviouslySelectedColumns(initialPrev);
      initializedRef.current = true;
    }
  }

  // Mirror state → refs after commit, so the debounced save in
  // persistColumnPreferences (which fires from a setTimeout 1s later)
  // always reads committed values. Event handlers still write the refs
  // synchronously before calling setState so that subsequent reads
  // within the same handler see the updated value without waiting for
  // the effect to flush.
  useEffect(() => {
    visibleColumnsRef.current = visibleColumns;
  }, [visibleColumns]);
  useEffect(() => {
    previouslySelectedColumnsRef.current = previouslySelectedColumns;
  }, [previouslySelectedColumns]);

  // Rebuilt only when the applications list itself changes — not on
  // search/filter/sort, which don't affect this grouping.
  const appsByContact = useMemo(() => {
    const map = new Map<string, Application[]>();
    for (const app of applications ?? []) {
      if (!app.contact_id) continue;
      const list = map.get(app.contact_id);
      if (list) list.push(app);
      else map.set(app.contact_id, [app]);
    }
    return map;
  }, [applications]);

  const filtered = useMemo(() => {
    const items = contacts ?? [];
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

    // Column filters: precompute per-filter metadata (field entry, normalizer,
    // canonical option set, selected-value partitions) ONCE per active filter,
    // not per contact. Previously this ran inside the contact loop — O(contacts
    // × active_filters) field lookups and Set allocations — now it's O(filters).
    const activeColumnFilters = Object.entries(columnFilters);
    if (activeColumnFilters.length > 0) {
      const precomputed = activeColumnFilters.map(([fieldKey, values]) => {
        const field = getFieldEntry(fieldKey);
        const canonicalOptions = new Set<string>(
          (field?.canonical?.options ??
            (field?.options as readonly string[] | undefined) ??
            []) as readonly string[],
        );
        return {
          fieldKey,
          normalize: field?.canonical?.normalize,
          canonicalOptions,
          otherSelected: values.includes("Other"),
          canonicalSelected: values.filter((v) => v !== "Other"),
        };
      });

      result = result.filter((c) => {
        const contactApps = appsByContact.get(c.id) ?? [];
        return precomputed.every(
          ({ fieldKey, normalize, canonicalOptions, otherSelected, canonicalSelected }) =>
            contactApps.some((app) => {
              const raw = app.answers[fieldKey];
              if (raw == null) return false;
              const rawValues = Array.isArray(raw) ? raw.map(String) : [String(raw)];
              const matched = rawValues.map((v) =>
                normalize ? normalize(v) ?? v : v,
              );
              if (canonicalSelected.some((v) => matched.includes(v))) return true;
              if (
                otherSelected &&
                matched.some((v) => v !== "" && !canonicalOptions.has(v))
              ) {
                return true;
              }
              return false;
            }),
        );
      });
    }

    if (sortBy) {
      const field = getFieldEntry(sortBy.key);
      result = [...result].sort((a, b) =>
        compareContacts(a, b, sortBy, appsByContact, field),
      );
    }

    return result;
  }, [contacts, contactTags, search, selectedProgram, selectedTagIds, columnFilters, sortBy, appsByContact]);

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

  function persistColumnPreferences() {
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const columns = visibleColumnsRef.current;
      const prev = previouslySelectedColumnsRef.current;
      try {
        await updatePreferences({
          contacts_table: {
            visible_columns: columns,
            previously_selected_columns: prev,
          },
        });
        // Update provider state so tab remounts get the latest value
        setPreferences((prior) => ({
          ...prior,
          contacts_table: {
            visible_columns: columns,
            previously_selected_columns: prev,
          },
        }));
      } catch {
        toast.error("Failed to save column preferences.");
      }
    }, 1000);
  }

  function handleColumnToggle(key: string) {
    // Compute next visible state from the ref (source of truth for the
    // debounced save) and mirror it to React state for rendering.
    const wasVisible = visibleColumnsRef.current.includes(key);
    const nextVisible = wasVisible
      ? visibleColumnsRef.current.filter((k) => k !== key)
      : [...visibleColumnsRef.current, key];
    visibleColumnsRef.current = nextVisible;
    setVisibleColumns(nextVisible);

    // Write-once: the first time the user selects a column, add it to
    // the Previously selected set. Never remove — the whole point is
    // that the user keeps seeing columns they've touched before.
    if (
      !wasVisible &&
      !previouslySelectedColumnsRef.current.includes(key)
    ) {
      const nextPrev = [...previouslySelectedColumnsRef.current, key];
      previouslySelectedColumnsRef.current = nextPrev;
      setPreviouslySelectedColumns(nextPrev);
    }

    persistColumnPreferences();
  }

  function handleColumnFilterToggle(fieldKey: string, value: string) {
    setColumnFilters((prev) => {
      const current = prev[fieldKey] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (next.length === 0) {
        const rest = { ...prev };
        delete rest[fieldKey];
        return rest;
      }
      return { ...prev, [fieldKey]: next };
    });
    setPage(1);
    clearSelection();
  }

  function handleColumnFilterClear(fieldKey: string) {
    setColumnFilters((prev) => {
      const rest = { ...prev };
      delete rest[fieldKey];
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
          previouslySelectedColumns={previouslySelectedColumns}
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
                {BUILTIN_SORTABLE_COLUMNS.map(({ key, label }) => (
                  <TableHead key={key}>
                    <span className="inline-flex items-center">
                      {label}
                      <ColumnSortToggle
                        active={sortBy?.key === key}
                        direction={sortBy?.key === key ? sortBy.direction : null}
                        onClick={() => toggleSort(key)}
                        label={label}
                      />
                    </span>
                  </TableHead>
                ))}
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
