"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { useAdminData } from "../admin-data-provider";
import { addCategory, removeCategory, addTagToCategory, removeTag } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const TAG_COLOR_CLASSES: Record<string, string> = {
  red: "border-red-500/40 bg-red-500/10 text-red-400",
  orange: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  yellow: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  green: "border-green-500/40 bg-green-500/10 text-green-400",
  blue: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  purple: "border-purple-500/40 bg-purple-500/10 text-purple-400",
  pink: "border-pink-500/40 bg-pink-500/10 text-pink-400",
};

const COLOR_PRESETS = [
  { label: "Red", value: "red" },
  { label: "Orange", value: "orange" },
  { label: "Yellow", value: "yellow" },
  { label: "Green", value: "green" },
  { label: "Blue", value: "blue" },
  { label: "Purple", value: "purple" },
  { label: "Pink", value: "pink" },
] as const;

const DOT_COLOR_CLASSES: Record<string, string> = {
  red: "bg-red-400",
  orange: "bg-orange-400",
  yellow: "bg-yellow-400",
  green: "bg-green-400",
  blue: "bg-blue-400",
  purple: "bg-purple-400",
  pink: "bg-pink-400",
};

export function TagsPanel() {
  const { tagCategories, tags, contactsError, ensureContacts } = useAdminData();
  const [isPending, startTransition] = useTransition();

  // Add category form state
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState<string>("blue");

  // Per-category add-tag input state
  const [newTagNames, setNewTagNames] = useState<Record<string, string>>({});

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

  function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        await addCategory(name, newCategoryColor);
        setNewCategoryName("");
        setNewCategoryColor("blue");
        toast.success(`Category "${name}" created.`);
      } catch {
        toast.error("Failed to create category. Please try again.");
      }
    });
  }

  function handleDeleteCategory(id: string, name: string) {
    if (!window.confirm(`Delete category "${name}" and all its tags? This cannot be undone.`)) return;
    startTransition(async () => {
      try {
        await removeCategory(id);
        toast.success(`Category "${name}" deleted.`);
      } catch {
        toast.error("Failed to delete category. Please try again.");
      }
    });
  }

  function handleAddTag(categoryId: string, e: React.FormEvent) {
    e.preventDefault();
    const name = (newTagNames[categoryId] ?? "").trim();
    if (!name) return;
    startTransition(async () => {
      try {
        await addTagToCategory(categoryId, name);
        setNewTagNames((prev) => ({ ...prev, [categoryId]: "" }));
        toast.success(`Tag "${name}" added.`);
      } catch {
        toast.error("Failed to add tag. Please try again.");
      }
    });
  }

  function handleDeleteTag(tagId: string, tagName: string) {
    startTransition(async () => {
      try {
        await removeTag(tagId);
        toast.success(`Tag "${tagName}" deleted.`);
      } catch {
        toast.error("Failed to delete tag. Please try again.");
      }
    });
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
          <form onSubmit={handleAddCategory} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-40">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Name
              </label>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Program Interest"
                maxLength={100}
                className="w-full rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Color
              </label>
              <select
                value={newCategoryColor}
                onChange={(e) => setNewCategoryColor(e.target.value)}
                className="rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
              >
                {COLOR_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={isPending || !newCategoryName.trim()}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Add Category
            </button>
          </form>
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
            const categoryTags = (tags ?? []).filter((t) => t.category_id === category.id);
            const color = category.color ?? "blue";
            const dotClass = DOT_COLOR_CLASSES[color] ?? "bg-muted-foreground";

            return (
              <Card key={category.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${dotClass}`}
                    />
                    {category.name}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({categoryTags.length})
                    </span>
                  </CardTitle>
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(category.id, category.name)}
                    disabled={isPending}
                    className="rounded px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                  >
                    Delete category
                  </button>
                </CardHeader>
                <CardContent>
                  {/* Tags list */}
                  {categoryTags.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {categoryTags.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="outline"
                          className={`flex items-center gap-1 ${TAG_COLOR_CLASSES[color] ?? ""}`}
                        >
                          {tag.name}
                          <button
                            type="button"
                            onClick={() => handleDeleteTag(tag.id, tag.name)}
                            disabled={isPending}
                            className="ml-0.5 transition-colors hover:text-red-400 disabled:opacity-50"
                          >
                            &times;
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Add tag form */}
                  <form
                    onSubmit={(e) => handleAddTag(category.id, e)}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={newTagNames[category.id] ?? ""}
                      onChange={(e) =>
                        setNewTagNames((prev) => ({ ...prev, [category.id]: e.target.value }))
                      }
                      placeholder="Add tag..."
                      maxLength={100}
                      className="flex-1 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
                    />
                    <button
                      type="submit"
                      disabled={isPending || !(newTagNames[category.id] ?? "").trim()}
                      className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </form>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
