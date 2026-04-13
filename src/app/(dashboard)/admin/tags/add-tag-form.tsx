"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  submitTagForm,
  type TagFormState,
} from "./actions";

const initialState: TagFormState = {
  errors: null,
  message: null,
  success: false,
  resetKey: 0,
};

interface AddTagFormProps {
  categoryId: string;
  placeholder?: string;
  submitLabel?: string;
  compact?: boolean;
  onSuccess?: () => void;
}

export function AddTagForm({
  categoryId,
  placeholder = "Add a tag...",
  submitLabel = "Add",
  compact = false,
  onSuccess,
}: AddTagFormProps) {
  const [state, formAction, isPending] = useActionState(
    submitTagForm,
    initialState,
  );
  const latestHandledResetKeyRef = useRef(0);

  useEffect(() => {
    if (!state.success) return;
    if (state.resetKey === latestHandledResetKeyRef.current) return;
    latestHandledResetKeyRef.current = state.resetKey;
    onSuccess?.();
  }, [onSuccess, state.resetKey, state.success]);

  return (
    <form action={formAction} className={compact ? "flex items-center gap-1 p-2" : "flex gap-2"}>
      <input type="hidden" name="categoryId" value={categoryId} />
      <div className={compact ? "flex-1" : "flex-1"}>
        <input
          key={`${categoryId}-${state.resetKey}`}
          type="text"
          name="name"
          placeholder={placeholder}
          maxLength={100}
          disabled={isPending}
          className={
            compact
              ? "w-full rounded border border-border bg-muted px-2 py-1 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary disabled:opacity-60"
              : "flex-1 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary disabled:opacity-60"
          }
        />
        {(state.errors?.name || state.errors?.categoryId) && (
          <p className="mt-1 text-xs text-destructive">
            {state.errors?.name?.[0] ?? state.errors?.categoryId?.[0]}
          </p>
        )}
        {state.message && (
          <p
            className={`mt-1 text-xs ${
              state.success ? "text-primary" : "text-destructive"
            }`}
          >
            {state.message}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={isPending}
        className={
          compact
            ? "rounded bg-primary px-2 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            : "rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        }
      >
        {isPending ? "Adding..." : submitLabel}
      </button>
    </form>
  );
}
