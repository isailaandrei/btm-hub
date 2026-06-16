"use client";

import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { TAG_COLOR_CLASSES } from "../../constants";
import { assignContactTag, unassignContactTag } from "../actions";
import { AddTagForm } from "../../tags/add-tag-form";

interface TagRow {
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

type ContactTagRow = {
  tag_id: string;
  assigned_at: string;
  tags: TagRow | TagRow[];
};

type TagAction =
  | { kind: "add"; row: ContactTagRow }
  | { kind: "remove"; tagId: string };

interface ContactTagManagerProps {
  contactId: string;
  contactTagRows: ContactTagRow[];
  categories: Array<{
    id: string;
    name: string;
    color: string | null;
    sort_order: number;
    created_at: string;
  }>;
  allTags: Array<{
    id: string;
    category_id: string;
    name: string;
    sort_order: number;
  }>;
}

export function ContactTagManager({
  contactId,
  contactTagRows,
  categories,
  allTags,
}: ContactTagManagerProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Per-category dropdown open state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
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

  useEffect(() => {
    if (!openDropdown) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openDropdown]);

  function resolveTag(row: { tags: TagRow | TagRow[] }): TagRow | null {
    const t = row.tags;
    if (Array.isArray(t)) return t[0] ?? null;
    return t;
  }

  const assignedTagIds = new Set(optimisticRows.map((r) => r.tag_id));

  function handleUnassign(tagId: string) {
    startTransition(async () => {
      try {
        applyOptimistic({ kind: "remove", tagId });
        await unassignContactTag(contactId, tagId);
        router.refresh();
      } catch {
        toast.error("Failed to remove tag. Please try again.");
      }
    });
  }

  function handleAssign(tagId: string, categoryId: string) {
    const tag = allTags.find((item) => item.id === tagId);
    const category = categories.find((item) => item.id === categoryId);
    if (!tag || !category) {
      toast.error("Tag data is stale. Refresh and try again.");
      return;
    }

    const optimisticRow: ContactTagRow = {
      tag_id: tagId,
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

    startTransition(async () => {
      try {
        applyOptimistic({ kind: "add", row: optimisticRow });
        await assignContactTag(contactId, tagId);
        router.refresh();
        // Close dropdown if no more available tags in this category after assignment
        const remaining = allTags.filter(
          (t) => t.category_id === categoryId && !assignedTagIds.has(t.id) && t.id !== tagId,
        );
        if (remaining.length === 0) setOpenDropdown(null);
      } catch {
        toast.error("Failed to assign tag. Please try again.");
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
      {categories.map((category) => {
        const color = category.color ?? "blue";
        const colorClass = TAG_COLOR_CLASSES[color] ?? "";
        const assignedInCategory = optimisticRows
          .map((r) => resolveTag(r))
          .filter((tag): tag is TagRow => tag !== null && tag.category_id === category.id);
        const availableTags = allTags.filter(
          (t) => t.category_id === category.id && !assignedTagIds.has(t.id),
        );
        const isOpen = openDropdown === category.id;

        return (
          <div key={category.id}>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
              {category.name}
            </p>

            <div className="flex flex-wrap items-center gap-1.5">
              {/* Assigned tags */}
              {assignedInCategory.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  className={`flex items-center gap-1 ${colorClass}`}
                >
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => handleUnassign(tag.id)}
                    disabled={isPending}
                    className="ml-0.5 transition-colors hover:text-red-400 disabled:opacity-50"
                    aria-label={`Remove tag ${tag.name}`}
                  >
                    &times;
                  </button>
                </Badge>
              ))}

              {/* "+" button to open dropdown */}
              <div className="relative" ref={isOpen ? dropdownRef : undefined}>
                <button
                  type="button"
                  onClick={() => setOpenDropdown(isOpen ? null : category.id)}
                  disabled={isPending}
                  className="flex h-5 w-5 items-center justify-center rounded border border-border text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                  aria-label={`Add tag to ${category.name}`}
                >
                  +
                </button>

                {isOpen && (
                  <div className="absolute left-0 top-7 z-10 min-w-[160px] rounded-lg border border-border bg-card shadow-md">
                    {availableTags.length > 0 && (
                      <div className="border-b border-border py-1">
                        {availableTags.map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => handleAssign(tag.id, category.id)}
                            disabled={isPending}
                            className="w-full px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                          >
                            {tag.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Quick-create input */}
                    <AddTagForm
                      categoryId={category.id}
                      placeholder="Create new..."
                      compact
                      onSuccess={() => {
                        router.refresh();
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
