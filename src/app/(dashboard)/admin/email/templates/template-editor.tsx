"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { publishTemplateVersionAction } from "./actions";

interface TemplateEditorProps {
  templateId: string | null;
}

const EMPTY_MJML =
  "<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{contact.name}}</mj-text></mj-column></mj-section></mj-body></mjml>";

export function TemplateEditor({ templateId }: TemplateEditorProps) {
  const [subject, setSubject] = useState("Hello {{contact.name}}");
  const [previewText, setPreviewText] = useState("");
  const [mjml, setMjml] = useState(EMPTY_MJML);
  const [isPending, startTransition] = useTransition();

  function handlePublish() {
    if (!templateId) return;
    startTransition(async () => {
      try {
        await publishTemplateVersionAction({
          templateId,
          subject,
          previewText,
          builderJson: { editor: "textarea" },
          mjml,
          assetIds: [],
        });
        toast.success("Template version published.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to publish template.",
        );
      }
    });
  }

  if (!templateId) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        Select a template to edit.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Subject</span>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Preview text</span>
        <input
          value={previewText}
          onChange={(event) => setPreviewText(event.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">MJML</span>
        <textarea
          value={mjml}
          onChange={(event) => setMjml(event.target.value)}
          rows={12}
          className="font-mono rounded-md border border-border bg-background px-3 py-2 text-xs"
        />
      </label>

      <button
        type="button"
        onClick={handlePublish}
        disabled={isPending}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {isPending ? "Publishing..." : "Publish version"}
      </button>
    </div>
  );
}
