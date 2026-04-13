"use client";

import { useActionState } from "react";
import {
  submitContactNote,
  type ContactNoteFormState,
} from "../actions";

interface ContactNoteFormProps {
  contactId: string;
}

const initialState: ContactNoteFormState = {
  errors: null,
  message: null,
  success: false,
  resetKey: 0,
};

export function ContactNoteForm({ contactId }: ContactNoteFormProps) {
  const [state, formAction, isPending] = useActionState(
    submitContactNote,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="contactId" value={contactId} />
      <textarea
        key={state.resetKey}
        name="text"
        placeholder="Add a note..."
        rows={3}
        maxLength={2000}
        disabled={isPending}
        className="resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
      />
      {state.errors?.text && (
        <p className="text-sm text-destructive">{state.errors.text[0]}</p>
      )}
      {state.message && (
        <p
          className={`text-sm ${
            state.success ? "text-primary" : "text-destructive"
          }`}
        >
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="self-end rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Adding..." : "Add Note"}
      </button>
    </form>
  );
}
