"use client";

import { useActionState, useEffect, useRef } from "react";
import type { EmailTemplate } from "@/types/database";
import {
  createTemplateAction,
  type EmailTemplateFormState,
} from "./actions";

const initialState: EmailTemplateFormState = {
  errors: {},
  message: "",
  template: null,
  success: false,
};

export function CreateTemplateForm({
  onCreated,
}: {
  onCreated: (template: EmailTemplate) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const latestHandledTemplateIdRef = useRef<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    createTemplateAction,
    initialState,
  );

  useEffect(() => {
    if (!state.success || !state.template) return;
    if (state.template.id === latestHandledTemplateIdRef.current) return;
    latestHandledTemplateIdRef.current = state.template.id;
    onCreated(state.template);
    formRef.current?.reset();
  }, [onCreated, state.success, state.template]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-[minmax(180px,1fr)_minmax(200px,1.2fr)_auto]"
    >
      <input type="hidden" name="category" value="general" />
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Name
        </label>
        <input
          name="name"
          placeholder="Newsletter frame"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        {state.errors.name?.[0] && (
          <p className="mt-1 text-xs text-destructive">{state.errors.name[0]}</p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Description (optional)
        </label>
        <input
          name="description"
          placeholder="Header, footer, or visual layout"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {isPending ? "Creating..." : "New template"}
        </button>
      </div>
    </form>
  );
}
