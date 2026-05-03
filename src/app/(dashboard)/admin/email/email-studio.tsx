"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { EmailSend, EmailTemplate } from "@/types/database";
import {
  deleteEmailSendAction,
  getEmailSendDiagnosticsAction,
  type EmailSendDiagnostics,
} from "./actions";
import { EmailComposer } from "./compose/email-composer";
import { TemplateEditor } from "./templates/template-editor";

type EmailTab = "compose" | "templates" | "sent";
type DiagnosticsBySendId = Record<string, EmailSendDiagnostics>;

function isActiveSend(send: EmailSend) {
  return send.status === "queued" || send.status === "sending";
}

function isRemovableSend(send: EmailSend) {
  return (
    send.status === "draft" ||
    send.status === "queued" ||
    send.status === "failed"
  );
}

export function EmailStudio({
  templates,
  sends,
  selectedContactIds,
}: {
  templates: EmailTemplate[];
  sends: EmailSend[];
  selectedContactIds: string[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<EmailTab>("compose");
  const [localSends, setLocalSends] = useState(sends);
  const [deletingSendId, setDeletingSendId] = useState<string | null>(null);
  const [isDeletingSend, startDeleteSendTransition] = useTransition();
  const [expandedSendId, setExpandedSendId] = useState<string | null>(null);
  const [diagnosticsBySendId, setDiagnosticsBySendId] =
    useState<DiagnosticsBySendId>({});
  const [loadingDiagnosticsId, setLoadingDiagnosticsId] = useState<string | null>(
    null,
  );
  const [isLoadingDiagnostics, startDiagnosticsTransition] = useTransition();
  const [isRefreshing, startRefreshTransition] = useTransition();

  useEffect(() => {
    setLocalSends(sends);
  }, [sends]);

  const hasActiveSends = localSends.some(isActiveSend);

  useEffect(() => {
    if (activeTab !== "sent" || !hasActiveSends) return;
    const intervalId = window.setInterval(() => {
      router.refresh();
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [activeTab, hasActiveSends, router]);

  function refreshStatuses() {
    startRefreshTransition(() => {
      router.refresh();
    });
  }

  function handleSendStarted() {
    setActiveTab("sent");
    router.refresh();
    toast.success("Email sending started. Tracking it in Sent emails.");
  }

  function handleDeleteSend(sendId: string) {
    setDeletingSendId(sendId);
    startDeleteSendTransition(async () => {
      try {
        await deleteEmailSendAction(sendId);
        setLocalSends((current) =>
          current.filter((send) => send.id !== sendId),
        );
        toast.success("Email removed.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to remove email.",
        );
      } finally {
        setDeletingSendId(null);
      }
    });
  }

  function handleToggleDiagnostics(sendId: string) {
    if (expandedSendId === sendId) {
      setExpandedSendId(null);
      return;
    }

    setExpandedSendId(sendId);
    if (diagnosticsBySendId[sendId]) return;

    setLoadingDiagnosticsId(sendId);
    startDiagnosticsTransition(async () => {
      try {
        const diagnostics = await getEmailSendDiagnosticsAction(sendId);
        setDiagnosticsBySendId((current) => ({
          ...current,
          [sendId]: diagnostics,
        }));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load email diagnostics.",
        );
      } finally {
        setLoadingDiagnosticsId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[length:var(--font-size-h2)] font-medium text-foreground">
            Email
          </h1>
        </div>
        <div className="inline-flex rounded-md border border-border bg-card p-1">
          {[
            ["compose", "Compose"],
            ["templates", "Templates"],
            ["sent", "Sent emails"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key as EmailTab)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "compose" && (
        <EmailComposer
          key={selectedContactIds.join(",")}
          templates={templates}
          selectedContactIds={selectedContactIds}
          onSendStarted={handleSendStarted}
        />
      )}

      {activeTab === "templates" && (
        <TemplateEditor templates={templates} />
      )}

      {activeTab === "sent" && (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-base font-medium text-foreground">Sent emails</h2>
            <div className="flex items-center gap-3">
              {hasActiveSends && (
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Updating queued emails
                </span>
              )}
              <button
                type="button"
                onClick={refreshStatuses}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>
          </div>
          {localSends.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              No emails have been sent yet.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {localSends.map((send) => {
                const isExpanded = expandedSendId === send.id;
                const diagnostics = diagnosticsBySendId[send.id];
                const isLoadingThis =
                  isLoadingDiagnostics && loadingDiagnosticsId === send.id;

                return (
                  <Fragment key={send.id}>
                    <div className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[minmax(180px,1fr)_120px_140px_120px_auto]">
                      <div>
                        <p className="font-medium text-foreground">{send.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {send.subject_template}
                        </p>
                      </div>
                      <span className="capitalize text-muted-foreground">
                        {send.kind}
                      </span>
                      <span
                        className={`inline-flex items-center gap-2 capitalize ${
                          send.status === "failed"
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {isActiveSend(send) && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        {send.status.replace("_", " ")}
                      </span>
                      <span className="text-muted-foreground">
                        {send.sent_count}/{send.recipient_count} sent
                      </span>
                      <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                        <button
                          type="button"
                          onClick={() => handleToggleDiagnostics(send.id)}
                          className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium ${
                            send.status === "failed"
                              ? "border-destructive/60 text-destructive"
                              : "border-border text-foreground"
                          }`}
                        >
                          {send.status === "failed" && (
                            <AlertCircle className="h-3.5 w-3.5" />
                          )}
                          {send.status === "failed" ? "Error details" : "Details"}
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {isRemovableSend(send) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSend(send.id)}
                            disabled={
                              isDeletingSend && deletingSendId === send.id
                            }
                            className="inline-flex items-center gap-2 rounded-md border border-destructive/60 px-3 py-1.5 text-xs font-medium text-destructive disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {isDeletingSend && deletingSendId === send.id
                              ? "Removing..."
                              : "Remove"}
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="bg-muted/30 px-4 py-4">
                        {isLoadingThis ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading diagnostics...
                          </div>
                        ) : diagnostics ? (
                          <div className="space-y-3">
                            {diagnostics.recipients.map((recipient) => (
                              <div
                                key={recipient.id}
                                className="rounded-md border border-border bg-background p-3 text-sm"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className="font-medium text-foreground">
                                      {recipient.name || recipient.email}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      CRM recipient: {recipient.email}
                                    </p>
                                  </div>
                                  <span
                                    className={`rounded border px-2 py-1 text-xs capitalize ${
                                      recipient.status === "failed"
                                        ? "border-destructive/40 text-destructive"
                                        : "border-border text-muted-foreground"
                                    }`}
                                  >
                                    {recipient.status.replace("_", " ")}
                                  </span>
                                </div>
                                {(recipient.lastError ||
                                  recipient.skipReason ||
                                  recipient.providerMessageId) && (
                                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                                    {recipient.lastError && (
                                      <p className="text-destructive">
                                        {recipient.lastError}
                                      </p>
                                    )}
                                    {recipient.providerRecipientEmail && (
                                      <p>
                                        Provider recipient:{" "}
                                        {recipient.providerRecipientEmail}
                                        {recipient.testRecipientOverride
                                          ? " (test override)"
                                          : ""}
                                      </p>
                                    )}
                                    {recipient.skipReason && (
                                      <p>Skip reason: {recipient.skipReason}</p>
                                    )}
                                    {recipient.providerMessageId && (
                                      <p>
                                        Provider message ID:{" "}
                                        {recipient.providerMessageId}
                                      </p>
                                    )}
                                    <p>Attempts: {recipient.attempts}</p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No diagnostics loaded.
                          </p>
                        )}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
