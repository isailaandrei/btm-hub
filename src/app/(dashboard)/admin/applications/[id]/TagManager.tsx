"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addTag, removeTag } from "../actions";
import { Badge } from "@/components/ui/badge";

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
      try {
        await addTag(applicationId, newTag);
        setNewTag("");
      } catch {
        toast.error("Failed to add tag. Please try again.");
      }
    });
  }

  function handleRemove(tag: string) {
    startTransition(async () => {
      try {
        await removeTag(applicationId, tag);
      } catch {
        toast.error("Failed to remove tag. Please try again.");
      }
    });
  }

  return (
    <div>
      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="flex items-center gap-1">
              {tag}
              <button
                type="button"
                onClick={() => handleRemove(tag)}
                disabled={isPending}
                className="ml-0.5 text-muted-foreground transition-colors hover:text-red-400 disabled:opacity-50"
              >
                &times;
              </button>
            </Badge>
          ))}
        </div>
      )}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="Add tag..."
          className="flex-1 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={isPending || !newTag.trim()}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
