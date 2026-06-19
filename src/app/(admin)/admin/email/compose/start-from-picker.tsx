"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  FilePlus2,
  LayoutTemplate,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import type { EmailTemplate } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * "Start from…" picker — replaces the old Templates tab. An email starts blank
 * or from a saved template (the library auto-accumulates every distinct email
 * that gets sent). Templates can be removed here; removal is a soft archive.
 */
export function StartFromPicker({
  templates,
  selectedTemplateId,
  onSelectBlank,
  onSelectTemplate,
  onDeleteTemplate,
  onRenameTemplate,
  disabled,
}: {
  templates: EmailTemplate[];
  /** "" means a blank starting point. */
  selectedTemplateId: string;
  onSelectBlank: () => void;
  onSelectTemplate: (templateId: string) => void;
  onDeleteTemplate: (templateId: string) => void;
  onRenameTemplate: (templateId: string, name: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function startRename(template: EmailTemplate) {
    setConfirmingDeleteId(null);
    setRenamingId(template.id);
    setRenameValue(template.name);
  }

  function commitRename(templateId: string) {
    const next = renameValue.trim();
    if (next) onRenameTemplate(templateId, next);
    setRenamingId(null);
  }

  const selected = templates.find(
    (template) => template.id === selectedTemplateId,
  );
  const label = selected ? selected.name : "Blank email";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setConfirmingDeleteId(null);
          setRenamingId(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-9 w-full justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <LayoutTemplate className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-1"
      >
        <button
          type="button"
          onClick={() => {
            onSelectBlank();
            setOpen(false);
          }}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted ${
            selectedTemplateId ? "text-foreground" : "font-medium text-primary"
          }`}
        >
          <FilePlus2 className="size-3.5" />
          Blank email
        </button>

        {templates.length > 0 && (
          <div className="my-1 border-t border-border" />
        )}

        <div className="max-h-[260px] overflow-auto">
          {templates.map((template) => {
            const isConfirming = confirmingDeleteId === template.id;
            const isRenaming = renamingId === template.id;
            const isSelected = template.id === selectedTemplateId;

            if (isRenaming) {
              return (
                <div
                  key={template.id}
                  className="flex items-center gap-1 rounded-md bg-muted px-1 py-1"
                >
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitRename(template.id);
                      if (event.key === "Escape") setRenamingId(null);
                    }}
                    maxLength={120}
                    className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-sm"
                  />
                  <button
                    type="button"
                    aria-label="Save name"
                    onClick={() => commitRename(template.id)}
                    disabled={!renameValue.trim()}
                    className="shrink-0 rounded p-1.5 text-primary hover:bg-primary/10 disabled:opacity-40"
                  >
                    <Check className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel rename"
                    onClick={() => setRenamingId(null)}
                    className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={template.id}
                className="flex items-center gap-0.5 rounded-md hover:bg-muted"
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectTemplate(template.id);
                    setOpen(false);
                  }}
                  className={`min-w-0 flex-1 truncate px-2 py-2 text-left text-sm ${
                    isSelected ? "font-medium text-primary" : "text-foreground"
                  }`}
                >
                  {template.name}
                </button>
                {isConfirming ? (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteTemplate(template.id);
                      setConfirmingDeleteId(null);
                    }}
                    className="mr-1 shrink-0 rounded px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                  >
                    Remove?
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={`Rename ${template.name}`}
                      onClick={() => startRename(template)}
                      className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${template.name}`}
                      onClick={() => setConfirmingDeleteId(template.id)}
                      className="mr-1 shrink-0 rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
