"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TAG_COLOR_CLASSES } from "../../constants";
import { categoryNameMatches, searchTags } from "../../tag-search";
import { useAdminContactsData } from "../../admin-data-provider";
import {
  assignContactTag,
  createAndAssignContactTag,
  unassignContactTag,
} from "../actions";

export interface TagRow {
  id: string;
  name: string;
  category_id: string;
  sort_order: number;
  tag_categories: {
    id: string;
    name: string;
    color: string | null;
    sort_order: number;
    created_at: string;
  };
}

export type ContactTagRow = {
  tag_id: string;
  assigned_at: string;
  tags: TagRow | TagRow[];
};

type TagAction =
  | { kind: "add"; row: ContactTagRow }
  | { kind: "remove"; tagId: string };

type CategoryOption = {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: string;
};

type TagOption = {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
};

interface ContactTagManagerProps {
  contactId: string;
  contactTagRows: ContactTagRow[];
  categories: CategoryOption[];
  allTags: TagOption[];
  onDataMayHaveChanged?: () => void;
  /**
   * When these rows are derived from `AdminDataProvider` (the common case), route
   * optimistic writes through the provider's mutators so the change persists past
   * the transition and reconciles via realtime — independent of the websocket.
   * When false (a cold-provider server-data fallback), use the local optimistic
   * layer and let `onDataMayHaveChanged` refetch.
   */
  persistToProvider?: boolean;
}

function buildOptimisticRow(
  tag: TagOption,
  category: CategoryOption,
): ContactTagRow {
  return {
    tag_id: tag.id,
    assigned_at: new Date().toISOString(),
    tags: {
      id: tag.id,
      name: tag.name,
      category_id: tag.category_id,
      sort_order: tag.sort_order,
      tag_categories: {
        id: category.id,
        name: category.name,
        color: category.color,
        sort_order: category.sort_order,
        created_at: category.created_at,
      },
    },
  };
}

export function ContactTagManager({
  contactId,
  contactTagRows,
  categories,
  allTags,
  onDataMayHaveChanged,
  persistToProvider = false,
}: ContactTagManagerProps) {
  const [, startTransition] = useTransition();
  const {
    addOptimisticContactTags,
    addOptimisticTag,
    removeOptimisticContactTags,
  } = useAdminContactsData();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [creatingCategoryId, setCreatingCategoryId] = useState<string | null>(
    null,
  );
  const [createDraft, setCreateDraft] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingTagIds, setPendingTagIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [optimisticRows, applyOptimistic] = useOptimistic(
    contactTagRows,
    (state, action: TagAction) => {
      if (action.kind === "add") {
        return [
          ...state.filter((row) => row.tag_id !== action.row.tag_id),
          action.row,
        ];
      }
      return state.filter((row) => row.tag_id !== action.tagId);
    },
  );

  function resolveTag(row: { tags: TagRow | TagRow[] }): TagRow | null {
    const t = row.tags;
    if (Array.isArray(t)) return t[0] ?? null;
    return t;
  }

  const assignedTagIds = new Set(optimisticRows.map((r) => r.tag_id));
  const sortedCategories = [...categories].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  // Card body: only categories the contact actually has tags in.
  const assignedGroups = sortedCategories
    .map((category) => ({
      category,
      tags: optimisticRows
        .map((row) => resolveTag(row))
        .filter(
          (tag): tag is TagRow =>
            tag !== null && tag.category_id === category.id,
        )
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter((group) => group.tags.length > 0);

  // Picker body. Matching runs over ALL tags — assigned rows are hidden at
  // render instead of excluded from the input, so a group doesn't vanish
  // under the cursor when its last matching tag gets assigned mid-multi-add.
  // Browse mode lists every category collapsed (tags only after expanding —
  // 13 program categories × 5 tags laid out flat is exactly the clutter this
  // picker replaces); search mode auto-expands its matches, plus name-matched
  // zero-tag categories so their quick-create row stays reachable.
  const trimmedSearch = pickerSearch.trim();
  const isSearching = trimmedSearch.length > 0;
  const pickerGroups = isSearching
    ? (() => {
        const matched = searchTags(categories, allTags, trimmedSearch);
        const matchedIds = new Set(matched.map((group) => group.category.id));
        const nameOnly = sortedCategories
          .filter(
            (category) =>
              !matchedIds.has(category.id) &&
              categoryNameMatches(category.name, trimmedSearch),
          )
          .map((category) => ({ category, tags: [] as TagOption[] }));
        return [...matched, ...nameOnly].sort(
          (a, b) =>
            a.category.sort_order - b.category.sort_order ||
            a.category.name.localeCompare(b.category.name),
        );
      })()
    : sortedCategories.map((category) => ({
        category,
        tags: allTags
          .filter((tag) => tag.category_id === category.id)
          .sort(
            (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
          ),
      }));

  function markTagPending(tagId: string) {
    setPendingTagIds((previous) => new Set(previous).add(tagId));
  }

  function clearTagPending(tagId: string) {
    setPendingTagIds((previous) => {
      const next = new Set(previous);
      next.delete(tagId);
      return next;
    });
  }

  function handlePickerOpenChange(open: boolean) {
    setPickerOpen(open);
    if (!open) {
      setPickerSearch("");
      setExpandedCategoryIds(new Set());
      setCreatingCategoryId(null);
      setCreateDraft("");
      setCreateError(null);
    }
  }

  function toggleCategoryExpanded(categoryId: string) {
    setExpandedCategoryIds((previous) => {
      const next = new Set(previous);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function cancelQuickCreate() {
    setCreatingCategoryId(null);
    setCreateDraft("");
    setCreateError(null);
  }

  function handleUnassign(tagId: string) {
    if (pendingTagIds.has(tagId)) return;
    markTagPending(tagId);
    startTransition(async () => {
      const handle = persistToProvider
        ? removeOptimisticContactTags([contactId], tagId)
        : null;
      if (!persistToProvider) applyOptimistic({ kind: "remove", tagId });
      try {
        await unassignContactTag(contactId, tagId);
        onDataMayHaveChanged?.();
      } catch {
        handle?.rollback();
        toast.error("Failed to remove tag. Please try again.");
      } finally {
        clearTagPending(tagId);
      }
    });
  }

  function handleAssign(tagId: string) {
    if (pendingTagIds.has(tagId)) return;
    const tag = allTags.find((item) => item.id === tagId);
    const category = categories.find((item) => item.id === tag?.category_id);
    if (!tag || !category) {
      toast.error("Tag data is stale. Refresh and try again.");
      return;
    }

    markTagPending(tagId);
    startTransition(async () => {
      const handle = persistToProvider
        ? addOptimisticContactTags([contactId], tagId)
        : null;
      if (!persistToProvider) {
        applyOptimistic({
          kind: "add",
          row: buildOptimisticRow(tag, category),
        });
      }
      try {
        await assignContactTag(contactId, tagId);
        onDataMayHaveChanged?.();
      } catch {
        handle?.rollback();
        toast.error("Failed to assign tag. Please try again.");
      } finally {
        clearTagPending(tagId);
      }
    });
  }

  function startQuickCreate(categoryId: string) {
    setCreatingCategoryId(categoryId);
    setCreateDraft("");
    setCreateError(null);
  }

  function handleQuickCreate(categoryId: string) {
    const name = createDraft.trim();
    if (!name || isCreating) return;
    setIsCreating(true);
    setCreateError(null);
    startTransition(async () => {
      try {
        const result = await createAndAssignContactTag(
          contactId,
          categoryId,
          name,
        );
        if (result.ok) {
          if (persistToProvider) {
            // Both writes are already committed server-side; write through the
            // provider caches so the new badge renders immediately instead of
            // waiting for the debounced realtime refetch. (The local-fallback
            // path can't do optimistic display here — the tag id only exists
            // after the await, and a post-await useOptimistic dispatch lands
            // outside the transition — so it relies on the refetch below.)
            addOptimisticTag(result.tag);
            addOptimisticContactTags([contactId], result.tag.id);
          }
          onDataMayHaveChanged?.();
          cancelQuickCreate();
        } else if (result.code === "created_not_assigned") {
          // The tag exists but isn't on the contact: surface via toast (the
          // picker may close any moment) and make it selectable right away.
          toast.error(result.message);
          if (persistToProvider) addOptimisticTag(result.tag);
          onDataMayHaveChanged?.();
          cancelQuickCreate();
        } else {
          // duplicate_name / invalid_input: keep the row open for a fix.
          setCreateError(result.message);
        }
      } catch {
        setCreateError("Failed to create tag. Please try again.");
        onDataMayHaveChanged?.();
      } finally {
        setIsCreating(false);
      }
    });
  }

  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tag categories yet. Create some in the Tags panel.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {assignedGroups.map(({ category, tags: assignedTags }) => {
        const colorClass = TAG_COLOR_CLASSES[category.color ?? "blue"] ?? "";
        return (
          <div key={category.id}>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
              {category.name}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {assignedTags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  className={`flex items-center gap-1 ${colorClass}`}
                >
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => handleUnassign(tag.id)}
                    disabled={pendingTagIds.has(tag.id)}
                    className="ml-0.5 transition-colors hover:text-red-400 disabled:opacity-50"
                    aria-label={`Remove tag ${tag.name}`}
                  >
                    &times;
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        );
      })}

      {assignedGroups.length === 0 && (
        <p className="text-sm text-muted-foreground">No tags yet.</p>
      )}

      <div>
        <Popover open={pickerOpen} onOpenChange={handlePickerOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              aria-label="Add tags"
            >
              + Add tags
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-80 p-0"
            align="start"
            onEscapeKeyDown={(event) => {
              // Escape mid-quick-create collapses just the inline row; Radix
              // listens in the capture phase, so this prop (not stopPropagation
              // on the input) is the only reliable interception point.
              if (creatingCategoryId !== null) {
                event.preventDefault();
                cancelQuickCreate();
              }
            }}
          >
            <div className="border-b border-border/60 p-2">
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search categories or tags..."
                aria-label="Search tags"
                data-testid="contact-tag-picker-search"
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {pickerGroups.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  No tags match &ldquo;{trimmedSearch}&rdquo;
                </p>
              ) : (
                pickerGroups.map((group) => {
                  const colorClass =
                    TAG_COLOR_CLASSES[group.category.color ?? "blue"] ?? "";
                  const isCreatingHere =
                    creatingCategoryId === group.category.id;
                  const isExpanded =
                    isSearching || expandedCategoryIds.has(group.category.id);
                  const availableTags = group.tags.filter(
                    (tag) => !assignedTagIds.has(tag.id),
                  );
                  return (
                    <section
                      key={group.category.id}
                      className="border-b border-border/60 py-1.5 first:pt-0.5 last:border-0"
                    >
                      {isSearching ? (
                        <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                          {group.category.name}
                        </p>
                      ) : (
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() =>
                            toggleCategoryExpanded(group.category.id)
                          }
                          className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                        >
                          <span className="min-w-0 text-xs font-semibold text-muted-foreground">
                            {group.category.name}
                          </span>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`shrink-0 text-muted-foreground transition-transform ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                      )}
                      {isExpanded && (
                      <div className="space-y-0.5">
                        {availableTags.map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => handleAssign(tag.id)}
                            disabled={pendingTagIds.has(tag.id)}
                            className="flex w-full items-center rounded-md px-2 py-1 text-left transition-colors hover:bg-muted disabled:opacity-50"
                          >
                            <Badge
                              variant="outline"
                              className={`pointer-events-none ${colorClass}`}
                            >
                              {tag.name}
                            </Badge>
                          </button>
                        ))}

                        {isCreatingHere ? (
                          <form
                            className="flex items-center gap-1 px-2 py-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleQuickCreate(group.category.id);
                            }}
                          >
                            <input
                              autoFocus
                              type="text"
                              value={createDraft}
                              maxLength={100}
                              disabled={isCreating}
                              onChange={(e) => setCreateDraft(e.target.value)}
                              placeholder="New tag name..."
                              aria-label={`New tag name in ${group.category.name}`}
                              className="h-7 w-full rounded border border-border bg-muted px-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary disabled:opacity-60"
                            />
                            <button
                              type="submit"
                              disabled={isCreating || !createDraft.trim()}
                              className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                              {isCreating ? "..." : "Add"}
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startQuickCreate(group.category.id)}
                            className="w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label={`Create new tag in ${group.category.name}`}
                          >
                            ＋ New tag…
                          </button>
                        )}
                        {isCreatingHere && createError && (
                          <p className="px-2 pb-1 text-xs text-destructive">
                            {createError}
                          </p>
                        )}
                      </div>
                      )}
                    </section>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
