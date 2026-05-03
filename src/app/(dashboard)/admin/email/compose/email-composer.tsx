"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { EmailSendKind, EmailTemplate } from "@/types/database";
import {
  createDefaultMailyDocument,
  type MailyDocument,
  parseMailyDocumentOrDefault,
} from "@/lib/email/rendering/maily";
import {
  EmailDesigner,
  type EmailDesignerHandle,
} from "../templates/email-designer";
import { getTemplateVersionForEditorAction } from "../templates/actions";
import { sendEmailNowAction } from "../actions";
import { getRecipientSummary } from "./recipient-summary";

export function EmailComposer({
  templates,
  selectedContactIds,
  onSendStarted,
}: {
  templates: EmailTemplate[];
  selectedContactIds: string[];
  onSendStarted?: () => void;
}) {
  const publishedTemplates = useMemo(
    () => templates.filter((template) => template.current_version_id),
    [templates],
  );
  const [kind, setKind] = useState<EmailSendKind>(
    selectedContactIds.length > 0 ? "outreach" : "broadcast",
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    publishedTemplates[0]?.id ?? "",
  );
  const [subject, setSubject] = useState("Hello {{contact.name}}");
  const [previewText, setPreviewText] = useState("");
  const [document, setDocument] = useState<MailyDocument>(() =>
    createDefaultMailyDocument(),
  );
  const [isLoadingTemplate, startLoadTransition] = useTransition();
  const [isSending, startSendTransition] = useTransition();
  const designerRef = useRef<EmailDesignerHandle>(null);

  const selectedTemplate = publishedTemplates.find(
    (template) => template.id === selectedTemplateId,
  );
  const selectedTemplateVersionId = selectedTemplate?.current_version_id ?? "";

  useEffect(() => {
    if (!selectedTemplateVersionId) return;
    startLoadTransition(async () => {
      try {
        const version = await getTemplateVersionForEditorAction(
          selectedTemplateVersionId,
        );
        if (!version) return;
        const nextDocument = parseMailyDocumentOrDefault(version.builderJson);
        setSubject(version.subject);
        setPreviewText(version.previewText);
        setDocument(nextDocument);
        designerRef.current?.loadDocument(nextDocument);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load template.",
        );
      }
    });
  }, [selectedTemplateVersionId]);

  function handleSendNow() {
    if (!selectedTemplateVersionId) {
      toast.error("Select a published template first.");
      return;
    }
    startSendTransition(async () => {
      try {
        const snapshot = designerRef.current?.getSnapshot();
        await sendEmailNowAction({
          kind,
          subject,
          templateVersionId: selectedTemplateVersionId,
          builderJson: snapshot?.builderJson ?? document,
          previewText,
          contactIds: selectedContactIds,
        });
        if (onSendStarted) {
          onSendStarted();
        } else {
          toast.success("Email sending started.");
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to start sending.",
        );
      }
    });
  }

  const recipientSummary = getRecipientSummary({
    kind,
    selectedContactCount: selectedContactIds.length,
  });

  if (publishedTemplates.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-6">
        <h2 className="text-base font-medium text-foreground">Compose</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Create and publish a template first, then use it as the starting point
          for an email.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 rounded-md border border-border bg-card p-4 lg:grid-cols-[180px_minmax(220px,1fr)_minmax(220px,1fr)_auto]">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Type
          </span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as EmailSendKind)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="broadcast">Broadcast</option>
            <option value="outreach">Outreach</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Template
          </span>
          <select
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {publishedTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Subject
          </span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={handleSendNow}
            disabled={isSending || isLoadingTemplate}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isSending ? "Sending..." : "Send now"}
          </button>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Recipients</p>
          <p className="mt-1 text-sm text-foreground">
            {recipientSummary.headline}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {recipientSummary.detail}
          </p>
        </div>
      </div>

      <label className="block rounded-md border border-border bg-card p-4">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">
          Preview text
        </span>
        <input
          value={previewText}
          onChange={(event) => setPreviewText(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>

      <EmailDesigner
        ref={designerRef}
        sourceDocument={document}
        onDocumentChange={setDocument}
      />
    </div>
  );
}
