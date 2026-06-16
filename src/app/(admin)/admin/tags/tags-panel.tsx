"use client";

import { useEffect, useMemo, useTransition } from "react";
import { toast } from "sonner";
import { useAdminContactsData } from "../admin-data-provider";
import { editTag, removeCategory, removeTag } from "./actions";
import { AddCategoryForm } from "./add-category-form";
import { AddTagForm } from "./add-tag-form";
import { EditCategoryForm } from "./edit-category-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TAG_COLOR_CLASSES } from "../constants";
import type { Tag } from "@/types/database";
import type { RollbackHandle } from "../admin-optimistic-mutations";

const DOT_COLOR_CLASSES: Record<string, string> = {
  red: "bg-red-400",
  orange: "bg-orange-400",
  yellow: "bg-yellow-400",
  green: "bg-green-400",
  blue: "bg-blue-400",
  purple: "bg-purple-400",
  pink: "bg-pink-400",
};

function getMutationErrorMessage(
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallbackMessage;
}

function DeleteCategoryButton({
  categoryId,
  categoryName,
  removeOptimisticCategory,
}: {
  categoryId: string;
  categoryName: string;
  removeOptimisticCategory: (id: string) => RollbackHandle;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (
      !window.confirm(
        `Delete category "${categoryName}" and all its tags? This cannot be undone.`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      const { rollback } = removeOptimisticCategory(categoryId);
      try {
        await removeCategory(categoryId);
        toast.success(`Category "${categoryName}" deleted.`);
      } catch {
        rollback();
        toast.error("Failed to delete category. Please try again.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="rounded px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
    >
      {isPending ? "Deleting..." : "Delete category"}
    </button>
  );
}

function EditTagButton({
  tag,
  updateOptimisticTag,
}: {
  tag: Tag;
  updateOptimisticTag: (id: string, fields: Partial<Tag>) => RollbackHandle;
}) {
  const [isPending, startTransition] = useTransition();

  function handleEdit() {
    const nextName = window.prompt("Tag name", tag.name)?.trim();
    if (nextName == null) return;
    if (!nextName) {
      toast.error("Tag name is required.");
      return;
    }

    startTransition(async () => {
      const { rollback } = updateOptimisticTag(tag.id, { name: nextName });
      try {
        await editTag(tag.id, nextName, {
          expectedUpdatedAt: tag.updated_at,
        });
        toast.success(`Tag "${nextName}" updated.`);
      } catch (error) {
        rollback();
        toast.error(
          getMutationErrorMessage(
            error,
            "Failed to update tag. Please try again.",
          ),
        );
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleEdit}
      disabled={isPending}
      className="ml-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
    >
      {isPending ? "..." : "Edit"}
    </button>
  );
}

function DeleteTagButton({
  tagId,
  tagName,
  removeOptimisticTag,
}: {
  tagId: string;
  tagName: string;
  removeOptimisticTag: (id: string) => RollbackHandle;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (
      !window.confirm(
        `Delete tag "${tagName}" from all contacts? This cannot be undone.`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      const { rollback } = removeOptimisticTag(tagId);
      try {
        await removeTag(tagId);
        toast.success(`Tag "${tagName}" deleted.`);
      } catch {
        rollback();
        toast.error("Failed to delete tag. Please try again.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="ml-0.5 transition-colors hover:text-red-400 disabled:opacity-50"
    >
      &times;
    </button>
  );
}

export function TagsPanel() {
  const {
    tagCategories,
    tags,
    contactsError,
    ensureContacts,
    updateOptimisticTag,
    removeOptimisticTag,
    updateOptimisticCategory,
    removeOptimisticCategory,
  } = useAdminContactsData();
  const tagsByCategoryId = useMemo(() => {
    const map = new Map<string, Tag[]>();
    for (const tag of tags ?? []) {
      const existing = map.get(tag.category_id);
      if (existing) {
        existing.push(tag);
      } else {
        map.set(tag.category_id, [tag]);
      }
    }
    return map;
  }, [tags]);

  useEffect(() => {
    ensureContacts();
  }, [ensureContacts]);

  if (tagCategories === null) {
    if (contactsError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/50 bg-destructive/5 p-12 text-center">
          <p className="text-sm font-medium text-destructive">{contactsError}</p>
          <button
            type="button"
            onClick={() => ensureContacts()}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Retry
          </button>
        </div>
      );
    }

    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-40 rounded bg-muted" />
        <div className="h-24 w-full rounded-lg bg-muted" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 w-full rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-[length:var(--font-size-h2)] font-medium text-foreground">
        Tags
      </h1>

      {/* Add Category */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add Category</CardTitle>
        </CardHeader>
        <CardContent>
          <AddCategoryForm />
        </CardContent>
      </Card>

      {/* Category Cards */}
      {tagCategories.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          No categories yet. Add one above to get started.
        </div>
      ) : (
        <div className="space-y-4">
          {tagCategories.map((category) => {
            const categoryTags = tagsByCategoryId.get(category.id) ?? [];
            const color = category.color ?? "blue";
            const dotClass = DOT_COLOR_CLASSES[color] ?? "bg-muted-foreground";

            return (
              <Card key={category.id} data-tag-category-card className="gap-3 py-4">
                <CardHeader
                  data-tag-category-header
                  className="flex flex-row items-center justify-between pb-0"
                >
                  <div className="flex items-center gap-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${dotClass}`}
                      />
                      {category.name}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({categoryTags.length})
                      </span>
                    </CardTitle>
                    <EditCategoryForm
                      category={category}
                      updateOptimisticCategory={updateOptimisticCategory}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <DeleteCategoryButton
                      categoryId={category.id}
                      categoryName={category.name}
                      removeOptimisticCategory={removeOptimisticCategory}
                    />
                  </div>
                </CardHeader>
                <CardContent data-tag-category-content className="space-y-3">
                  {/* Tags list */}
                  {categoryTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {categoryTags.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="outline"
                          className={`flex items-center gap-1 ${TAG_COLOR_CLASSES[color] ?? ""}`}
                        >
                          {tag.name}
                          <EditTagButton
                            tag={tag}
                            updateOptimisticTag={updateOptimisticTag}
                          />
                          <DeleteTagButton
                            tagId={tag.id}
                            tagName={tag.name}
                            removeOptimisticTag={removeOptimisticTag}
                          />
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Add tag form */}
                  <AddTagForm categoryId={category.id} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
