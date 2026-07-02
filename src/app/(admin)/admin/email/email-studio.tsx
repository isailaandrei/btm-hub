"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  MailCheck,
  PenLine,
  RefreshCw,
  RotateCw,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EmailSend } from "@/types/database";
import type { EmailSendListItem } from "@/lib/data/email-sends";
import {
  deleteEmailSendAction,
  getEmailSendDiagnosticsAction,
  retryFailedRecipientsAction,
  type EmailSendDiagnostics,
} from "./actions";
import {
  useAdminEmailData,
} from "./admin-email-data-provider";
import { EmailComposer } from "./compose/email-composer";
import { AudiencesPanel } from "./audiences/audiences-panel";
import { SentEmailPreview } from "./sent-email-preview";
import { EmailSendsRealtime } from "./email-sends-realtime";
import {
  buildEmailSendMetrics,
  type EmailSendMetricTone,
} from "./sent-metrics";
import { formatEmailSendTiming } from "./sent-date";
import { sortSendsForTriage } from "./sent-ordering";
import { buildSentRowSummary } from "./sent-summary";

type EmailTab = "compose" | "sent" | "audiences";
type DiagnosticsBySendId = Record<string, EmailSendDiagnostics>;

const EMAIL_TABS: Array<{
  key: EmailTab;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "compose", label: "Compose", icon: PenLine },
  { key: "sent", label: "Sent emails", icon: MailCheck },
  { key: "audiences", label: "Audiences", icon: Users },
];

function isActiveSend(send: EmailSend) {
  return send.status === "queued" || send.status === "sending";
}

function isRemovableSend(send: EmailSend) {
  // Anything except an in-flight send. Deleting a send mid-dispatch would race
  // the drain/worker; everything else (drafts, queued, and terminal sends with
  // their history) is safe to remove. Mirrors deleteRemovableEmailSend.
  return send.status !== "sending";
}

/** Whether removing this send also discards real delivery history (and so needs
 * a heavier confirmation). */
function hasDeliveryHistory(send: EmailSend) {
  return (
    send.status === "sent" ||
    send.status === "partially_failed" ||
    send.sent_count > 0 ||
    send.delivered_count > 0
  );
}

/** Row title: the saved template's name, falling back to the subject. */
function sendRowTitle(send: EmailSendListItem) {
  return (
    send.template_name?.trim() ||
    send.subject_template?.trim() ||
    "Untitled email"
  );
}

function metricToneClass(tone: EmailSendMetricTone) {
  switch (tone) {
    case "positive":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "danger":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-background text-muted-foreground";
  }
}

function formatEventTime(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildRecipientActivity(
  recipient: EmailSendDiagnostics["recipients"][number],
) {
  return [
    ["Sent", recipient.sentAt],
    ["Delivered", recipient.deliveredAt],
    ["Opened", recipient.openedAt],
    // "Maybe opened": a privacy-proxy fetch (Apple Mail Privacy Protection etc.)
    // with NO confirmed open — the per-recipient mirror of the send-level "Maybe
    // opened" count. Suppressed once there's a confirmed open (incl. a click
    // backfill), since the recipient is then a real open, not a "maybe".
    ["Maybe opened", recipient.openedAt ? null : recipient.proxyOpenedAt],
    ["Button clicked", recipient.clickedAt],
    ["Deferred", recipient.deferredAt],
    ["Failed", recipient.bouncedAt],
    ["Complained", recipient.complainedAt],
    ["Unsubscribed", recipient.unsubscribedAt],
  ]
    .map(([label, value]) => ({ label, value: formatEventTime(value) }))
    .filter((item): item is { label: string; value: string } =>
      Boolean(item.value),
    );
}

function isNotReceivedRecipientStatus(status: string) {
  return status === "bounced" || status === "failed";
}

function formatRecipientStatus(status: string) {
  if (isNotReceivedRecipientStatus(status)) return "failed";
  return status.replace("_", " ");
}

function EmailStudioContent({
  isVisible = true,
  selectedContactIds,
}: {
  isVisible?: boolean;
  selectedContactIds: string[];
}) {
  const {
    templates,
    sends,
    manualRecipients,
    emailError,
    ensureEmailTemplates,
    ensureManualRecipients,
    ensureEmailSends,
    refreshEmailSends,
    ensureTemplateVersion,
    setEmailSends,
    setEmailTemplates,
    setManualRecipients,
  } = useAdminEmailData();
  const [activeTab, setActiveTab] = useState<EmailTab>("compose");
  const [previewSend, setPreviewSend] = useState<EmailSend | null>(null);
  const [pendingDeleteSend, setPendingDeleteSend] =
    useState<EmailSendListItem | null>(null);
  const [deletingSendId, setDeletingSendId] = useState<string | null>(null);
  const [retryingSendId, setRetryingSendId] = useState<string | null>(null);
  const [isLoadingData, startLoadDataTransition] = useTransition();
  const [isLoadingSends, startLoadSendsTransition] = useTransition();
  const [isDeletingSend, startDeleteSendTransition] = useTransition();
  const [isRetryingSend, startRetrySendTransition] = useTransition();
  const [expandedSendId, setExpandedSendId] = useState<string | null>(null);
  const [diagnosticsBySendId, setDiagnosticsBySendId] =
    useState<DiagnosticsBySendId>({});
  const [loadingDiagnosticsId, setLoadingDiagnosticsId] = useState<string | null>(
    null,
  );
  const [isLoadingDiagnostics, startDiagnosticsTransition] = useTransition();
  const [isRefreshing, startRefreshTransition] = useTransition();

  const localSends = sends ?? [];
  // Triage order: failures first, then unsubscribes, then the rest (each
  // most-recent-first), so problems are easy to spot without scrolling.
  const orderedSends = useMemo(() => sortSendsForTriage(sends ?? []), [sends]);
  const loadError = emailError;

  const refreshData = useCallback(
    (options?: { quiet?: boolean }) => refreshEmailSends(options),
    [refreshEmailSends],
  );

  // Stable handler for the realtime subscription so it doesn't re-subscribe on
  // every render; quiet refresh so stats update without a loading flash.
  const handleSendsRealtimeChange = useCallback(() => {
    void refreshData({ quiet: true });
  }, [refreshData]);

  useEffect(() => {
    // Fetch only once the studio is actually shown. The panel is kept mounted
    // (and idle-prewarmed) while hidden to warm its bundle; loading its data
    // then would run server actions every session for a tab that may never be
    // opened. ensure* dedupes, so re-entry on visibility toggles is a no-op.
    if (!isVisible) return;
    startLoadDataTransition(async () => {
      await Promise.all([
        ensureEmailTemplates({ quiet: true }),
        ensureManualRecipients({ quiet: true }),
      ]);
    });
  }, [isVisible, ensureEmailTemplates, ensureManualRecipients]);

  useEffect(() => {
    if (activeTab !== "sent") return;
    startLoadSendsTransition(async () => {
      await ensureEmailSends({ quiet: true });
    });
  }, [activeTab, ensureEmailSends]);

  const hasActiveSends = localSends.some(isActiveSend);

  useEffect(() => {
    if (!isVisible || activeTab !== "sent" || !hasActiveSends) return;
    const intervalId = window.setInterval(() => {
      void refreshData({ quiet: true });
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [activeTab, hasActiveSends, isVisible, refreshData]);

  function refreshStatuses() {
    setDiagnosticsBySendId({});
    startRefreshTransition(async () => {
      await refreshData();
    });
  }

  function handleSelectEmailTab(tab: EmailTab) {
    setActiveTab(tab);
  }

  function handleSendStarted() {
    setActiveTab("sent");
    startRefreshTransition(async () => {
      await refreshData({ quiet: true });
    });
    toast.success("Email sending started. Tracking it in Sent emails.");
  }

  function handleDeleteSend(sendId: string) {
    setDeletingSendId(sendId);
    startDeleteSendTransition(async () => {
      try {
        await deleteEmailSendAction(sendId);
        setEmailSends((current) =>
          (current ?? []).filter((send) => send.id !== sendId),
        );
        toast.success("Email removed.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to remove email.",
        );
      } finally {
        setDeletingSendId(null);
        setPendingDeleteSend(null);
      }
    });
  }

  function handleRetryFailed(sendId: string) {
    setRetryingSendId(sendId);
    startRetrySendTransition(async () => {
      try {
        const { requeued } = await retryFailedRecipientsAction(sendId);
        if (requeued > 0) {
          toast.success(
            `Retrying ${requeued} failed recipient${requeued === 1 ? "" : "s"}.`,
          );
          setDiagnosticsBySendId((current) => {
            const next = { ...current };
            delete next[sendId];
            return next;
          });
          await refreshData({ quiet: true });
        } else {
          toast.info("No retriable failures — nothing to resend.");
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to retry recipients.",
        );
      } finally {
        setRetryingSendId(null);
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

  if (templates === null) {
    return (
      <div className="rounded-md border border-border bg-card p-6">
        {loadError ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <button
              type="button"
              onClick={() =>
                startLoadDataTransition(async () => {
                  await ensureEmailTemplates();
                })
              }
              disabled={isLoadingData}
              className="w-fit rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
            >
              {isLoadingData ? "Retrying..." : "Retry"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading email studio...
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[length:var(--font-size-h2)] font-medium text-foreground">
            Email
          </h1>
        </div>
        <div
          data-testid="email-studio-tabs"
          className="inline-flex rounded-full border border-border/70 bg-muted p-1 shadow-sm"
        >
          {EMAIL_TABS.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;

            return (
              <Button
                key={key}
                type="button"
                variant={isActive ? "default" : "ghost"}
                size="sm"
                data-testid="email-studio-tab"
                data-state={isActive ? "active" : "inactive"}
                aria-pressed={isActive}
                onClick={() => handleSelectEmailTab(key)}
                className={`h-8 rounded-full px-3 text-xs sm:text-sm ${
                  isActive
                    ? "shadow-sm hover:bg-primary/90"
                    : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
                }`}
              >
                <Icon data-icon="inline-start" className="size-3.5" />
                <span>{label}</span>
              </Button>
            );
          })}
        </div>
      </div>

      <div hidden={activeTab !== "compose"}>
        <EmailComposer
          key={selectedContactIds.join(",")}
          templates={templates}
          ensureTemplateVersion={ensureTemplateVersion}
          selectedContactIds={selectedContactIds}
          manualRecipients={manualRecipients ?? []}
          setManualRecipients={setManualRecipients}
          setTemplates={setEmailTemplates}
          onSendStarted={handleSendStarted}
          isActive={activeTab === "compose"}
        />
      </div>

      {activeTab === "sent" && (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          {isVisible && (
            <EmailSendsRealtime onChange={handleSendsRealtimeChange} />
          )}
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
                disabled={isRefreshing || isLoadingSends}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    isRefreshing || isLoadingSends ? "animate-spin" : ""
                  }`}
                />
                Refresh
              </button>
            </div>
          </div>
          {sends === null ? (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sent emails...
            </div>
          ) : localSends.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              No emails have been sent yet.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {orderedSends.map((send) => {
                const isExpanded = expandedSendId === send.id;
                const diagnostics = diagnosticsBySendId[send.id];
                const isLoadingThis =
                  isLoadingDiagnostics && loadingDiagnosticsId === send.id;
                const metrics = buildEmailSendMetrics(send);
                const sentOn = formatEmailSendTiming(send);
                const summary = buildSentRowSummary(send);
                const audiencePrefix = summary.audienceName
                  ? `${summary.audienceName} · `
                  : "";
                const subjectAndTiming = [send.subject_template, sentOn]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <Fragment key={send.id}>
                    <div className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(240px,1fr)_minmax(420px,1.8fr)_auto] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {sendRowTitle(send)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {audiencePrefix}
                          {summary.recipientText} · {summary.kindLabel}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
                          {subjectAndTiming}
                        </p>
                      </div>
                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        {metrics.map((metric) => (
                          <span
                            key={metric.key}
                            title={metric.hint}
                            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium ${metricToneClass(
                              metric.tone,
                            )}`}
                          >
                            <span>{metric.label}</span>
                            <span className="text-foreground">
                              {metric.value}
                            </span>
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                        <button
                          type="button"
                          onClick={() => setPreviewSend(send)}
                          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Preview
                        </button>
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
                        {send.failed_count > 0 && (
                          <button
                            type="button"
                            onClick={() => handleRetryFailed(send.id)}
                            disabled={
                              isRetryingSend && retryingSendId === send.id
                            }
                            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                          >
                            <RotateCw
                              className={`h-3.5 w-3.5 ${
                                isRetryingSend && retryingSendId === send.id
                                  ? "animate-spin"
                                  : ""
                              }`}
                            />
                            {isRetryingSend && retryingSendId === send.id
                              ? "Retrying..."
                              : "Retry failed"}
                          </button>
                        )}
                        {isRemovableSend(send) && (
                          <button
                            type="button"
                            onClick={() => setPendingDeleteSend(send)}
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
                            {diagnostics.recipients.map((recipient) => {
                              const activity = buildRecipientActivity(recipient);
                              return (
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
                                        isNotReceivedRecipientStatus(
                                          recipient.status,
                                        )
                                          ? "border-destructive/40 text-destructive"
                                          : "border-border text-muted-foreground"
                                      }`}
                                    >
                                      {formatRecipientStatus(recipient.status)}
                                    </span>
                                  </div>
                                  {activity.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                      {activity.map((item) => (
                                        <span
                                          key={item.label}
                                          className="rounded border border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground"
                                        >
                                          {item.label}: {item.value}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {(recipient.failureReason ||
                                    recipient.skipReason ||
                                    recipient.providerMessageId) && (
                                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                                      {recipient.failureReason && (
                                        <p
                                          className={
                                            recipient.status === "deferred"
                                              ? "text-amber-600"
                                              : "text-destructive"
                                          }
                                        >
                                          {recipient.status === "deferred"
                                            ? "Deferred — the provider will keep retrying: "
                                            : "Failure reason: "}
                                          {recipient.failureReason}
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
                              );
                            })}
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

      {activeTab === "audiences" && <AudiencesPanel />}

      {previewSend && (
        <SentEmailPreview
          key={previewSend.id}
          send={previewSend}
          kindLabel={buildSentRowSummary(previewSend).kindLabel}
          sentOn={formatEmailSendTiming(previewSend)}
          onClose={() => setPreviewSend(null)}
        />
      )}

      <Dialog
        open={pendingDeleteSend !== null}
        onOpenChange={(next) => {
          if (!next && !isDeletingSend) setPendingDeleteSend(null);
        }}
      >
        <DialogContent showCloseButton={false} className="max-w-md p-6">
          {pendingDeleteSend && (
            <>
              <DialogHeader>
                <DialogTitle>Delete this email?</DialogTitle>
                <DialogDescription>
                  {hasDeliveryHistory(pendingDeleteSend) ? (
                    <>
                      “{sendRowTitle(pendingDeleteSend)}” and all of its delivery
                      history — opens, clicks, bounces, unsubscribes, and
                      per-recipient diagnostics — will be permanently removed.
                      This can’t be undone.
                    </>
                  ) : (
                    <>
                      “{sendRowTitle(pendingDeleteSend)}” will be permanently
                      removed. This can’t be undone.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingDeleteSend(null)}
                  disabled={isDeletingSend}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSend(pendingDeleteSend.id)}
                  disabled={isDeletingSend}
                  className="inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
                >
                  {isDeletingSend ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete email
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function EmailStudio(props: {
  isVisible?: boolean;
  selectedContactIds: string[];
}) {
  return <EmailStudioContent {...props} />;
}
