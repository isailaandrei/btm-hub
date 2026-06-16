"use client";

import { memo, useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import type { TagCategory, Tag } from "@/types/database";
import { TAG_COLOR_CLASSES } from "../constants";
import { useAdminContactsData } from "../admin-data-provider";
import { bulkAssignTag, bulkUnassignTag } from "./actions";

interface BulkActionBarProps {
  selectedCount: number;
  selectedIds: string[];
  tagCategories: TagCategory[];
  tags: Tag[];
  onClearSelection: () => void;
  onSendEmail?: (contactIds: string[]) => void;
}

export const BulkActionBar = memo(function BulkActionBar({
  selectedCount,
  selectedIds,
  tagCategories,
  tags,
  onClearSelection,
  onSendEmail,
}: BulkActionBarProps) {
  const [categoryId, setCategoryId] = useState<string>("");
  const [tagId, setTagId] = useState<string>("");
  // Separate transitions per action so each button shows its own pending
  // state — a click on Remove only disables Remove, not Assign.
  const [isAssigning, startAssignTransition] = useTransition();
  const [isRemoving, startRemoveTransition] = useTransition();
  const isPending = isAssigning || isRemoving;
  const { addOptimisticContactTags, removeOptimisticContactTags } =
    useAdminContactsData();

  const categoryTags = categoryId
    ? tags.filter((t) => t.category_id === categoryId)
    : [];

  const contactLabel = `${selectedCount} contact${selectedCount !== 1 ? "s" : ""}`;

  function handleAssign() {
    if (!tagId) return;
    startAssignTransition(async () => {
      const { rollback } = addOptimisticContactTags(selectedIds, tagId);
      try {
        const result = await bulkAssignTag(selectedIds, tagId);
        if (!result) return;

        if (result.skippedMissing > 0) {
          toast.success(
            `Tag assigned to ${result.inserted + result.alreadyAssigned} of ${result.requested} contacts. ${result.skippedMissing} no longer existed.`,
          );
        } else if (result.alreadyAssigned > 0) {
          toast.success(
            `Tag assigned to ${contactLabel}. ${result.alreadyAssigned} already had it.`,
          );
        } else {
          toast.success(`Tag assigned to ${contactLabel}`);
        }
        setCategoryId("");
        setTagId("");
      } catch {
        rollback();
        toast.error("Failed to assign tag. Please try again.");
      }
    });
  }

  function handleRemove() {
    if (!tagId) return;
    startRemoveTransition(async () => {
      const { rollback } = removeOptimisticContactTags(selectedIds, tagId);
      try {
        await bulkUnassignTag(selectedIds, tagId);
        toast.success(`Tag removed from ${contactLabel}`);
        setCategoryId("");
        setTagId("");
      } catch {
        rollback();
        toast.error("Failed to remove tag. Please try again.");
      }
    });
  }

  const selectedCategory = tagCategories.find((c) => c.id === categoryId);
  const color = selectedCategory?.color ?? "blue";

  return (
    <div
      data-testid="contacts-bulk-action-bar"
      className="fixed inset-x-3 bottom-4 z-50 mx-auto flex max-w-5xl flex-wrap items-center gap-2.5 rounded-xl border border-border/80 bg-card/95 px-3 py-3 shadow-2xl shadow-black/10 backdrop-blur md:left-[calc(var(--sidebar-width)+1rem)] md:right-4 md:px-4"
    >
      <span className="text-sm font-medium text-foreground">
        {selectedCount} selected
      </span>

      {onSendEmail && (
        <button
          type="button"
          onClick={() => onSendEmail(selectedIds)}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Mail className="h-4 w-4" />
          Send email
        </button>
      )}

      <select
        value={categoryId}
        onChange={(e) => { setCategoryId(e.target.value); setTagId(""); }}
        className="h-9 rounded-md border border-border bg-muted px-3 text-sm text-foreground"
      >
        <option value="">Category...</option>
        {tagCategories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {categoryId && (
        <select
          value={tagId}
          onChange={(e) => setTagId(e.target.value)}
          className={`h-9 rounded-md border px-3 text-sm ${TAG_COLOR_CLASSES[color] ?? "border-border bg-muted text-foreground"}`}
        >
          <option value="">Tag...</option>
          {categoryTags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}

      <button
        type="button"
        onClick={handleAssign}
        disabled={!tagId || isPending}
        className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isAssigning ? "Assigning..." : "Assign"}
      </button>

      <button
        type="button"
        onClick={handleRemove}
        disabled={!tagId || isPending}
        className="h-9 rounded-lg border border-destructive/60 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
      >
        {isRemoving ? "Removing..." : "Remove"}
      </button>

      <button
        type="button"
        onClick={onClearSelection}
        className="ml-auto shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Clear selection
      </button>
    </div>
  );
});
