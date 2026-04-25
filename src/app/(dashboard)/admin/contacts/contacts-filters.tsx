"use client";

import { memo, useMemo, type ReactNode } from "react";
import type { TagCategory, Tag } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TAG_COLOR_CLASSES } from "../constants";
import { ColumnPicker } from "./column-picker";

interface ContactsFiltersProps {
  search: string;
  selectedTagIds: string[];
  tagCategories: TagCategory[];
  tags: Tag[];
  visibleColumns: string[];
  previouslySelectedColumns: string[];
  onSearchChange: (value: string) => void;
  onTagToggle: (tagId: string) => void;
  onClearTags: () => void;
  onColumnToggle: (key: string) => void;
  trailingSlot?: ReactNode;
}

export const ContactsFilters = memo(function ContactsFilters({
  search,
  selectedTagIds,
  tagCategories,
  tags,
  visibleColumns,
  previouslySelectedColumns,
  onSearchChange,
  onTagToggle,
  onClearTags,
  onColumnToggle,
  trailingSlot,
}: ContactsFiltersProps) {
  const selectedTagIdsSet = useMemo(
    () => new Set(selectedTagIds),
    [selectedTagIds],
  );
  const tagsByCategoryId = useMemo(() => {
    const map = new Map<string, Tag[]>();
    for (const tag of tags) {
      const existing = map.get(tag.category_id);
      if (existing) existing.push(tag);
      else map.set(tag.category_id, [tag]);
    }
    return map;
  }, [tags]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
        />

        <ColumnPicker
          visibleColumns={visibleColumns}
          previouslySelectedColumns={previouslySelectedColumns}
          onToggle={onColumnToggle}
        />

        {trailingSlot && <div className="ml-auto">{trailingSlot}</div>}
      </div>

      {tagCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {tagCategories.map((category) => {
            const categoryTags = tagsByCategoryId.get(category.id) ?? [];
            if (categoryTags.length === 0) return null;
            const color = category.color ?? "blue";
            const colorClass = TAG_COLOR_CLASSES[color] ?? "";
            const activeCount = categoryTags.filter((tag) =>
              selectedTagIdsSet.has(tag.id),
            ).length;
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
                      const isActive = selectedTagIdsSet.has(tag.id);
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
});
