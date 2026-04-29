"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { EmailAsset } from "@/types/database";
import {
  EmailDesigner,
  type EmailDesignerHandle,
} from "./email-designer";
import {
  DEFAULT_DESIGNER_MJML,
  getAssetIdsForMjml,
  normalizeGrapesMjml,
} from "./designer-helpers";
import { publishTemplateVersionAction } from "./actions";

interface TemplateEditorProps {
  templateId: string | null;
  assets: EmailAsset[];
}

export function TemplateEditor({ templateId, assets }: TemplateEditorProps) {
  const designerRef = useRef<EmailDesignerHandle | null>(null);
  const [subject, setSubject] = useState("Hello {{contact.name}}");
  const [previewText, setPreviewText] = useState("");
  const [mjml, setMjml] = useState(DEFAULT_DESIGNER_MJML);
  const [isSourceOpen, setIsSourceOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handlePublish() {
    if (!templateId) return;
    startTransition(async () => {
      try {
        const snapshot = designerRef.current?.getSnapshot() ?? {
          mjml: normalizeGrapesMjml(mjml),
          builderJson: { editor: "grapesjs-mjml", project: null },
        };
        await publishTemplateVersionAction({
          templateId,
          subject,
          previewText,
          builderJson: snapshot.builderJson,
          mjml: snapshot.mjml,
          assetIds: getAssetIdsForMjml(snapshot.mjml, assets),
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

      <EmailDesigner
        ref={designerRef}
        assets={assets}
        sourceMjml={mjml}
        onSourceMjmlChange={setMjml}
      />

      <div className="rounded-md border border-border">
        <button
          type="button"
          onClick={() => setIsSourceOpen((current) => !current)}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted/40"
        >
          MJML source
          <span className="text-xs text-muted-foreground">
            {isSourceOpen ? "Hide" : "Show"}
          </span>
        </button>
        {isSourceOpen && (
          <div className="border-t border-border p-3">
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium text-foreground">MJML source</span>
              <textarea
                value={mjml}
                onChange={(event) => setMjml(event.target.value)}
                rows={10}
                className="font-mono rounded-md border border-border bg-background px-3 py-2 text-xs"
              />
            </label>
            <button
              type="button"
              onClick={() => designerRef.current?.loadMjml(mjml)}
              className="mt-3 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              Load source into designer
            </button>
          </div>
        )}
      </div>

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
