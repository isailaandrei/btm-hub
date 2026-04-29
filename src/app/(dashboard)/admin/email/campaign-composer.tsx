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

interface CampaignComposerProps {
  templates: EmailTemplate[];
  selectedContactIds?: string[];
  selectedContacts?: Array<{ id: string; name: string; email: string }>;
  onClearSelectedContacts?: () => void;
}

type PreviewResult = Awaited<ReturnType<typeof previewCampaignAction>>;
type CampaignKind = "broadcast" | "outreach";

export function CampaignComposer({
  templates,
  selectedContactIds = [],
  selectedContacts = [],
  onClearSelectedContacts,
}: CampaignComposerProps) {
  const [kind, setKind] = useState<CampaignKind>(
    selectedContactIds.length > 0 ? "outreach" : "broadcast",
  );
  const [name, setName] = useState("New email campaign");
  const [subject, setSubject] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [draftCampaignId, setDraftCampaignId] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const selectedTemplateVersionId = selectedTemplate?.current_version_id ?? "";
  const hasSelectedContacts = selectedContactIds.length > 0;

  function handlePreview() {
    startTransition(async () => {
      try {
        const result = await previewCampaignAction({
          kind,
          contactIds: kind === "outreach" ? selectedContactIds : undefined,
          subject,
          templateVersionId: selectedTemplateVersionId,
        });
        setPreview(result);
        setDraftCampaignId(null);
        setSent(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to preview campaign.");
      }
    });
  }

  function handleCreateDraft() {
    startTransition(async () => {
      try {
        const result = await createCampaignDraftAction({
          kind,
          name,
          subject,
          templateVersionId: selectedTemplateVersionId,
          contactIds: kind === "outreach" ? selectedContactIds : undefined,
        });
        setDraftCampaignId(result.campaignId);
        setSent(false);
        toast.success("Campaign draft created.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create draft.");
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
        toast.success("Campaign sent.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send campaign.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Kind</span>
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as typeof kind);
              setPreview(null);
              setDraftCampaignId(null);
              setSent(false);
            }}
            className="rounded-md border border-border bg-background px-3 py-2"
          >
            <option value="broadcast">Broadcast</option>
            <option value="outreach" disabled={!hasSelectedContacts}>
              Selected outreach
            </option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Template</span>
          <select
            value={selectedTemplateId}
            onChange={(event) => {
              setSelectedTemplateId(event.target.value);
              setPreview(null);
              setDraftCampaignId(null);
              setSent(false);
            }}
            className="rounded-md border border-border bg-background px-3 py-2"
          >
            <option value="">Select template...</option>
            {templates
              .filter((template) => template.current_version_id)
              .map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Campaign name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Subject</span>
        <input
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
            setPreview(null);
            setDraftCampaignId(null);
            setSent(false);
          }}
          className="rounded-md border border-border bg-background px-3 py-2"
        />
      </label>

      {kind === "outreach" && (
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-foreground">
              {selectedContactIds.length} selected recipient
              {selectedContactIds.length === 1 ? "" : "s"}
            </span>
            {onClearSelectedContacts && selectedContactIds.length > 0 && (
              <button
                type="button"
                onClick={onClearSelectedContacts}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
          {selectedContacts.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedContacts.slice(0, 6).map((contact) => (
                <span
                  key={contact.id}
                  className="rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                >
                  {contact.name} - {contact.email}
                </span>
              ))}
              {selectedContactIds.length > selectedContacts.length && (
                <span className="rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                  {selectedContactIds.length - selectedContacts.length} more
                </span>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Recipient details are loading.
            </p>
          )}
        </div>
      )}

      {preview && <CampaignPreview {...preview} />}

      {draftCampaignId && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
          Draft ready to send.
        </p>
      )}
      {sent && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
          Campaign sent.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handlePreview}
          disabled={
            isPending ||
            !selectedTemplateVersionId ||
            (kind === "outreach" && selectedContactIds.length === 0)
          }
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"
        >
          {isPending ? "Working..." : "Preview"}
        </button>
        <button
          type="button"
          onClick={handleCreateDraft}
          disabled={isPending || !preview || preview.eligibleCount === 0 || !!draftCampaignId}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          Create draft
        </button>
        {draftCampaignId && (
          <button
            type="button"
            onClick={handleSend}
            disabled={isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isPending ? "Sending..." : "Send now"}
          </button>
        )}
      </div>
    </div>
  );
}
