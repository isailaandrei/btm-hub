"use client";

import { useRef, useState } from "react";
import type { ProgramSlug, TagCategory, Tag } from "@/types/database";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PROGRAMS } from "../applications/constants";
import { TAG_COLOR_CLASSES } from "../constants";
import { ColumnPicker } from "./column-picker";

interface ContactsFiltersProps {
  search: string;
  selectedProgram: ProgramSlug | undefined;
  selectedTagIds: string[];
  tagCategories: TagCategory[];
  tags: Tag[];
  visibleColumns: string[];
  previouslySelectedColumns: string[];
  onSearchChange: (value: string) => void;
  onProgramChange: (value: ProgramSlug | undefined) => void;
  onTagToggle: (tagId: string) => void;
  onClearTags: () => void;
  onColumnToggle: (key: string) => void;
}

export function ContactsFilters({
  search,
  selectedProgram,
  selectedTagIds,
  tagCategories,
  tags,
  visibleColumns,
  previouslySelectedColumns,
  onSearchChange,
  onProgramChange,
  onTagToggle,
  onClearTags,
  onColumnToggle,
}: ContactsFiltersProps) {
  // Local input state + debounce so the table doesn't re-filter (and
  // potentially shift rows) on every keystroke. The parent's `search`
  // state only updates after a 200ms pause in typing.
  const [localSearch, setLocalSearch] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleSearchChange(value: string) {
    setLocalSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearchChange(value), 200);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={localSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
        />

        <Select
          value={selectedProgram ?? "all"}
          onValueChange={(v) =>
            onProgramChange(v === "all" ? undefined : (v as ProgramSlug))
          }
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Programs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programs</SelectItem>
            {PROGRAMS.map((p) => (
              <SelectItem key={p} value={p} className="capitalize">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ColumnPicker
          visibleColumns={visibleColumns}
          previouslySelectedColumns={previouslySelectedColumns}
          onToggle={onColumnToggle}
        />
      </div>

      {tagCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {tagCategories.map((category) => {
            const categoryTags = tags.filter((t) => t.category_id === category.id);
            if (categoryTags.length === 0) return null;
            const color = category.color ?? "blue";
            const colorClass = TAG_COLOR_CLASSES[color] ?? "";
            const activeCount = categoryTags.filter((t) => selectedTagIds.includes(t.id)).length;
            return (
              <Popover key={category.id}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted ${
                      activeCount > 0 ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {category.name}
                    {activeCount > 0 && (
                      <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium ${colorClass}`}>
                        {activeCount}
                      </span>
                    )}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <div className="max-h-56 overflow-y-auto p-2">
                    {categoryTags.map((tag) => {
                      const isActive = selectedTagIds.includes(tag.id);
                      return (
                        <label
                          key={tag.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
                        >
                          <Checkbox checked={isActive} onCheckedChange={() => onTagToggle(tag.id)} />
                          <Badge variant="outline" className={`pointer-events-none ${colorClass}`}>
                            {tag.name}
                          </Badge>
                        </label>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            );
          })}

          {selectedTagIds.length > 0 && (
            <button
              type="button"
              onClick={onClearTags}
              className="rounded px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear tags
            </button>
          )}
        </div>
      )}
    </div>
  );
}
