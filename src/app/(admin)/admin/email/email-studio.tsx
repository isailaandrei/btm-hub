"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  LayoutTemplate,
  Loader2,
  MailCheck,
  PenLine,
  RefreshCw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { EmailSend } from "@/types/database";
import {
  deleteEmailSendAction,
  getEmailSendDiagnosticsAction,
  type EmailSendDiagnostics,
} from "./actions";
import {
  AdminEmailDataProvider,
  useAdminEmailData,
} from "./admin-email-data-provider";
import { EmailComposer } from "./compose/email-composer";
import {
  buildEmailSendMetrics,
  type EmailSendMetricTone,
} from "./sent-metrics";
import { formatEmailSendTiming } from "./sent-date";
import { TemplateEditor } from "./templates/template-editor";

type EmailTab = "compose" | "templates" | "sent";
type DiagnosticsBySendId = Record<string, EmailSendDiagnostics>;

const EMAIL_TABS: Array<{
  key: EmailTab;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "compose", label: "Compose", icon: PenLine },
  { key: "templates", label: "Templates", icon: LayoutTemplate },
  { key: "sent", label: "Sent emails", icon: MailCheck },
];

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
    ["Button clicked", recipient.clickedAt],
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
    templateVersionsById,
    emailError,
    ensureEmailTemplates,
    ensureEmailSends,
    refreshEmailSends,
    ensureTemplateVersion,
    setEmailSends,
    setEmailTemplates,
  } = useAdminEmailData();
  const [activeTab, setActiveTab] = useState<EmailTab>("compose");
  const [hasVisitedTemplates, setHasVisitedTemplates] = useState(false);
  const [deletingSendId, setDeletingSendId] = useState<string | null>(null);
  const [isLoadingData, startLoadDataTransition] = useTransition();
  const [isLoadingSends, startLoadSendsTransition] = useTransition();
  const [isDeletingSend, startDeleteSendTransition] = useTransition();
  const [expandedSendId, setExpandedSendId] = useState<string | null>(null);
  const [diagnosticsBySendId, setDiagnosticsBySendId] =
    useState<DiagnosticsBySendId>({});
  const [loadingDiagnosticsId, setLoadingDiagnosticsId] = useState<string | null>(
    null,
  );
  const [isLoadingDiagnostics, startDiagnosticsTransition] = useTransition();
  const [isRefreshing, startRefreshTransition] = useTransition();

  const localSends = sends ?? [];
  const loadError = emailError;

  const refreshData = useCallback(
    (options?: { quiet?: boolean }) => refreshEmailSends(options),
    [refreshEmailSends],
  );

  useEffect(() => {
    startLoadDataTransition(async () => {
      await ensureEmailTemplates({ quiet: true });
    });
  }, [ensureEmailTemplates]);

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
    if (tab === "templates") {
      setHasVisitedTemplates(true);
    }
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
          templateVersionsById={templateVersionsById}
          ensureTemplateVersion={ensureTemplateVersion}
          selectedContactIds={selectedContactIds}
          onSendStarted={handleSendStarted}
        />
      </div>

      {(activeTab === "templates" || hasVisitedTemplates) && (
        <div hidden={activeTab !== "templates"}>
          <TemplateEditor
            templates={templates}
            templateVersionsById={templateVersionsById}
            ensureTemplateVersion={ensureTemplateVersion}
            onTemplatesChange={(nextTemplates) =>
              setEmailTemplates(nextTemplates)
            }
          />
        </div>
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
              {localSends.map((send) => {
                const isExpanded = expandedSendId === send.id;
                const diagnostics = diagnosticsBySendId[send.id];
                const isLoadingThis =
                  isLoadingDiagnostics && loadingDiagnosticsId === send.id;
                const metrics = buildEmailSendMetrics(send);
                const sentOn = formatEmailSendTiming(send);

                return (
                  <Fragment key={send.id}>
                    <div className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(220px,0.9fr)_minmax(460px,2fr)_minmax(190px,auto)_auto] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {send.name}
                        </p>
                      </div>
                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        {metrics.map((metric) => (
                          <span
                            key={metric.key}
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
                      <span className="text-xs text-muted-foreground">
                        {sentOn}
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
                                        <p className="text-destructive">
                                          Failure reason:{" "}
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
    </div>
  );
}

export function EmailStudio(props: {
  isVisible?: boolean;
  selectedContactIds: string[];
}) {
  return (
    <AdminEmailDataProvider>
      <EmailStudioContent {...props} />
    </AdminEmailDataProvider>
  );
}
