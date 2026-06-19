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
import {
  createAndPublishTemplateAction,
  publishTemplateVersionAction,
} from "../templates/actions";

type Mode = "update" | "new";

/**
 * Saves the email being composed as a template. When a template is already the
 * starting point, the admin can either update that template (a new version that
 * becomes its current content) or branch off a brand-new template. With a blank
 * start there's nothing to update, so only "new" is offered.
 */
export function SaveAsTemplate({
  getBuilderJson,
  suggestedName,
  currentTemplate,
  onSavedNew,
  onUpdated,
  disabled,
}: {
  getBuilderJson: () => unknown;
  suggestedName: string;
  /** The template selected as the starting point, or null for a blank start. */
  currentTemplate: { id: string; name: string } | null;
  onSavedNew: (template: EmailTemplate, versionId: string) => void;
  onUpdated: (templateId: string, versionId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("new");
  const [name, setName] = useState("");
  const [isSaving, startSaveTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Default to updating the loaded template (the common "tweak & re-save"),
      // and seed the new-template name in case they branch off instead.
      setMode(currentTemplate ? "update" : "new");
      setName(suggestedName);
    }
  }

  function handleUpdate() {
    if (!currentTemplate) return;
    startSaveTransition(async () => {
      try {
        const result = await publishTemplateVersionAction({
          templateId: currentTemplate.id,
          builderJson: getBuilderJson(),
        });
        onUpdated(currentTemplate.id, result.versionId);
        setOpen(false);
        toast.success(`Updated “${currentTemplate.name}”.`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to update template.",
        );
      }
    });
  }

  function handleSaveNew() {
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
        onSavedNew(result.template, result.versionId);
        setOpen(false);
        toast.success("Saved as a new template.");
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
      <PopoverContent align="end" className="w-80 p-3">
        {currentTemplate && (
          <div className="mb-3 flex gap-1 rounded-lg border border-border bg-muted/50 p-1">
            {(
              [
                { key: "update" as const, label: "Update current" },
                { key: "new" as const, label: "New template" },
              ]
            ).map((option) => {
              const active = mode === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setMode(option.key)}
                  aria-pressed={active}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}

        {mode === "update" && currentTemplate ? (
          <div>
            <p className="text-xs font-medium text-foreground">
              Update “{currentTemplate.name}”
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Saves the current design as this template’s latest version. Its
              name stays the same; existing sends are unaffected.
            </p>
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
                onClick={handleUpdate}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {isSaving && <Loader2 className="size-3.5 animate-spin" />}
                {isSaving ? "Updating..." : "Update template"}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs font-medium text-foreground">
              Save as a new template
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Reuse this design later from “Start from”.
            </p>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSaveNew();
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
                onClick={handleSaveNew}
                disabled={isSaving || !name.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {isSaving && <Loader2 className="size-3.5 animate-spin" />}
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
