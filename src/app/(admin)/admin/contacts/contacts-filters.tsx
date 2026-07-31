"use client";

import { memo, useMemo, useState } from "react";
import type { TagCategory, Tag } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TAG_COLOR_CLASSES } from "../constants";
import { searchTags } from "../tag-search";
import { ColumnPicker } from "./column-picker";

function FilterTagRow({
  tag,
  colorClass,
  isActive,
  disabled,
  onToggle,
}: {
  tag: Tag;
  colorClass: string;
  isActive: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex items-center gap-2 rounded-md px-2 py-1 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted"
      }`}
    >
      <Checkbox checked={isActive} disabled={disabled} onCheckedChange={onToggle} />
      <Badge variant="outline" className={`pointer-events-none ${colorClass}`}>
        {tag.name}
      </Badge>
    </label>
  );
}

interface ContactsFiltersProps {
  search: string;
  selectedTagIds: string[];
  tagCategories: TagCategory[];
  tags: Tag[];
  visibleColumns: string[];
  previouslySelectedColumns: string[];
  disabled?: boolean;
  onSearchChange: (value: string) => void;
  onTagToggle: (tagId: string) => void;
  onClearTags: () => void;
  onColumnToggle: (key: string) => void;
}

export const ContactsFilters = memo(function ContactsFilters({
  search,
  selectedTagIds,
  tagCategories,
  tags,
  visibleColumns,
  previouslySelectedColumns,
  disabled = false,
  onSearchChange,
  onTagToggle,
  onClearTags,
  onColumnToggle,
}: ContactsFiltersProps) {
  const selectedTagIdsSet = useMemo(
    () => new Set(selectedTagIds),
    [selectedTagIds],
  );
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [tagSearch, setTagSearch] = useState("");
  const trimmedTagSearch = tagSearch.trim();
  const tagSearchGroups = useMemo(
    () =>
      trimmedTagSearch
        ? searchTags(tagCategories, tags, trimmedTagSearch)
        : null,
    [tagCategories, tags, trimmedTagSearch],
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
  const selectedTags = selectedTagIds
    .map((tagId) => tagsById.get(tagId))
    .filter((tag): tag is Tag => tag !== undefined);

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
            placeholder="Search by name, email, or phone..."
            value={search}
            disabled={disabled}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 min-w-60 rounded-lg border border-border bg-card px-3.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
          />

          {tagCategories.length > 0 && (
            <Popover
              onOpenChange={(open) => {
                if (!open) setTagSearch("");
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted ${
                    tagFilterCount > 0 ? "text-foreground" : "text-muted-foreground"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Tags
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
                <div className="border-b border-border/60 p-2">
                  <input
                    type="text"
                    value={tagSearch}
                    disabled={disabled}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Search tags..."
                    aria-label="Search tags"
                    data-testid="contacts-filter-tag-search"
                    className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="max-h-96 overflow-y-auto p-2">
                  {tagSearchGroups !== null ? (
                    tagSearchGroups.length === 0 ? (
                      <p className="px-2 py-2 text-xs text-muted-foreground">
                        No tags match &ldquo;{trimmedTagSearch}&rdquo;
                      </p>
                    ) : (
                      tagSearchGroups.map((group) => (
                        <section
                          key={group.category.id}
                          className="border-b border-border/60 py-2 first:pt-1 last:border-0"
                        >
                          <p className="px-2 pb-1 text-xs font-medium text-foreground">
                            {group.category.name}
                          </p>
                          <div className="space-y-0.5 pl-2">
                            {group.tags.map((tag) => (
                              <FilterTagRow
                                key={tag.id}
                                tag={tag}
                                colorClass={
                                  TAG_COLOR_CLASSES[
                                    group.category.color ?? "blue"
                                  ] ?? ""
                                }
                                isActive={selectedTagIdsSet.has(tag.id)}
                                disabled={disabled}
                                onToggle={() => onTagToggle(tag.id)}
                              />
                            ))}
                          </div>
                        </section>
                      ))
                    )
                  ) : (
                  tagCategories.map((category) => {
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
                            {categoryTags.map((tag) => (
                              <FilterTagRow
                                key={tag.id}
                                tag={tag}
                                colorClass={colorClass}
                                isActive={selectedTagIdsSet.has(tag.id)}
                                disabled={disabled}
                                onToggle={() => onTagToggle(tag.id)}
                              />
                            ))}
                          </div>
                        )}
                      </section>
                    );
                  })
                  )}
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

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
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
          <button
            type="button"
            disabled={disabled}
            onClick={onClearTags}
            className="rounded px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear tags
          </button>
        </div>
      )}
    </div>
  );
});
