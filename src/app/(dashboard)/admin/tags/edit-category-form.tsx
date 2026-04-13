"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import type { TagCategory } from "@/types/database";
import { TAG_COLOR_PRESETS } from "../constants";
import {
  submitCategoryEditForm,
  type TagFormState,
} from "./actions";

const initialState: TagFormState = {
  errors: null,
  message: null,
  success: false,
  resetKey: 0,
};

interface EditCategoryFormProps {
  category: TagCategory;
}

export function EditCategoryForm({ category }: EditCategoryFormProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(category.name);
  const [draftColor, setDraftColor] = useState(category.color ?? "");
  const [state, formAction, isPending] = useActionState(
    submitCategoryEditForm,
    initialState,
  );
  const [prevResetKey, setPrevResetKey] = useState(0);

  if (state.success && state.resetKey !== prevResetKey) {
    setPrevResetKey(state.resetKey);
    setIsEditing(false);
    toast.success(state.message ?? `Category "${draftName}" updated.`);
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraftName(category.name);
          setDraftColor(category.color ?? "");
          setIsEditing(true);
        }}
        className="rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        Edit
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
      <input type="hidden" name="categoryId" value={category.id} />
      <input
        type="hidden"
        name="expectedUpdatedAt"
        value={category.updated_at}
      />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Name
          </label>
          <input
            type="text"
            name="name"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            maxLength={100}
            disabled={isPending}
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Color
          </label>
          <select
            name="color"
            value={draftColor}
            onChange={(event) => setDraftColor(event.target.value)}
            disabled={isPending}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
          >
            <option value="">No color</option>
            {TAG_COLOR_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {(state.errors?.name || state.errors?.color || state.errors?.categoryId) && (
        <p className="text-xs text-destructive">
          {state.errors?.name?.[0] ??
            state.errors?.color?.[0] ??
            state.errors?.categoryId?.[0]}
        </p>
      )}
      {state.message && !state.success && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraftName(category.name);
            setDraftColor(category.color ?? "");
            setIsEditing(false);
          }}
          disabled={isPending}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
