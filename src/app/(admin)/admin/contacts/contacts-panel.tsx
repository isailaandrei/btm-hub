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
import type { ProgramSlug } from "@/types/database";
import {
  getContactsTableApplicationAnswerKeys,
  type ContactListApplication,
} from "@/lib/admin/contacts/application-projection";
import type { AdminContactsInitialData } from "@/lib/data/admin-contact-list";
import { PROGRAMS } from "../applications/constants";
import { type FieldRegistryEntry } from "./field-registry";
import { ColumnFilterPopover } from "./column-filter-popover";
import { ColumnSortToggle } from "./column-sort-toggle";
import { BUILTIN_COLUMN } from "./sort-helpers";
import { BulkActionBar } from "./bulk-action-bar";
import { useContactsPanelState } from "./contacts-panel-state";
import { useContactsPanelViewModel } from "./contacts-panel-view-model";
import { useDebouncedValue } from "./use-debounced-value";
import { LastActivityCell } from "./last-activity-cell";
import { parseSocialLinkText } from "./social-links";
import { warmContactDetail } from "./[id]/contact-detail-loader";
import { shouldSoftNavigate, softNavigate } from "../admin-soft-nav";
import {
  AcademyImportSyncButton,
  AcademyImportSyncPanel,
  useAcademyImportSync,
} from "../imports/academy-import-sync";

const PAGE_SIZES = [25, 50, 150] as const;
const TABLE_SELECT_COLUMN_WIDTH = 40;

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  [BUILTIN_COLUMN.name]: 150,
  [BUILTIN_COLUMN.submittedAt]: 118,
  [BUILTIN_COLUMN.email]: 180,
  [BUILTIN_COLUMN.phone]: 120,
  _programs: 108,
  [BUILTIN_COLUMN.tags]: 200,
};
const DEFAULT_FIELD_WIDTH = 240;
const DEFAULT_AGE_WIDTH = 112;
const WRAPPING_CELL_CLASS =
  "overflow-hidden whitespace-normal break-words text-[13px] leading-5 text-muted-foreground";

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

function renderSocialLinkText(value: string): ReactNode {
  const parts = parseSocialLinkText(value);
  if (parts.length === 0) return "—";

  return parts.map((part, index) => {
    if (part.type === "text") return <span key={index}>{part.text}</span>;
    return (
      <a
        key={index}
        href={part.href}
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline-offset-2 hover:underline"
      >
        {part.text}
      </a>
    );
  });
}

function renderFieldValue(
  contactApps: ContactListApplication[],
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
  if (entries.length === 1) {
    return field.key === "online_links"
      ? renderSocialLinkText(entries[0].value)
      : entries[0].value;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {entries.map((e, i) => (
        <div key={i}>
          <span className="text-muted-foreground">{e.program}:</span>{" "}
          {field.key === "online_links" ? renderSocialLinkText(e.value) : e.value}
        </div>
      ))}
    </div>
  );
}

export function ContactsPanel({
  initialData,
  onSendEmail,
}: {
  initialData?: AdminContactsInitialData;
  onSendEmail?: (contactIds: string[]) => void;
}) {
  const {
    contacts,
    tagCategories,
    tags,
    contactTags,
    contactActivitySummaries,
    hasLoadedFullContacts,
    contactsError,
    ensureContacts,
  } = useAdminContactsData();
  const { applications, hasLoadedFullApplications, ensureAnswerKeys } =
    useAdminApplicationsData();
  const { preferences, setPreferences } = useAdminPreferencesData();
  const sync = useAcademyImportSync();
  const hasFullContactsData =
    hasLoadedFullContacts &&
    hasLoadedFullApplications &&
    contacts !== null &&
    applications !== null &&
    contactTags !== null &&
    contactActivitySummaries !== null &&
    tagCategories !== null &&
    tags !== null;
  const isHydratingFullData = Boolean(initialData) && !hasFullContactsData;
  const useInitialContactsData = isHydratingFullData;
  const effectiveContacts = useInitialContactsData
    ? (initialData?.contacts ?? null)
    : contacts;
  const effectiveApplications = useInitialContactsData
    ? (initialData?.applications ?? null)
    : applications;
  const effectiveContactTags = useInitialContactsData
    ? (initialData?.contactTags ?? null)
    : contactTags;
  const effectiveActivitySummaries = useInitialContactsData
    ? (initialData?.contactActivitySummaries ?? null)
    : contactActivitySummaries;
  const effectiveTagCategories = useInitialContactsData
    ? (initialData?.tagCategories ?? null)
    : tagCategories;
  const effectiveTags = useInitialContactsData
    ? (initialData?.tags ?? null)
    : tags;

  const state = useContactsPanelState({
    contacts: effectiveContacts,
    ensureContacts,
    preferences,
    setPreferences,
  });
  const debouncedSearch = useDebouncedValue(state.search, 200);
  const requiredApplicationAnswerKeys = useMemo(
    () =>
      getContactsTableApplicationAnswerKeys({
        columnFilters: state.columnFilters,
        sortBy: state.sortBy,
        visibleColumns: state.visibleColumns,
      }),
    [state.columnFilters, state.sortBy, state.visibleColumns],
  );

  useEffect(() => {
    ensureAnswerKeys(requiredApplicationAnswerKeys);
  }, [ensureAnswerKeys, requiredApplicationAnswerKeys]);

  const viewModelSearch = isHydratingFullData ? "" : debouncedSearch;
  const viewModelProgramFilter = isHydratingFullData ? [] : state.programFilter;
  const viewModelSelectedTagIds = isHydratingFullData ? [] : state.selectedTagIds;
  const viewModelColumnFilters = isHydratingFullData ? {} : state.columnFilters;
  const viewModelPendingFilter = isHydratingFullData ? [] : state.pendingFilter;
  const viewModelSortBy =
    isHydratingFullData && initialData?.isSortApproximateUntilHydration
      ? null
      : state.sortBy;
  const viewModelPage = isHydratingFullData ? 1 : state.page;
  const viewModelPageSize =
    isHydratingFullData && initialData
      ? initialData.pageSize
      : state.pageSize === "all"
        ? Math.max(effectiveContacts?.length ?? 1, 1)
        : state.pageSize;

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
    applications: effectiveApplications,
    contacts: effectiveContacts,
    contactTags: effectiveContactTags,
    contactActivitySummaries: effectiveActivitySummaries,
    tags: effectiveTags,
    tagCategories: effectiveTagCategories,
    visibleColumns: state.visibleColumns,
    search: viewModelSearch,
    programFilter: viewModelProgramFilter,
    selectedTagIds: viewModelSelectedTagIds,
    columnFilters: viewModelColumnFilters,
    pendingFilter: viewModelPendingFilter,
    sortBy: viewModelSortBy,
    page: viewModelPage,
    pageSize: viewModelPageSize,
  });

  const allOnPageSelected =
    paginatedRows.length > 0 &&
    paginatedRows.every(({ contact }) => state.selectedIds.has(contact.id));
  const selectedIdsList = useMemo(
    () => [...state.selectedIds],
    [state.selectedIds],
  );
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const prefetchedContactIdsRef = useRef<Set<string>>(new Set());

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

  function prefetchContactDetail(contactId: string) {
    if (prefetchedContactIdsRef.current.has(contactId)) return;
    prefetchedContactIdsRef.current.add(contactId);
    // Warm the session cache so opening the contact is instant. Best-effort:
    // on failure, allow a retry on the next hover/focus and let the panel
    // surface the error when actually opened.
    void warmContactDetail(contactId).catch(() => {
      prefetchedContactIdsRef.current.delete(contactId);
    });
  }

  const tableMinWidth = useMemo(() => {
    const builtinWidth = BUILTIN_SORTABLE_COLUMNS.reduce(
      (total, { key }) =>
        total + (state.columnWidths[key] ?? DEFAULT_COLUMN_WIDTHS[key] ?? 140),
      0,
    );
    const programsWidth =
      state.columnWidths._programs ?? DEFAULT_COLUMN_WIDTHS._programs ?? 108;
    const tagsWidth =
      state.columnWidths[BUILTIN_COLUMN.tags] ??
      DEFAULT_COLUMN_WIDTHS[BUILTIN_COLUMN.tags] ??
      200;
    const fieldWidth = activeFields.reduce(
      (total, field) =>
        total +
        (state.columnWidths[field.key] ??
          (field.key === "age" ? DEFAULT_AGE_WIDTH : DEFAULT_FIELD_WIDTH)),
      0,
    );

    return (
      TABLE_SELECT_COLUMN_WIDTH +
      builtinWidth +
      programsWidth +
      tagsWidth +
      fieldWidth
    );
  }, [activeFields, state.columnWidths]);

  if (effectiveContacts === null) {
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
    <div className={`min-w-0 ${state.selectedIds.size > 0 ? "pb-28" : ""}`}>
      <h1 className="mb-5 text-2xl font-semibold text-foreground">
        Contacts
      </h1>

      <div className="mb-4">
        <ContactsFilters
          search={state.search}
          selectedTagIds={state.selectedTagIds}
          tagCategories={effectiveTagCategories ?? []}
          tags={effectiveTags ?? []}
          visibleColumns={state.visibleColumns}
          previouslySelectedColumns={state.previouslySelectedColumns}
          pendingFilter={state.pendingFilter}
          onSearchChange={state.handleSearchChange}
          onTagToggle={state.handleTagToggle}
          onClearTags={state.handleClearTags}
          onColumnToggle={state.handleColumnToggle}
          onPendingFilterChange={state.handlePendingFilterChange}
          disabled={isHydratingFullData}
        />
      </div>

      {contactsError && initialData && !hasLoadedFullContacts && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {contactsError}
        </div>
      )}

      <div className="mb-3 grid items-center gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <p className="text-sm text-muted-foreground">
            {isHydratingFullData && initialData
              ? `${paginatedRows.length} of ${initialData.totalCount} contacts loaded`
              : `${filtered.length} contact${filtered.length !== 1 ? "s" : ""} found`}
          </p>
          <AcademyImportSyncButton controller={sync} />
          {hasAnyFilter && (
            <button
              type="button"
              onClick={state.handleClearAllFilters}
              className="rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              Clear all filters
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 justify-self-start text-sm text-muted-foreground xl:justify-self-end">
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
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                state.pageSize === size
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {size}
            </button>
          ))}
          <button
            key="all"
            type="button"
            onClick={() => {
              state.setPageSize("all");
              state.setPage(1);
              state.clearSelection();
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
              state.pageSize === "all"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >All</button>
        </div>
      </div>

      {sync.phase.kind !== "idle" && (
        <div className="mb-6">
          <AcademyImportSyncPanel controller={sync} />
        </div>
      )}

      <div
        data-testid="contacts-table-scroll"
        className="max-w-full min-w-0 overflow-x-auto rounded-lg border border-border"
      >
        <Table
          className="table-fixed text-[13px] leading-5 [&_td]:px-2.5 [&_td]:py-2 [&_th]:h-9 [&_th]:px-2.5 [&_th]:py-2"
          style={{ minWidth: tableMinWidth }}
        >
          <TableHeader>
            <TableRow className="bg-card text-muted-foreground">
              <TableHead
                className="w-10"
                style={{ width: TABLE_SELECT_COLUMN_WIDTH }}
              >
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
                    <span className="inline-flex items-center">
                      Programs
                      <ColumnFilterPopover
                        label="Programs"
                        options={[...PROGRAMS]}
                        selected={state.programFilter}
                        onToggle={(value) =>
                          state.handleProgramFilterToggle(value as ProgramSlug)
                        }
                        onClear={state.handleProgramFilterClear}
                        optionClassName="capitalize"
                      />
                    </span>
                    <div
                      className="absolute top-0 -right-px bottom-0 z-10 w-2 cursor-col-resize border-r border-border/50 hover:border-primary"
                      onMouseDown={(e) => handleResizeStart("_programs", e)}
                    />
                  </TableHead>
                );
              })()}
              {(() => {
                const width =
                  state.columnWidths[BUILTIN_COLUMN.tags] ??
                  DEFAULT_COLUMN_WIDTHS[BUILTIN_COLUMN.tags] ??
                  200;
                return (
                  <TableHead
                    className="relative overflow-hidden"
                    style={{ width }}
                  >
                    <span className="inline-flex items-center">
                      Tags
                      <ColumnSortToggle
                        active={state.sortBy?.key === BUILTIN_COLUMN.tags}
                        direction={
                          state.sortBy?.key === BUILTIN_COLUMN.tags
                            ? state.sortBy.direction
                            : null
                        }
                        onClick={() => state.toggleSort(BUILTIN_COLUMN.tags)}
                        label="Tags"
                      />
                    </span>
                    <div
                      className="absolute top-0 -right-px bottom-0 z-10 w-2 cursor-col-resize border-r border-border/50 hover:border-primary"
                      onMouseDown={(e) =>
                        handleResizeStart(BUILTIN_COLUMN.tags, e)
                      }
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
                          label={field.label}
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
                    (application) => typeof application.answers?.phone === "string",
                  )?.answers?.phone;
                  const displayPhone =
                    typeof latestApplicationPhone === "string"
                      ? latestApplicationPhone
                      : contact.phone;

                  return (
                    <TableRow key={contact.id}>
                      <TableCell
                        className="w-10"
                        style={{ width: TABLE_SELECT_COLUMN_WIDTH }}
                      >
                        <Checkbox
                          checked={state.selectedIds.has(contact.id)}
                          onCheckedChange={() => handleSelectOne(contact.id)}
                          aria-label={`Select ${contact.name}`}
                        />
                      </TableCell>
                      <TableCell className="overflow-hidden whitespace-normal break-words">
                        <Link
                          href={`/admin/contacts/${contact.id}`}
                          prefetch={false}
                          onClick={(event) => {
                            if (!shouldSoftNavigate(event)) return;
                            event.preventDefault();
                            prefetchContactDetail(contact.id);
                            softNavigate(`/admin/contacts/${contact.id}`);
                          }}
                          onFocus={() => prefetchContactDetail(contact.id)}
                          onMouseEnter={() => prefetchContactDetail(contact.id)}
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
                                      <span className="text-muted-foreground">
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
                        <a
                          href={`mailto:${contact.email}`}
                          className="text-foreground underline-offset-2 hover:underline"
                        >
                          {contact.email}
                        </a>
                      </TableCell>
                      <TableCell className={WRAPPING_CELL_CLASS}>
                        {displayPhone || "—"}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-col gap-0.5">
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
                      <TableCell className="overflow-hidden whitespace-normal">
                        <div className="flex min-w-0 flex-wrap gap-1">
                          {contactTagEntries.map((contactTag) => {
                            const tag = tagsById.get(contactTag.tag_id);
                            if (!tag) return null;

                            const category = categoriesById.get(tag.category_id);
                            const color = category?.color ?? "blue";
                            const tagLabel = category?.name
                              ? `${category.name}: ${tag.name}`
                              : tag.name;
                            return (
                              <Badge
                                key={contactTag.tag_id}
                                variant="outline"
                                className={`max-w-full ${TAG_COLOR_CLASSES[color] ?? ""}`}
                                title={tagLabel}
                              >
                                <span className="min-w-0 truncate">
                                  {tagLabel}
                                </span>
                              </Badge>
                            );
                          })}
                        </div>
                      </TableCell>
                      {activeFields.map((field) => (
                        <TableCell
                          key={field.key}
                          className="overflow-hidden whitespace-normal text-[13px] leading-5 text-muted-foreground"
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
          tagCategories={effectiveTagCategories ?? []}
          tags={effectiveTags ?? []}
          onClearSelection={state.clearSelection}
          onSendEmail={onSendEmail}
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
