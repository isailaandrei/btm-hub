"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import type { Contact, ProgramSlug } from "@/types/database";
import { updatePreferences } from "./actions";
import { pruneSelectedIds } from "./selection-helpers";
import { BUILTIN_COLUMN, type SortState } from "./sort-helpers";
import type { PendingFilterValue } from "./pending-filter";
import {
  CONTACTS_TABLE_PAGE_SIZES,
  readContactsTablePreferences,
  type ContactsTablePageSize,
} from "@/lib/admin/contacts/preferences";

const FILTERS_STORAGE_KEY = "btm-admin-contacts-filters";
const DEFAULT_CONTACTS_SORT: SortState = {
  key: BUILTIN_COLUMN.submittedAt,
  direction: "desc",
};

type PersistedPageSize = ContactsTablePageSize;
type PageSize = ContactsTablePageSize | "all";

type StoredFilters = {
  search?: string;
  selectedProgram?: ProgramSlug;
  programFilter?: ProgramSlug[];
  selectedTagIds?: string[];
  columnFilters?: Record<string, string[]>;
  pendingFilter?: PendingFilterValue[];
  sortBy?: SortState | null;
  pageSize?: PageSize;
  page?: number;
  columnWidths?: Record<string, number>;
};

function isContactsTablePageSize(value: unknown): value is PersistedPageSize {
  return (
    typeof value === "number" &&
    (CONTACTS_TABLE_PAGE_SIZES as readonly number[]).includes(value)
  );
}

function readStoredFilters(): StoredFilters {
  if (typeof window === "undefined") return {};

  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredFilters) : {};
  } catch {
    return {};
  }
}

interface UseContactsPanelStateArgs {
  contacts: Contact[] | null;
  ensureContacts: () => void;
  preferences: Record<string, unknown>;
  setPreferences: Dispatch<SetStateAction<Record<string, unknown>>>;
}

export function useContactsPanelState({
  contacts,
  ensureContacts,
  preferences,
  setPreferences,
}: UseContactsPanelStateArgs) {
  const [storedFilters, setStoredFilters] = useState<StoredFilters>({});
  const [hasLoadedStoredFilters, setHasLoadedStoredFilters] = useState(false);
  const [initialContactsTablePreferences] = useState(() =>
    readContactsTablePreferences(preferences),
  );
  // Server-provided preferences are available synchronously (identical on
  // server and client first render), so saved columns must be part of the
  // initial paint — applying them post-mount shifts the table rows (CLS).
  const initialVisibleColumns =
    initialContactsTablePreferences.visible_columns ?? [];
  const initialPreviouslySelectedColumns =
    initialContactsTablePreferences.previously_selected_columns ??
    initialVisibleColumns;

  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState<ProgramSlug[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [pendingFilter, setPendingFilter] = useState<PendingFilterValue[]>(
    [],
  );
  const [pageSize, setPageSizeState] = useState<PageSize>(
    initialContactsTablePreferences.page_size ?? 25,
  );
  const [page, setPage] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    initialVisibleColumns,
  );
  const [previouslySelectedColumns, setPreviouslySelectedColumns] = useState<
    string[]
  >(initialPreviouslySelectedColumns);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>(
    {},
  );
  const [sortBy, setSortBy] = useState<SortState | null>(
    initialContactsTablePreferences.sort_by ?? DEFAULT_CONTACTS_SORT,
  );
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const visibleColumnsRef = useRef<string[]>(initialVisibleColumns);
  const previouslySelectedColumnsRef = useRef<string[]>(
    initialPreviouslySelectedColumns,
  );
  const sortByRef = useRef<SortState | null>(sortBy);
  const pageSizeRef = useRef<PageSize>(pageSize);
  const legacySortPageWriteThroughRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const queuedPreferencePatchRef = useRef<{
    visibleColumns?: string[];
    previouslySelectedColumns?: string[];
    sortBy?: SortState | null;
    pageSize?: PersistedPageSize;
  } | null>(null);
  const isSavingPreferencesRef = useRef(false);
  const preferenceSaveAttemptRef = useRef(0);
  const latestAppliedPreferenceSaveRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    const nextStoredFilters = readStoredFilters();
    setStoredFilters(nextStoredFilters);
    setSearch(nextStoredFilters.search ?? "");
    setProgramFilter(
      nextStoredFilters.programFilter ??
        (nextStoredFilters.selectedProgram
          ? [nextStoredFilters.selectedProgram]
          : []),
    );
    setSelectedTagIds(nextStoredFilters.selectedTagIds ?? []);
    setPendingFilter(nextStoredFilters.pendingFilter ?? []);
    setPage(nextStoredFilters.page ?? 1);
    setColumnFilters(nextStoredFilters.columnFilters ?? {});
    setColumnWidths(nextStoredFilters.columnWidths ?? {});

    if (nextStoredFilters.pageSize === "all") {
      pageSizeRef.current = "all";
      setPageSizeState("all");
    } else if (
      initialContactsTablePreferences.page_size === undefined &&
      isContactsTablePageSize(nextStoredFilters.pageSize)
    ) {
      pageSizeRef.current = nextStoredFilters.pageSize;
      setPageSizeState(nextStoredFilters.pageSize);
    }

    if (
      initialContactsTablePreferences.sort_by === undefined &&
      nextStoredFilters.sortBy !== undefined
    ) {
      sortByRef.current = nextStoredFilters.sortBy;
      setSortBy(nextStoredFilters.sortBy);
    }

    setHasLoadedStoredFilters(true);
  }, [
    initialContactsTablePreferences.page_size,
    initialContactsTablePreferences.sort_by,
  ]);

  useEffect(() => {
    ensureContacts();
  }, [ensureContacts]);

  useEffect(() => {
    if (!contacts) return;

    const validContactIds = new Set(contacts.map((contact) => contact.id));
    setSelectedIds((previous) => pruneSelectedIds(previous, validContactIds));
  }, [contacts]);

  useEffect(() => {
    if (!hasLoadedStoredFilters) return;

    try {
      localStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          search,
          programFilter,
          selectedTagIds,
          columnFilters,
          pendingFilter,
          sortBy,
          pageSize,
          page,
          columnWidths,
        }),
      );
    } catch {
      /* localStorage unavailable */
    }
  }, [
    columnFilters,
    columnWidths,
    hasLoadedStoredFilters,
    page,
    pageSize,
    pendingFilter,
    programFilter,
    search,
    selectedTagIds,
    sortBy,
  ]);

  useEffect(() => {
    visibleColumnsRef.current = visibleColumns;
  }, [visibleColumns]);

  useEffect(() => {
    previouslySelectedColumnsRef.current = previouslySelectedColumns;
  }, [previouslySelectedColumns]);

  useEffect(() => {
    sortByRef.current = sortBy;
  }, [sortBy]);

  useEffect(() => {
    pageSizeRef.current = pageSize;
  }, [pageSize]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const drainPreferenceSaveQueue = useCallback(async () => {
    if (isSavingPreferencesRef.current) return;
    isSavingPreferencesRef.current = true;

    try {
      while (queuedPreferencePatchRef.current) {
        const patch = queuedPreferencePatchRef.current;
        queuedPreferencePatchRef.current = null;
        const attemptId = ++preferenceSaveAttemptRef.current;

        const contactsTablePatch: {
          visible_columns?: string[];
          previously_selected_columns?: string[];
          sort_by?: SortState | null;
          page_size?: PersistedPageSize;
        } = {};

        if (patch.visibleColumns !== undefined) {
          contactsTablePatch.visible_columns = patch.visibleColumns;
        }
        if (patch.previouslySelectedColumns !== undefined) {
          contactsTablePatch.previously_selected_columns =
            patch.previouslySelectedColumns;
        }
        if (patch.sortBy !== undefined) {
          contactsTablePatch.sort_by = patch.sortBy;
        }
        if (patch.pageSize !== undefined) {
          contactsTablePatch.page_size = patch.pageSize;
        }

        try {
          await updatePreferences({
            contacts_table: contactsTablePatch,
          });

          if (!isMountedRef.current) continue;
          if (attemptId < latestAppliedPreferenceSaveRef.current) continue;

          latestAppliedPreferenceSaveRef.current = attemptId;
          setPreferences((prior) => ({
            ...prior,
            contacts_table: {
              ...((prior.contacts_table &&
              typeof prior.contacts_table === "object" &&
              !Array.isArray(prior.contacts_table))
                ? prior.contacts_table
                : {}),
              ...contactsTablePatch,
            },
          }));
        } catch {
          toast.error("Failed to save contacts table preferences.");
        }
      }
    } finally {
      isSavingPreferencesRef.current = false;
      if (queuedPreferencePatchRef.current) {
        void drainPreferenceSaveQueue();
      }
    }
  }, [setPreferences]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const schedulePreferencePatchSave = useCallback((patch: {
    visibleColumns?: string[];
    previouslySelectedColumns?: string[];
    sortBy?: SortState | null;
    pageSize?: PersistedPageSize;
  }) => {
    clearTimeout(saveTimeoutRef.current);
    queuedPreferencePatchRef.current = {
      ...(queuedPreferencePatchRef.current ?? {}),
      ...patch,
    };
    saveTimeoutRef.current = setTimeout(() => {
      void drainPreferenceSaveQueue();
    }, 1000);
  }, [drainPreferenceSaveQueue]);

  const scheduleColumnPreferencesSave = useCallback(() => {
    schedulePreferencePatchSave({
      visibleColumns: visibleColumnsRef.current,
      previouslySelectedColumns: previouslySelectedColumnsRef.current,
    });
  }, [schedulePreferencePatchSave]);

  const scheduleSortPagePreferencesSave = useCallback(() => {
    const pageSize = pageSizeRef.current;
    schedulePreferencePatchSave({
      sortBy: sortByRef.current,
      ...(isContactsTablePageSize(pageSize) ? { pageSize } : {}),
    });
  }, [schedulePreferencePatchSave]);

  useEffect(() => {
    if (!hasLoadedStoredFilters) return;
    if (legacySortPageWriteThroughRef.current) return;
    legacySortPageWriteThroughRef.current = true;

    const contactsTable = readContactsTablePreferences(preferences);
    const patch: {
      sortBy?: SortState | null;
      pageSize?: PersistedPageSize;
    } = {};

    if (contactsTable.sort_by === undefined && storedFilters.sortBy !== undefined) {
      patch.sortBy = storedFilters.sortBy;
    }
    if (
      contactsTable.page_size === undefined &&
      isContactsTablePageSize(storedFilters.pageSize)
    ) {
      patch.pageSize = storedFilters.pageSize;
    }

    if (patch.sortBy !== undefined || patch.pageSize !== undefined) {
      schedulePreferencePatchSave(patch);
    }
  }, [
    hasLoadedStoredFilters,
    preferences,
    schedulePreferencePatchSave,
    storedFilters,
  ]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const handleProgramFilterToggle = useCallback((program: ProgramSlug) => {
    setProgramFilter((previous) =>
      previous.includes(program)
        ? previous.filter((p) => p !== program)
        : [...previous, program],
    );
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const handleProgramFilterClear = useCallback(() => {
    setProgramFilter([]);
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const handleTagToggle = useCallback((tagId: string) => {
    setSelectedTagIds((previous) =>
      previous.includes(tagId)
        ? previous.filter((id) => id !== tagId)
        : [...previous, tagId],
    );
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const handleClearTags = useCallback(() => {
    setSelectedTagIds([]);
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const handlePendingFilterChange = useCallback(
    (next: PendingFilterValue[]) => {
      setPendingFilter(next);
      setPage(1);
      clearSelection();
    },
    [clearSelection],
  );

  const handleColumnToggle = useCallback((key: string) => {
    const wasVisible = visibleColumnsRef.current.includes(key);
    const nextVisible = wasVisible
      ? visibleColumnsRef.current.filter((columnKey) => columnKey !== key)
      : [...visibleColumnsRef.current, key];

    visibleColumnsRef.current = nextVisible;
    setVisibleColumns(nextVisible);

    if (wasVisible) {
      setColumnFilters((previous) => {
        if (!(key in previous)) return previous;
        const next = { ...previous };
        delete next[key];
        return next;
      });
    }

    if (
      !wasVisible &&
      !previouslySelectedColumnsRef.current.includes(key)
    ) {
      const nextPrevious = [...previouslySelectedColumnsRef.current, key];
      previouslySelectedColumnsRef.current = nextPrevious;
      setPreviouslySelectedColumns(nextPrevious);
    }

    scheduleColumnPreferencesSave();
  }, [scheduleColumnPreferencesSave]);

  const handleColumnFilterToggle = useCallback((fieldKey: string, value: string) => {
    setColumnFilters((previous) => {
      const current = previous[fieldKey] ?? [];
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];

      if (next.length === 0) {
        const rest = { ...previous };
        delete rest[fieldKey];
        return rest;
      }

      return { ...previous, [fieldKey]: next };
    });
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const handleColumnFilterClear = useCallback((fieldKey: string) => {
    setColumnFilters((previous) => {
      const next = { ...previous };
      delete next[fieldKey];
      return next;
    });
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const handlePageSizeChange = useCallback((nextPageSize: PageSize) => {
    pageSizeRef.current = nextPageSize;
    setPageSizeState(nextPageSize);
    if (isContactsTablePageSize(nextPageSize)) {
      scheduleSortPagePreferencesSave();
    }
  }, [scheduleSortPagePreferencesSave]);

  const toggleSort = useCallback((key: string) => {
    const previous = sortByRef.current;
    let next: SortState | null;

    if (key === BUILTIN_COLUMN.tags) {
      next = previous?.key === key ? null : { key, direction: "desc" };
    } else if (!previous || previous.key !== key) {
      next = { key, direction: "asc" };
    } else if (previous.direction === "asc") {
      next = { key, direction: "desc" };
    } else {
      next = null;
    }

    sortByRef.current = next;
    setSortBy(next);
    scheduleSortPagePreferencesSave();
    setPage(1);
    clearSelection();
  }, [clearSelection, scheduleSortPagePreferencesSave]);

  const handleClearAllFilters = useCallback(() => {
    setSearch("");
    setProgramFilter([]);
    setSelectedTagIds([]);
    setColumnFilters({});
    setPendingFilter([]);
    sortByRef.current = DEFAULT_CONTACTS_SORT;
    setSortBy(DEFAULT_CONTACTS_SORT);
    setPage(1);
    clearSelection();
    scheduleSortPagePreferencesSave();
  }, [clearSelection, scheduleSortPagePreferencesSave]);

  return {
    clearSelection,
    columnFilters,
    columnWidths,
    handleClearAllFilters,
    handleClearTags,
    handleColumnFilterClear,
    handleColumnFilterToggle,
    handleColumnToggle,
    handlePendingFilterChange,
    handleProgramFilterClear,
    handleProgramFilterToggle,
    handleSearchChange,
    handleTagToggle,
    page,
    pageSize,
    pendingFilter,
    previouslySelectedColumns,
    programFilter,
    search,
    selectedIds,
    selectedTagIds,
    setColumnWidths,
    setPage,
    setPageSize: handlePageSizeChange,
    setSelectedIds,
    sortBy,
    toggleSort,
    visibleColumns,
  };
}
