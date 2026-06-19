"use client";

import { useState, useTransition } from "react";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { EmailTemplate } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createAndPublishTemplateAction } from "../templates/actions";

/**
 * Saves the email currently being composed as a new, reusable template so it
 * shows up in the "Start from…" picker. Creation only — renaming an existing
 * template lives in the picker itself.
 */
export function SaveAsTemplate({
  getBuilderJson,
  suggestedName,
  onSaved,
  disabled,
}: {
  getBuilderJson: () => unknown;
  suggestedName: string;
  onSaved: (template: EmailTemplate, versionId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isSaving, startSaveTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Seed the field with a sensible default each time it opens.
    if (next) setName(suggestedName);
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give the template a name.");
      return;
    }
    startSaveTransition(async () => {
      try {
        const result = await createAndPublishTemplateAction({
          name: trimmed,
          builderJson: getBuilderJson(),
        });
        onSaved(result.template, result.versionId);
        setOpen(false);
        toast.success("Saved as a template.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save template.",
        );
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-8 gap-1.5 font-normal"
        >
          <BookmarkPlus className="size-3.5" />
          Save as template
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="text-xs font-medium text-foreground">Save as template</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Reuse this design later from “Start from”.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSave();
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder="Template name"
          maxLength={120}
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {isSaving && <Loader2 className="size-3.5 animate-spin" />}
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
