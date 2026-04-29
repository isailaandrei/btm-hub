"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  createTemplateAction,
  type EmailTemplateFormState,
} from "./actions";

const initialState: EmailTemplateFormState = {
  errors: {},
  message: "",
  templateId: null,
  success: false,
  resetKey: 0,
};

interface CreateTemplateFormProps {
  onTemplateCreated: (templateId: string) => void;
}

export function CreateTemplateForm({
  onTemplateCreated,
}: CreateTemplateFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    createTemplateAction,
    initialState,
  );
  const handledResetKeyRef = useRef(0);

  useEffect(() => {
    if (!state.success || !state.templateId) return;
    if (state.resetKey === handledResetKeyRef.current) return;
    handledResetKeyRef.current = state.resetKey;
    onTemplateCreated(state.templateId);
    router.refresh();
  }, [
    onTemplateCreated,
    router,
    state.resetKey,
    state.success,
    state.templateId,
  ]);

  return (
    <form
      aria-label="Create email template"
      action={formAction}
      className="flex flex-col gap-3 rounded-md border border-border p-3"
    >
      <div>
        <h3 className="text-sm font-medium text-foreground">New template</h3>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Name</span>
        <input
          key={`template-name-${state.resetKey}`}
          name="name"
          maxLength={120}
          disabled={isPending}
          className="rounded-md border border-border bg-background px-3 py-2 disabled:opacity-60"
        />
        {state.errors.name && (
          <span className="text-xs text-destructive">{state.errors.name[0]}</span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Category</span>
        <input
          key={`template-category-${state.resetKey}`}
          name="category"
          defaultValue="outreach"
          maxLength={80}
          disabled={isPending}
          className="rounded-md border border-border bg-background px-3 py-2 disabled:opacity-60"
        />
        {state.errors.category && (
          <span className="text-xs text-destructive">
            {state.errors.category[0]}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Description</span>
        <textarea
          key={`template-description-${state.resetKey}`}
          name="description"
          rows={2}
          maxLength={500}
          disabled={isPending}
          className="rounded-md border border-border bg-background px-3 py-2 disabled:opacity-60"
        />
        {state.errors.description && (
          <span className="text-xs text-destructive">
            {state.errors.description[0]}
          </span>
        )}
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {isPending ? "Creating..." : "Create template"}
        </button>
        {state.message && (
          <span
            className={`text-xs ${
              state.success ? "text-primary" : "text-destructive"
            }`}
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
