"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addNote } from "../actions";

interface ContactNoteFormProps {
  contactId: string;
}

export function ContactNoteForm({ contactId }: ContactNoteFormProps) {
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    startTransition(async () => {
      try {
        await addNote(contactId, text);
        setText("");
      } catch {
        toast.error("Failed to add note. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a note..."
        rows={3}
        className="resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
      />
      <button
        type="submit"
        disabled={isPending || !text.trim()}
        className="self-end rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Adding..." : "Add Note"}
      </button>
    </form>
  );
}
