"use client";

import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  FIELD_REGISTRY,
  type FieldRegistryEntry,
} from "./field-registry";
import { PROGRAM_BADGE_CLASS } from "../constants";

interface ColumnPickerProps {
  visibleColumns: string[];
  /**
   * Every column the user has ever toggled on, in any order. The picker
   * renders these at the top under "Previously selected", alphabetized,
   * so the user's working set stays above the full alphabetical list of
   * every available column. Persisted as
   * `profiles.preferences.contacts_table.previously_selected_columns`.
   */
  previouslySelectedColumns: string[];
  onToggle: (key: string) => void;
}

function byLabel(a: FieldRegistryEntry, b: FieldRegistryEntry): number {
  return a.label.localeCompare(b.label);
}

export function ColumnPicker({
  visibleColumns,
  previouslySelectedColumns,
  onToggle,
}: ColumnPickerProps) {
  const [search, setSearch] = useState("");

  const q = search.toLowerCase().trim();
  const showSearch = q.length > 0;

  const selectedKeys = useMemo(
    () => new Set(visibleColumns),
    [visibleColumns],
  );
  const previouslySelectedKeys = useMemo(
    () => new Set(previouslySelectedColumns),
    [previouslySelectedColumns],
  );

  // Alphabetized full list used in both render modes.
  const allFieldsSorted = useMemo(
    () => [...FIELD_REGISTRY].sort(byLabel),
    [],
  );

  // Search mode: flat filtered alphabetical list.
  const searchResults = useMemo(() => {
    if (!showSearch) return [];
    return allFieldsSorted.filter(
      (f) =>
        f.label.toLowerCase().includes(q) ||
        f.key.toLowerCase().includes(q),
    );
  }, [allFieldsSorted, q, showSearch]);

  // Default mode: two stacked sections.
  //   PREVIOUSLY SELECTED — everything the user has ever toggled on,
  //                        alphabetical.
  //   (unlabeled rest)    — every other FIELD_REGISTRY column,
  //                        alphabetical.
  const previouslySelectedFields = useMemo(
    () =>
      allFieldsSorted.filter((f) => previouslySelectedKeys.has(f.key)),
    [allFieldsSorted, previouslySelectedKeys],
  );
  const remainingFields = useMemo(
    () =>
      allFieldsSorted.filter((f) => !previouslySelectedKeys.has(f.key)),
    [allFieldsSorted, previouslySelectedKeys],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Columns
          {visibleColumns.length > 0 && (
            <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {visibleColumns.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="border-b border-border p-3">
          <input
            type="text"
            placeholder="Search fields..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {showSearch ? (
            searchResults.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                No matching fields
              </p>
            ) : (
              searchResults.map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  checked={selectedKeys.has(field.key)}
                  onToggle={onToggle}
                />
              ))
            )
          ) : (
            <>
              {previouslySelectedFields.length > 0 && (
                <>
                  <p className="mb-1 px-2 text-xs font-semibold text-muted-foreground">
                    Previously selected
                  </p>
                  {previouslySelectedFields.map((field) => (
                    <FieldRow
                      key={field.key}
                      field={field}
                      checked={selectedKeys.has(field.key)}
                      onToggle={onToggle}
                    />
                  ))}
                </>
              )}
              {remainingFields.length > 0 && (
                <>
                  <p
                    className={`mb-1 px-2 text-xs font-semibold text-muted-foreground ${
                      previouslySelectedFields.length > 0 ? "mt-3" : ""
                    }`}
                  >
                    All columns
                  </p>
                  {remainingFields.map((field) => (
                    <FieldRow
                      key={field.key}
                      field={field}
                      checked={selectedKeys.has(field.key)}
                      onToggle={onToggle}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FieldRow({
  field,
  checked,
  onToggle,
}: {
  field: FieldRegistryEntry;
  checked: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
      <Checkbox checked={checked} onCheckedChange={() => onToggle(field.key)} />
      <span className="flex-1 text-sm text-foreground">{field.label}</span>
      <span className="flex gap-0.5">
        {field.programs.map((p) => (
          <Badge
            key={p}
            variant="outline"
            className={`px-1 py-0 text-[10px] capitalize ${
              PROGRAM_BADGE_CLASS[p] ?? ""
            }`}
          >
            {p.slice(0, 4)}
          </Badge>
        ))}
      </span>
    </label>
  );
}
