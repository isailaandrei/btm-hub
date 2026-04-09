"use client";

import { useState } from "react";
import type { ProgramSlug, TagCategory, Tag } from "@/types/database";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
  onSearchChange,
  onProgramChange,
  onTagToggle,
  onClearTags,
  onColumnToggle,
}: ContactsFiltersProps) {
  const [searchInput, setSearchInput] = useState(search);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <form
          className="flex items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSearchChange(searchInput);
          }}
        >
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Search
          </button>
        </form>

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

        <ColumnPicker visibleColumns={visibleColumns} onToggle={onColumnToggle} />
      </div>

      {tagCategories.length > 0 && (
        <div className="flex flex-col gap-2">
          {tagCategories.map((category) => {
            const categoryTags = tags.filter((t) => t.category_id === category.id);
            if (categoryTags.length === 0) return null;
            const color = category.color ?? "blue";
            const colorClass = TAG_COLOR_CLASSES[color] ?? "";
            return (
              <div key={category.id} className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{category.name}:</span>
                {categoryTags.map((tag) => {
                  const isActive = selectedTagIds.includes(tag.id);
                  return (
                    <Badge
                      key={tag.id}
                      variant="outline"
                      className={`cursor-pointer select-none transition-opacity ${
                        isActive
                          ? colorClass
                          : "opacity-50 hover:opacity-80"
                      }`}
                      onClick={() => onTagToggle(tag.id)}
                    >
                      {tag.name}
                    </Badge>
                  );
                })}
              </div>
            );
          })}

          {selectedTagIds.length > 0 && (
            <button
              type="button"
              onClick={onClearTags}
              className="rounded px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
