"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  FIELD_REGISTRY,
  CURATED_FIELDS,
  getFieldEntry,
  type FieldRegistryEntry,
} from "./field-registry";
import { PROGRAM_BADGE_CLASS } from "../constants";

interface ColumnPickerProps {
  visibleColumns: string[];
  onToggle: (key: string) => void;
}

export function ColumnPicker({ visibleColumns, onToggle }: ColumnPickerProps) {
  const [search, setSearch] = useState("");

  const q = search.toLowerCase().trim();
  const showSearch = q.length > 0;

  // Search mode: filter the full registry by label/key.
  const searchResults = showSearch
    ? FIELD_REGISTRY.filter(
        (f) =>
          f.label.toLowerCase().includes(q) ||
          f.key.toLowerCase().includes(q),
      )
    : [];

  // Default mode: two stacked sections. Currently-active (selected)
  // columns come first in `visibleColumns` order — so the table's
  // left-to-right layout mirrors the picker's top-to-bottom layout,
  // making it one click to toggle any active column off. Suggested
  // shows CURATED_FIELDS with anything already active filtered out.
  //
  // Side effect: selecting a non-curated column via search
  // automatically promotes it into the Active section on the next
  // picker open — so the "suggested" list effectively grows as the
  // user discovers the columns they care about.
  const selectedKeys = new Set(visibleColumns);
  const activeFields = visibleColumns
    .map((key) => getFieldEntry(key))
    .filter((f): f is FieldRegistryEntry => f !== undefined);
  const suggestedFields = CURATED_FIELDS.filter(
    (f) => !selectedKeys.has(f.key),
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
