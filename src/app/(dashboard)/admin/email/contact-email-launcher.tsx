"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import type { EmailTemplate } from "@/types/database";
import {
  confirmCampaignSendAction,
  createCampaignDraftAction,
  previewCampaignAction,
} from "./actions";
import { CampaignPreview } from "./campaign-preview";

interface ContactEmailLauncherProps {
  contactId: string;
  contactName: string;
  templates: EmailTemplate[];
}

type PreviewResult = Awaited<ReturnType<typeof previewCampaignAction>>;

export function ContactEmailLauncher({
  contactId,
  contactName,
  templates,
}: ContactEmailLauncherProps) {
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState(`Hello ${contactName}`);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [draftCampaignId, setDraftCampaignId] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedTemplate = templates.find((template) => template.id === templateId);
  const templateVersionId = selectedTemplate?.current_version_id ?? "";
  const publishedTemplates = templates.filter((template) => template.current_version_id);

  function resetDraftState() {
    setPreview(null);
    setDraftCampaignId(null);
    setSent(false);
  }

  function handlePreview() {
    startTransition(async () => {
      try {
        const result = await previewCampaignAction({
          kind: "one_off",
          oneOffContactId: contactId,
          subject,
          templateVersionId,
        });
        setPreview(result);
        setDraftCampaignId(null);
        setSent(false);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to preview one-off email.",
        );
      }
    });
  }

  function handleCreateDraft() {
    startTransition(async () => {
      try {
        const result = await createCampaignDraftAction({
          kind: "one_off",
          name: `One-off email: ${contactName}`,
          subject,
          templateVersionId,
          oneOffContactId: contactId,
        });
        setDraftCampaignId(result.campaignId);
        setSent(false);
        toast.success("One-off draft created.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to create one-off draft.",
        );
      }
    });
  }

  function handleSend() {
    if (!draftCampaignId) return;
    startTransition(async () => {
      try {
        await confirmCampaignSendAction(draftCampaignId);
        setDraftCampaignId(null);
        setPreview(null);
        setSent(true);
        toast.success("One-off email sent.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to send one-off email.",
        );
      }
    });
  }

  if (publishedTemplates.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
        No published email templates yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">One-off template</span>
        <select
          value={templateId}
          onChange={(event) => {
            setTemplateId(event.target.value);
            resetDraftState();
          }}
          className="rounded-md border border-border bg-background px-3 py-2"
        >
          <option value="">Select template...</option>
          {publishedTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">One-off subject</span>
        <input
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
            resetDraftState();
          }}
          className="rounded-md border border-border bg-background px-3 py-2"
        />
      </label>

      {preview && <CampaignPreview {...preview} />}

      {draftCampaignId && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
          Draft ready to send.
        </p>
      )}
      {sent && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
          One-off email sent.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handlePreview}
          disabled={isPending || !templateVersionId || !subject.trim()}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground disabled:opacity-50"
        >
          {isPending ? "Working..." : "Preview one-off"}
        </button>
        <button
          type="button"
          onClick={handleCreateDraft}
          disabled={isPending || !preview || preview.eligibleCount === 0 || !!draftCampaignId}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          Create one-off draft
        </button>
        {draftCampaignId && (
          <button
            type="button"
            onClick={handleSend}
            disabled={isPending}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isPending ? "Sending..." : "Send one-off now"}
          </button>
        )}
      </div>
    </div>
  );
}
