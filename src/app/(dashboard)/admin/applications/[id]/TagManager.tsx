"use client";

import { useState, useTransition } from "react";
import { addTag, removeTag } from "../actions";

interface TagManagerProps {
  applicationId: string;
  tags: string[];
}

export function TagManager({ applicationId, tags }: TagManagerProps) {
  const [newTag, setNewTag] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTag.trim()) return;
    startTransition(async () => {
      await addTag(applicationId, newTag);
      setNewTag("");
    });
  }

  function handleRemove(tag: string) {
    startTransition(() => removeTag(applicationId, tag));
  }

  return (
    <div>
      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-brand-secondary px-2.5 py-0.5 text-xs text-brand-light-gray"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemove(tag)}
                disabled={isPending}
                className="ml-0.5 text-brand-cyan-blue-gray transition-colors hover:text-red-400 disabled:opacity-50"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="Add tag..."
          className="flex-1 rounded-lg border border-brand-secondary bg-brand-secondary px-3 py-1.5 text-sm text-white placeholder-brand-cyan-blue-gray outline-none focus:border-brand-primary"
        />
        <button
          type="submit"
          disabled={isPending || !newTag.trim()}
          className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
