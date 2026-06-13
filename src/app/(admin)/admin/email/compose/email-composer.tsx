"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { EmailSendKind, EmailTemplate } from "@/types/database";
import {
  assertMailyDocument,
  createDefaultMailyDocument,
  type MailyDocument,
} from "@/lib/email/rendering/maily";
import {
  EmailDesigner,
  type EmailDesignerHandle,
} from "../templates/email-designer";
import {
  sendEmailNowAction,
  type EmailTemplateVersionsById,
  type EmailTemplateVersionDocument,
} from "../actions";
import {
  BROADCAST_CONFIRMATION_MESSAGE,
  requiresBroadcastConfirmation,
} from "./broadcast-confirmation";
import { getRecipientSummary } from "./recipient-summary";

function readCachedTemplateDocument(
  versionId: string,
  templateVersionsById: EmailTemplateVersionsById,
) {
  const cachedVersion = templateVersionsById[versionId];
  if (!cachedVersion) return null;
  return assertMailyDocument(cachedVersion.builderJson);
}

export function EmailComposer({
  templates,
  templateVersionsById,
  ensureTemplateVersion,
  selectedContactIds,
  onSendStarted,
}: {
  templates: EmailTemplate[];
  templateVersionsById: EmailTemplateVersionsById;
  ensureTemplateVersion: (
    versionId: string,
    options?: { quiet?: boolean },
  ) => Promise<EmailTemplateVersionDocument | null>;
  selectedContactIds: string[];
  onSendStarted?: () => void;
}) {
  const publishedTemplates = useMemo(
    () => templates.filter((template) => template.current_version_id),
    [templates],
  );
  const [kind, setKind] = useState<EmailSendKind>("outreach");
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    publishedTemplates[0]?.id ?? "",
  );
  const initialTemplateVersionId =
    publishedTemplates[0]?.current_version_id ?? "";
  const [subject, setSubject] = useState("Hello {{contact.name}}");
  const [previewText, setPreviewText] = useState("");
  const [document, setDocument] = useState<MailyDocument>(() => {
    if (!initialTemplateVersionId) return createDefaultMailyDocument();
    try {
      return (
        readCachedTemplateDocument(
          initialTemplateVersionId,
          templateVersionsById,
        ) ?? createDefaultMailyDocument()
      );
    } catch {
      return createDefaultMailyDocument();
    }
  });
  const [loadedTemplateVersionId, setLoadedTemplateVersionId] = useState(() => {
    if (!initialTemplateVersionId) return "";
    try {
      return readCachedTemplateDocument(
        initialTemplateVersionId,
        templateVersionsById,
      )
        ? initialTemplateVersionId
        : "";
    } catch {
      return "";
    }
  });
  const [templateLoadError, setTemplateLoadError] = useState<{
    versionId: string;
    message: string;
  } | null>(null);
  const [isBroadcastConfirmOpen, setIsBroadcastConfirmOpen] = useState(false);
  const [isLoadingTemplate, startLoadTransition] = useTransition();
  const [isSending, startSendTransition] = useTransition();
  const designerRef = useRef<EmailDesignerHandle>(null);

  const selectedTemplate = publishedTemplates.find(
    (template) => template.id === selectedTemplateId,
  );
  const selectedTemplateVersionId = selectedTemplate?.current_version_id ?? "";
  const activeTemplateLoadError =
    templateLoadError?.versionId === selectedTemplateVersionId
      ? templateLoadError.message
      : null;

  useEffect(() => {
    if (!selectedTemplateVersionId) return;
    if (loadedTemplateVersionId === selectedTemplateVersionId) return;
    let isActive = true;

    startLoadTransition(async () => {
      try {
        const version = await ensureTemplateVersion(
          selectedTemplateVersionId,
          { quiet: true },
        );
        if (!isActive || !version) return;
        const nextDocument = assertMailyDocument(version.builderJson);
        setDocument(nextDocument);
        setLoadedTemplateVersionId(selectedTemplateVersionId);
        setTemplateLoadError(null);
        designerRef.current?.loadDocument(nextDocument);
      } catch (error) {
        if (!isActive) return;
        const message =
          error instanceof Error ? error.message : "Failed to load template.";
        setTemplateLoadError({
          versionId: selectedTemplateVersionId,
          message,
        });
        toast.error(
          message,
        );
      }
    });

    return () => {
      isActive = false;
    };
  }, [ensureTemplateVersion, loadedTemplateVersionId, selectedTemplateVersionId]);

  const isTemplateReady =
    Boolean(selectedTemplateVersionId) &&
    loadedTemplateVersionId === selectedTemplateVersionId &&
    !activeTemplateLoadError;
  const isOutreachWithoutRecipients =
    kind === "outreach" && selectedContactIds.length === 0;

  function startSendNow() {
    if (!selectedTemplateVersionId) {
      toast.error("Select a published template first.");
      return;
    }
    if (!isTemplateReady) {
      toast.error(
        activeTemplateLoadError ?? "Wait for the selected template to load.",
      );
      return;
    }
    if (isOutreachWithoutRecipients) {
      toast.error("Select at least one contact before sending outreach.");
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

  function handleSendNow() {
    if (!selectedTemplateVersionId) {
      toast.error("Select a published template first.");
      return;
    }
    if (!isTemplateReady) {
      toast.error(
        activeTemplateLoadError ?? "Wait for the selected template to load.",
      );
      return;
    }
    if (isOutreachWithoutRecipients) {
      toast.error("Select at least one contact before sending outreach.");
      return;
    }
    if (requiresBroadcastConfirmation(kind)) {
      setIsBroadcastConfirmOpen(true);
      return;
    }
    startSendNow();
  }

  function handleConfirmBroadcastSend() {
    setIsBroadcastConfirmOpen(false);
    startSendNow();
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
      <div className="grid gap-4 rounded-md border border-border bg-card p-4 md:grid-cols-2">
        <div className="flex flex-col gap-4">
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
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Preview
            </span>
            <input
              value={previewText}
              onChange={(event) => setPreviewText(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="flex flex-col gap-4">
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
        </div>
      </div>

      <EmailDesigner
        ref={designerRef}
        sourceDocument={document}
        onDocumentChange={setDocument}
      />
      {activeTemplateLoadError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          This template could not be loaded. Select another template or open it
          in Templates to repair it.
        </p>
      )}

      <div className="grid gap-4 rounded-md border border-border bg-card p-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Recipients</p>
          <p className="mt-1 text-sm text-foreground">
            {recipientSummary.headline}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {recipientSummary.detail}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSendNow}
          disabled={
            isSending ||
            isLoadingTemplate ||
            !isTemplateReady ||
            isOutreachWithoutRecipients
          }
          className="h-[50px] w-[200px] justify-self-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {isSending ? "Sending..." : "Send now"}
        </button>
        <div aria-hidden="true" />
      </div>

      {isBroadcastConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="broadcast-confirm-title"
            className="w-full max-w-md rounded-md border border-border bg-background p-5 shadow-lg"
          >
            <h2
              id="broadcast-confirm-title"
              className="text-base font-medium text-foreground"
            >
              Confirm broadcast
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {BROADCAST_CONFIRMATION_MESSAGE}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsBroadcastConfirmOpen(false)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
                disabled={isSending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBroadcastSend}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                disabled={isSending}
              >
                {isSending ? "Sending..." : "Send broadcast"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
