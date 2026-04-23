"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  useAdminApplicationsData,
  useAdminContactsData,
  useAdminPreferencesData,
} from "../admin-data-provider";
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
import type { Application } from "@/types/database";
import { type FieldRegistryEntry } from "./field-registry";
import { ColumnFilterPopover } from "./column-filter-popover";
import { ColumnSortToggle } from "./column-sort-toggle";
import { BUILTIN_COLUMN } from "./sort-helpers";
import { BulkActionBar } from "./bulk-action-bar";
import { useContactsPanelState } from "./contacts-panel-state";
import { useContactsPanelViewModel } from "./contacts-panel-view-model";
import { useDebouncedValue } from "./use-debounced-value";
import { LastActivityCell } from "./last-activity-cell";

const PAGE_SIZES = [25, 50, 150] as const;

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  [BUILTIN_COLUMN.name]: 180,
  [BUILTIN_COLUMN.submittedAt]: 140,
  [BUILTIN_COLUMN.email]: 220,
  [BUILTIN_COLUMN.phone]: 140,
  _programs: 120,
  _tags: 200,
};
const DEFAULT_FIELD_WIDTH = 320;
const DEFAULT_AGE_WIDTH = 160;
const WRAPPING_CELL_CLASS =
  "overflow-hidden whitespace-normal break-words text-sm text-muted-foreground";

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
): ReactNode {
  const entries: { program: string; value: string }[] = [];

  for (const app of contactApps) {
    const raw = app.answers?.[field.key];
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
    contactEventSummaries,
    contactsError,
    ensureContacts,
  } = useAdminContactsData();
  const { applications, ensureApplications } = useAdminApplicationsData();
  const { preferences, setPreferences, ensurePreferences } =
    useAdminPreferencesData();

  const state = useContactsPanelState({
    contacts,
    ensureApplications,
    ensureContacts,
    ensurePreferences,
    preferences,
    setPreferences,
  });
  const debouncedSearch = useDebouncedValue(state.search, 200);
  const {
    activeFields,
    categoriesById,
    currentPage,
    filtered,
    hasAnyFilter,
    paginatedRows,
    tagsById,
    totalPages,
  } = useContactsPanelViewModel({
    applications,
    contacts,
    contactTags,
    contactEventSummaries,
    tags,
    tagCategories,
    visibleColumns: state.visibleColumns,
    search: debouncedSearch,
    selectedProgram: state.selectedProgram,
    selectedTagIds: state.selectedTagIds,
    columnFilters: state.columnFilters,
    pendingFilter: (state as unknown as { pendingFilter?: ("awaiting_applicant" | "awaiting_btm")[] }).pendingFilter ?? [],
    sortBy: state.sortBy,
    page: state.page,
    pageSize: state.pageSize,
  });

  const allOnPageSelected =
    paginatedRows.length > 0 &&
    paginatedRows.every(({ contact }) => state.selectedIds.has(contact.id));
  const selectedIdsList = useMemo(
    () => [...state.selectedIds],
    [state.selectedIds],
  );
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  function handleResizeStart(columnKey: string, e: ReactMouseEvent) {
    e.preventDefault();
    const th = (e.target as HTMLElement).closest("th");
    if (!th) return;
    const startX = e.clientX;
    const startWidth = th.offsetWidth;

    function onMouseMove(ev: MouseEvent) {
      const newWidth = Math.max(80, startWidth + ev.clientX - startX);
      state.setColumnWidths((prev) => ({ ...prev, [columnKey]: newWidth }));
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      dragCleanupRef.current = null;
    }

    dragCleanupRef.current = onMouseUp;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function handleSelectAll() {
    state.setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allOnPageSelected) {
        for (const { contact } of paginatedRows) next.delete(contact.id);
      } else {
        for (const { contact } of paginatedRows) next.add(contact.id);
      }
      return next;
    });
  }

  function handleSelectOne(contactId: string) {
    state.setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
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
          search={state.search}
          selectedProgram={state.selectedProgram}
          selectedTagIds={state.selectedTagIds}
          tagCategories={tagCategories ?? []}
          tags={tags ?? []}
          visibleColumns={state.visibleColumns}
          previouslySelectedColumns={state.previouslySelectedColumns}
          onSearchChange={state.handleSearchChange}
          onProgramChange={state.handleProgramChange}
          onTagToggle={state.handleTagToggle}
          onClearTags={state.handleClearTags}
          onColumnToggle={state.handleColumnToggle}
        />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length} contact{filtered.length !== 1 ? "s" : ""} found
          {hasAnyFilter && (
            <button
              type="button"
              onClick={state.handleClearAllFilters}
              className="ml-3 rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
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
              onClick={() => {
                state.setPageSize(size);
                state.setPage(1);
                state.clearSelection();
              }}
              className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                state.pageSize === size
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
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-card text-muted-foreground">
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPageSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all on page"
                />
              </TableHead>
              {BUILTIN_SORTABLE_COLUMNS.map(({ key, label }) => {
                const width =
                  state.columnWidths[key] ?? DEFAULT_COLUMN_WIDTHS[key] ?? 160;
                return (
                  <TableHead
                    key={key}
                    className="relative overflow-hidden"
                    style={{ width }}
                  >
                    <span className="inline-flex items-center">
                      {label}
                      <ColumnSortToggle
                        active={state.sortBy?.key === key}
                        direction={
                          state.sortBy?.key === key ? state.sortBy.direction : null
                        }
                        onClick={() => state.toggleSort(key)}
                        label={label}
                      />
                    </span>
                    <div
                      className="absolute top-0 -right-px bottom-0 z-10 w-2 cursor-col-resize border-r border-border/50 hover:border-primary"
                      onMouseDown={(e) => handleResizeStart(key, e)}
                    />
                  </TableHead>
                );
              })}
              {(() => {
                const width =
                  state.columnWidths._programs ??
                  DEFAULT_COLUMN_WIDTHS._programs ??
                  120;
                return (
                  <TableHead
                    className="relative overflow-hidden"
                    style={{ width }}
                  >
                    Programs
                    <div
                      className="absolute top-0 -right-px bottom-0 z-10 w-2 cursor-col-resize border-r border-border/50 hover:border-primary"
                      onMouseDown={(e) => handleResizeStart("_programs", e)}
                    />
                  </TableHead>
                );
              })()}
              {(() => {
                const width =
                  state.columnWidths._tags ?? DEFAULT_COLUMN_WIDTHS._tags ?? 200;
                return (
                  <TableHead
                    className="relative overflow-hidden"
                    style={{ width }}
                  >
                    Tags
                    <div
                      className="absolute top-0 -right-px bottom-0 z-10 w-2 cursor-col-resize border-r border-border/50 hover:border-primary"
                      onMouseDown={(e) => handleResizeStart("_tags", e)}
                    />
                  </TableHead>
                );
              })()}
              {activeFields.map((field) => {
                const width =
                  state.columnWidths[field.key] ??
                  (field.key === "age" ? DEFAULT_AGE_WIDTH : DEFAULT_FIELD_WIDTH);
                return (
                  <TableHead
                    key={field.key}
                    className="relative overflow-hidden"
                    style={{ width }}
                  >
                    <span className="inline-flex items-center">
                      {field.label}
                      {field.type !== "date" && field.type !== "text" && (
                        <ColumnFilterPopover
                          field={field}
                          options={[
                            ...(field.canonical?.options ?? field.options),
                            "Other",
                          ]}
                          selected={state.columnFilters[field.key] ?? []}
                          onToggle={(value) =>
                            state.handleColumnFilterToggle(field.key, value)
                          }
                          onClear={() =>
                            state.handleColumnFilterClear(field.key)
                          }
                        />
                      )}
                      <ColumnSortToggle
                        active={state.sortBy?.key === field.key}
                        direction={
                          state.sortBy?.key === field.key
                            ? state.sortBy.direction
                            : null
                        }
                        onClick={() => state.toggleSort(field.key)}
                        label={field.label}
                      />
                    </span>
                    <div
                      className="absolute top-0 -right-px bottom-0 z-10 w-2 cursor-col-resize border-r border-border/50 hover:border-primary"
                      onMouseDown={(e) => handleResizeStart(field.key, e)}
                    />
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7 + activeFields.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  No contacts match your filters.
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map(
                ({
                  contact,
                  contactApplications,
                  uniquePrograms,
                  contactTagEntries,
                  derivation,
                }) => {
                  const latestApplicationPhone = contactApplications.find(
                    (application) => typeof application.answers.phone === "string",
                  )?.answers.phone;
                  const displayPhone =
                    typeof latestApplicationPhone === "string"
                      ? latestApplicationPhone
                      : contact.phone;

                  return (
                    <TableRow key={contact.id}>
                      <TableCell className="w-10">
                        <Checkbox
                          checked={state.selectedIds.has(contact.id)}
                          onCheckedChange={() => handleSelectOne(contact.id)}
                          aria-label={`Select ${contact.name}`}
                        />
                      </TableCell>
                      <TableCell className="overflow-hidden whitespace-normal break-words">
                        <Link
                          href={`/admin/contacts/${contact.id}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {contact.name}
                        </Link>
                      </TableCell>
                      <TableCell className={WRAPPING_CELL_CLASS}>
                        {contactApplications.length === 1
                          ? formatDate(contactApplications[0].submitted_at)
                          : contactApplications.length > 1
                            ? (
                                <div className="flex flex-col gap-0.5">
                                  {contactApplications.map((application) => (
                                    <div key={application.id}>
                                      <span className="text-muted-foreground/60">
                                        {application.program}:
                                      </span>{" "}
                                      {formatDate(application.submitted_at)}
                                    </div>
                                  ))}
                                </div>
                              )
                            : "—"}
                      </TableCell>
                      <TableCell className={WRAPPING_CELL_CLASS}>
                        {contact.email}
                      </TableCell>
                      <TableCell className={WRAPPING_CELL_CLASS}>
                        {displayPhone || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {uniquePrograms.map((program) => (
                            <Badge
                              key={program}
                              variant="outline"
                              className={`w-fit capitalize ${PROGRAM_BADGE_CLASS[program] ?? ""}`}
                            >
                              {program}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {contactTagEntries.map((contactTag) => {
                            const tag = tagsById.get(contactTag.tag_id);
                            if (!tag) return null;

                            const category = categoriesById.get(tag.category_id);
                            const color = category?.color ?? "blue";
                            return (
                              <Badge
                                key={contactTag.tag_id}
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
                        <TableCell
                          key={field.key}
                          className="overflow-hidden whitespace-normal text-sm text-muted-foreground"
                        >
                          <div className="line-clamp-7 break-words">
                            {field.key === "last_activity" ? (
                              <LastActivityCell derivation={derivation} />
                            ) : (
                              renderFieldValue(contactApplications, field)
                            )}
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                },
              )
            )}
          </TableBody>
        </Table>
      </div>

      {state.selectedIds.size > 0 && (
        <BulkActionBar
          selectedCount={state.selectedIds.size}
          selectedIds={selectedIdsList}
          tagCategories={tagCategories ?? []}
          tags={tags ?? []}
          onClearSelection={state.clearSelection}
        />
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {currentPage > 1 && (
            <button
              type="button"
              onClick={() => {
                state.setPage(currentPage - 1);
                state.clearSelection();
              }}
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
              onClick={() => {
                state.setPage(currentPage + 1);
                state.clearSelection();
              }}
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
