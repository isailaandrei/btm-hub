"use client";

import { memo, useMemo, useState } from "react";
import type { TagCategory, Tag } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TAG_COLOR_CLASSES } from "../constants";
import { ColumnPicker } from "./column-picker";
import {
  PENDING_FILTER_OPTIONS,
  PendingFilter,
  type PendingFilterValue,
} from "./pending-filter";

interface ContactsFiltersProps {
  search: string;
  selectedTagIds: string[];
  pendingFilter: PendingFilterValue[];
  tagCategories: TagCategory[];
  tags: Tag[];
  visibleColumns: string[];
  previouslySelectedColumns: string[];
  disabled?: boolean;
  onSearchChange: (value: string) => void;
  onTagToggle: (tagId: string) => void;
  onClearTags: () => void;
  onColumnToggle: (key: string) => void;
  onPendingFilterChange: (next: PendingFilterValue[]) => void;
}

export const ContactsFilters = memo(function ContactsFilters({
  search,
  selectedTagIds,
  pendingFilter,
  tagCategories,
  tags,
  visibleColumns,
  previouslySelectedColumns,
  disabled = false,
  onSearchChange,
  onTagToggle,
  onClearTags,
  onColumnToggle,
  onPendingFilterChange,
}: ContactsFiltersProps) {
  const selectedTagIdsSet = useMemo(
    () => new Set(selectedTagIds),
    [selectedTagIds],
  );
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(
    () => new Set(),
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
  const categoriesById = useMemo(
    () => new Map(tagCategories.map((category) => [category.id, category])),
    [tagCategories],
  );
  const tagsById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag])),
    [tags],
  );
  const tagFilterCount = selectedTagIds.length;
  const activePendingOptions = PENDING_FILTER_OPTIONS.filter((option) =>
    pendingFilter.includes(option.value),
  );
  const selectedTags = selectedTagIds
    .map((tagId) => tagsById.get(tagId))
    .filter((tag): tag is Tag => tag !== undefined);

  function handlePendingChipRemove(value: PendingFilterValue) {
    onPendingFilterChange(pendingFilter.filter((item) => item !== value));
  }

  function toggleCategory(categoryId: string) {
    setExpandedCategoryIds((previous) => {
      const next = new Set(previous);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid="contacts-filters-toolbar"
        className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_auto]"
      >
        <div
          data-testid="contacts-filter-row"
          className="flex min-w-0 flex-wrap items-center gap-2.5"
        >
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            disabled={disabled}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 min-w-60 rounded-lg border border-border bg-card px-3.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
          />

          <PendingFilter
            disabled={disabled}
            value={pendingFilter}
            onChange={onPendingFilterChange}
          />

          {tagCategories.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted ${
                    tagFilterCount > 0 ? "text-foreground" : "text-muted-foreground"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Filters
                  {tagFilterCount > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                      {tagFilterCount}
                    </span>
                  )}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-50"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <div className="max-h-96 overflow-y-auto p-2">
                  {tagCategories.map((category) => {
                    const categoryTags = tagsByCategoryId.get(category.id) ?? [];
                    if (categoryTags.length === 0) return null;
                    const color = category.color ?? "blue";
                    const colorClass = TAG_COLOR_CLASSES[color] ?? "";
                    const activeCount = categoryTags.filter((tag) =>
                      selectedTagIdsSet.has(tag.id),
                    ).length;
                    const isExpanded = expandedCategoryIds.has(category.id);
                    const tagListId = `contacts-filter-tags-${category.id}`;

                    return (
                      <section
                        key={category.id}
                        className="border-b border-border/60 py-2 last:border-0"
                      >
                        <button
                          type="button"
                          aria-controls={tagListId}
                          aria-expanded={isExpanded}
                          data-testid={`contacts-filter-category-${category.id}`}
                          disabled={disabled}
                          onClick={() => toggleCategory(category.id)}
                          className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="min-w-0 text-xs font-medium text-foreground">
                            {category.name}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {activeCount > 0 && (
                              <span className="text-[10px] font-medium text-muted-foreground">
                                {activeCount} selected
                              </span>
                            )}
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={`text-muted-foreground transition-transform ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                            >
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </span>
                        </button>

                        {isExpanded && (
                          <div
                            id={tagListId}
                            className="mt-1 space-y-0.5 pl-2"
                          >
                            {categoryTags.map((tag) => {
                              const isActive = selectedTagIdsSet.has(tag.id);
                              return (
                                <label
                                  key={tag.id}
                                  className={`flex items-center gap-2 rounded-md px-2 py-1 ${
                                    disabled
                                      ? "cursor-not-allowed opacity-60"
                                      : "cursor-pointer hover:bg-muted"
                                  }`}
                                >
                                  <Checkbox
                                    checked={isActive}
                                    disabled={disabled}
                                    onCheckedChange={() => onTagToggle(tag.id)}
                                  />
                                  <Badge
                                    variant="outline"
                                    className={`pointer-events-none ${colorClass}`}
                                  >
                                    {tag.name}
                                  </Badge>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        <div
          data-testid="contacts-table-controls"
          className="flex shrink-0 flex-wrap items-center gap-2 justify-self-start xl:justify-self-end"
        >
          <ColumnPicker
            visibleColumns={visibleColumns}
            previouslySelectedColumns={previouslySelectedColumns}
            disabled={disabled}
            onToggle={onColumnToggle}
          />
        </div>
      </div>

      {(activePendingOptions.length > 0 || selectedTags.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {activePendingOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => handlePendingChipRemove(option.value)}
              className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-950 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {option.label} ×
            </button>
          ))}
          {selectedTags.map((tag) => {
            const category = categoriesById.get(tag.category_id);
            const color = category?.color ?? "blue";
            return (
              <button
                key={tag.id}
                type="button"
                disabled={disabled}
                onClick={() => onTagToggle(tag.id)}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className={TAG_COLOR_CLASSES[color] ?? ""}>
                  {category?.name ? `${category.name}: ` : ""}
                  {tag.name}
                </span>{" "}
                ×
              </button>
            );
          })}
          {selectedTags.length > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={onClearTags}
              className="rounded px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear tags
            </button>
          )}
        </div>
      )}
    </div>
  );
});
