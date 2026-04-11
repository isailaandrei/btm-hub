"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  FIELD_REGISTRY,
  getFieldEntry,
  type FieldRegistryEntry,
} from "./field-registry";
import { PROGRAM_BADGE_CLASS } from "../constants";

interface ColumnPickerProps {
  visibleColumns: string[];
  /**
   * The user's personal Suggested list. Starts as the curated defaults
   * on first mount and is user-editable from there — toggling a column
   * moves it to the front, the × button removes it entirely. Persisted
   * as `profiles.preferences.contacts_table.suggested_columns`.
   */
  suggestedColumns: string[];
  onToggle: (key: string) => void;
  /** Remove a key from the suggested list. Does not touch visibility. */
  onDismiss: (key: string) => void;
}

export function ColumnPicker({
  visibleColumns,
  suggestedColumns,
  onToggle,
  onDismiss,
}: ColumnPickerProps) {
  const [search, setSearch] = useState("");

  const q = search.toLowerCase().trim();
  const showSearch = q.length > 0;

  const selectedKeys = new Set(visibleColumns);
  const suggestedKeySet = new Set(suggestedColumns);

  // Search mode: filter the full registry by label/key.
  const searchResults = showSearch
    ? FIELD_REGISTRY.filter(
        (f) =>
          f.label.toLowerCase().includes(q) ||
          f.key.toLowerCase().includes(q),
      )
    : [];

  // Default mode:
  //   ACTIVE    = currently-visible columns, in visibleColumns order
  //   SUGGESTED = suggestedColumns minus active, in suggestedColumns
  //               order (most-recently-touched first)
  const activeFields = visibleColumns
    .map((key) => getFieldEntry(key))
    .filter((f): f is FieldRegistryEntry => f !== undefined);

  const suggestedFields = suggestedColumns
    .filter((key) => !selectedKeys.has(key))
    .map((key) => getFieldEntry(key))
    .filter((f): f is FieldRegistryEntry => f !== undefined);

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
            <>
              {searchResults.length === 0 ? (
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
                    onDismiss={
                      suggestedKeySet.has(field.key)
                        ? () => onDismiss(field.key)
                        : undefined
                    }
                  />
                ))
              )}
            </>
          ) : (
            <>
              {activeFields.length > 0 && (
                <>
                  <p className="mb-1 px-2 text-xs font-semibold text-muted-foreground">
                    Active
                  </p>
                  {activeFields.map((field) => (
                    <FieldRow
                      key={field.key}
                      field={field}
                      checked
                      onToggle={onToggle}
                    />
                  ))}
                </>
              )}
              {suggestedFields.length > 0 && (
                <>
                  <p
                    className={`mb-1 px-2 text-xs font-semibold text-muted-foreground ${
                      activeFields.length > 0 ? "mt-3" : ""
                    }`}
                  >
                    Suggested
                  </p>
                  {suggestedFields.map((field) => (
                    <FieldRow
                      key={field.key}
                      field={field}
                      checked={false}
                      onToggle={onToggle}
                      onDismiss={() => onDismiss(field.key)}
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
  onDismiss,
}: {
  field: FieldRegistryEntry;
  checked: boolean;
  onToggle: (key: string) => void;
  /** When provided, renders an × button that removes this row from
   * the user's suggested list (does NOT toggle visibility). */
  onDismiss?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
      <label className="flex flex-1 cursor-pointer items-center gap-2">
        <Checkbox
          checked={checked}
          onCheckedChange={() => onToggle(field.key)}
        />
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
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground"
          aria-label={`Remove ${field.label} from suggested`}
          title="Remove from suggested"
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
