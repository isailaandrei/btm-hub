"use client";

import { useActionState } from "react";
import {
  submitCategoryForm,
  type TagFormState,
} from "./actions";
import { TAG_COLOR_PRESETS } from "../constants";

const initialState: TagFormState = {
  errors: null,
  message: null,
  success: false,
  resetKey: 0,
};

export function AddCategoryForm() {
  const [state, formAction, isPending] = useActionState(
    submitCategoryForm,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-40 flex-1">
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Name
        </label>
        <input
          key={`category-name-${state.resetKey}`}
          type="text"
          name="name"
          placeholder="e.g. Program Interest"
          maxLength={100}
          disabled={isPending}
          className="w-full rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary disabled:opacity-60"
        />
        {state.errors?.name && (
          <p className="mt-1 text-xs text-destructive">{state.errors.name[0]}</p>
        )}
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Color
        </label>
        <select
          key={`category-color-${state.resetKey}`}
          name="color"
          defaultValue="blue"
          disabled={isPending}
          className="rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
        >
          {TAG_COLOR_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>
        {state.errors?.color && (
          <p className="mt-1 text-xs text-destructive">{state.errors.color[0]}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Adding..." : "Add Category"}
      </button>
      {state.message && (
        <p
          className={`basis-full text-sm ${
            state.success ? "text-primary" : "text-destructive"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
