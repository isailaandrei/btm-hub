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
import type { SortState } from "./sort-helpers";

const FILTERS_STORAGE_KEY = "btm-admin-contacts-filters";

type PageSize = 25 | 50 | 150;

type ContactsTablePreferences = {
  contacts_table?: {
    visible_columns?: string[];
    previously_selected_columns?: string[];
  };
};

type StoredFilters = {
  search?: string;
  selectedProgram?: ProgramSlug;
  selectedTagIds?: string[];
  columnFilters?: Record<string, string[]>;
  sortBy?: SortState | null;
  pageSize?: PageSize;
  page?: number;
  columnWidths?: Record<string, number>;
};

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
  ensureApplications: () => void;
  ensureContacts: () => void;
  ensurePreferences: () => void;
  preferences: Record<string, unknown>;
  setPreferences: Dispatch<SetStateAction<Record<string, unknown>>>;
}

export function useContactsPanelState({
  contacts,
  ensureApplications,
  ensureContacts,
  ensurePreferences,
  preferences,
  setPreferences,
}: UseContactsPanelStateArgs) {
  const [storedFilters] = useState<StoredFilters>(() => readStoredFilters());

  const [search, setSearch] = useState(storedFilters.search ?? "");
  const [selectedProgram, setSelectedProgram] = useState<ProgramSlug | undefined>(
    storedFilters.selectedProgram,
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    storedFilters.selectedTagIds ?? [],
  );
  const [pageSize, setPageSize] = useState<PageSize>(
    storedFilters.pageSize ?? 25,
  );
  const [page, setPage] = useState(storedFilters.page ?? 1);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [previouslySelectedColumns, setPreviouslySelectedColumns] = useState<
    string[]
  >([]);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>(
    storedFilters.columnFilters ?? {},
  );
  const [sortBy, setSortBy] = useState<SortState | null>(
    storedFilters.sortBy ?? null,
  );
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    storedFilters.columnWidths ?? {},
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const visibleColumnsRef = useRef<string[]>([]);
  const previouslySelectedColumnsRef = useRef<string[]>([]);
  const preferencesInitializedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const queuedPreferenceSnapshotRef = useRef<{
    visibleColumns: string[];
    previouslySelectedColumns: string[];
  } | null>(null);
  const isSavingPreferencesRef = useRef(false);
  const preferenceSaveAttemptRef = useRef(0);
  const latestAppliedPreferenceSaveRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    ensureContacts();
    ensureApplications();
  }, [ensureApplications, ensureContacts]);

  useEffect(() => {
    ensurePreferences();
  }, [ensurePreferences]);

  useEffect(() => {
    if (!contacts) return;

    const validContactIds = new Set(contacts.map((contact) => contact.id));
    setSelectedIds((previous) => pruneSelectedIds(previous, validContactIds));
  }, [contacts]);

  useEffect(() => {
    try {
      localStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          search,
          selectedProgram,
          selectedTagIds,
          columnFilters,
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
    page,
    pageSize,
    search,
    selectedProgram,
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
    return () => {
      isMountedRef.current = false;
      clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (preferencesInitializedRef.current) return;

    const contactsTable = (preferences as ContactsTablePreferences).contacts_table;
    const savedVisible = contactsTable?.visible_columns;
    if (!Array.isArray(savedVisible)) return;

    const savedPrevious = Array.isArray(
      contactsTable?.previously_selected_columns,
    )
      ? contactsTable.previously_selected_columns
      : savedVisible;

    visibleColumnsRef.current = savedVisible;
    previouslySelectedColumnsRef.current = savedPrevious;
    setVisibleColumns(savedVisible);
    setPreviouslySelectedColumns(savedPrevious);
    preferencesInitializedRef.current = true;
  }, [preferences]);

  const drainPreferenceSaveQueue = useCallback(async () => {
    if (isSavingPreferencesRef.current) return;
    isSavingPreferencesRef.current = true;

    try {
      while (queuedPreferenceSnapshotRef.current) {
        const snapshot = queuedPreferenceSnapshotRef.current;
        queuedPreferenceSnapshotRef.current = null;
        const attemptId = ++preferenceSaveAttemptRef.current;

        try {
          await updatePreferences({
            contacts_table: {
              visible_columns: snapshot.visibleColumns,
              previously_selected_columns:
                snapshot.previouslySelectedColumns,
            },
          });

          if (!isMountedRef.current) continue;
          if (attemptId < latestAppliedPreferenceSaveRef.current) continue;

          latestAppliedPreferenceSaveRef.current = attemptId;
          setPreferences((prior) => ({
            ...prior,
            contacts_table: {
              visible_columns: snapshot.visibleColumns,
              previously_selected_columns:
                snapshot.previouslySelectedColumns,
            },
          }));
        } catch {
          toast.error("Failed to save column preferences.");
        }
      }
    } finally {
      isSavingPreferencesRef.current = false;
      if (queuedPreferenceSnapshotRef.current) {
        void drainPreferenceSaveQueue();
      }
    }
  }, [setPreferences]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const scheduleColumnPreferencesSave = useCallback(() => {
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      queuedPreferenceSnapshotRef.current = {
        visibleColumns: visibleColumnsRef.current,
        previouslySelectedColumns: previouslySelectedColumnsRef.current,
      };
      void drainPreferenceSaveQueue();
    }, 1000);
  }, [drainPreferenceSaveQueue]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const handleProgramChange = useCallback((value: ProgramSlug | undefined) => {
    setSelectedProgram(value);
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

  const handleColumnToggle = useCallback((key: string) => {
    preferencesInitializedRef.current = true;

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

  const toggleSort = useCallback((key: string) => {
    setSortBy((previous) => {
      if (!previous || previous.key !== key) {
        return { key, direction: "asc" };
      }
      if (previous.direction === "asc") {
        return { key, direction: "desc" };
      }
      return null;
    });
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const handleClearAllFilters = useCallback(() => {
    setSearch("");
    setSelectedProgram(undefined);
    setSelectedTagIds([]);
    setColumnFilters({});
    setSortBy(null);
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  return {
    clearSelection,
    columnFilters,
    columnWidths,
    handleClearAllFilters,
    handleClearTags,
    handleColumnFilterClear,
    handleColumnFilterToggle,
    handleColumnToggle,
    handleProgramChange,
    handleSearchChange,
    handleTagToggle,
    page,
    pageSize,
    previouslySelectedColumns,
    search,
    selectedIds,
    selectedProgram,
    selectedTagIds,
    setColumnWidths,
    setPage,
    setPageSize,
    setSelectedIds,
    sortBy,
    toggleSort,
    visibleColumns,
  };
}
