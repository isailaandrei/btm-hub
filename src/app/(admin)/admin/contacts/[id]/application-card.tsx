"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { getFormDefinition } from "@/lib/academy/forms";
import type { Application, ApplicationStatus } from "@/types/database";
import type { ContactDetailApplicationSummary } from "@/lib/data/contact-detail";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { STATUS_BADGE_CLASS } from "../../applications/constants";
import { StatusSelector } from "../../applications/[id]/StatusSelector";
import { DeleteApplicationButton } from "./delete-buttons";
import { loadContactApplication } from "./application-actions";
import { refreshContactDetailAfterMutation } from "./contact-detail-loader";

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/** Run `callback` when the browser is idle (or after a short delay as a
 *  fallback), returning a cancel function. Used to warm collapsed application
 *  details without competing with the initial render / section loads. */
function scheduleIdle(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const idleWindow = window as IdleWindow;
  if (typeof idleWindow.requestIdleCallback === "function") {
    const id = idleWindow.requestIdleCallback(callback, { timeout: 2000 });
    return () => idleWindow.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(callback, 200);
  return () => window.clearTimeout(id);
}

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (typeof value === "number") return `${value}/10`;
  return String(value);
}

interface ApplicationCardProps {
  application: ContactDetailApplicationSummary;
  contactId: string;
  defaultOpen: boolean;
}

export function ApplicationCard({
  application,
  contactId,
  defaultOpen,
}: ApplicationCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [applicationDetail, setApplicationDetail] =
    useState<Application | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const prefetchStartedRef = useRef(false);
  const formDef = getFormDefinition(application.program);

  function loadDetailIfNeeded() {
    if (applicationDetail || isPending) return;

    startTransition(async () => {
      try {
        setLoadError(null);
        setApplicationDetail(await loadContactApplication(application.id));
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load application details.",
        );
      }
    });
  }

  function handleToggle() {
    setOpen((current) => !current);
  }

  function handleStatusCommitted(status: ApplicationStatus, updatedAt: string) {
    setApplicationDetail((current) =>
      current ? { ...current, status, updated_at: updatedAt } : current,
    );
    // Socket-independent refresh of the cached bootstrap so the collapsed
    // header badge (rendered from bootstrap data) reflects the new status even
    // if realtime is down. Best-effort; it never rejects.
    void refreshContactDetailAfterMutation(contactId);
  }

  useEffect(() => {
    if (open) loadDetailIfNeeded();
    // `loadDetailIfNeeded` closes over transient loading state; this effect is
    // only for the initial/default-open case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Warm the collapsed application's detail in the background shortly after
  // mount, so expanding it (which admins usually do) is instant. Best-effort and
  // idle-scheduled: it never blocks the initial render or the panel's section
  // loads, and a failure is swallowed — opening runs the normal loader, which
  // surfaces errors + retry. `current ?? detail` never clobbers a fresher value.
  useEffect(() => {
    if (defaultOpen || prefetchStartedRef.current) return;
    prefetchStartedRef.current = true;
    return scheduleIdle(() => {
      loadContactApplication(application.id)
        .then((detail) => setApplicationDetail((current) => current ?? detail))
        .catch(() => {
          // Best-effort: opening the card will load and surface any error.
        });
    });
  }, [application.id, defaultOpen]);

  return (
    <Card className="min-w-0">
      <CardHeader className="p-0">
        <button
          type="button"
          onClick={handleToggle}
          className="flex w-full min-w-0 items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-muted/30"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="font-medium capitalize text-foreground">
              {application.program}
            </span>
            <Badge
              variant="outline"
              className={`capitalize ${STATUS_BADGE_CLASS[application.status]}`}
            >
              {application.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {new Date(application.submitted_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </CardHeader>

      {open && (
        <CardContent className="min-w-0 border-t border-border pt-4">
          {loadError ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-destructive">{loadError}</p>
              <button
                type="button"
                onClick={loadDetailIfNeeded}
                disabled={isPending}
                className="w-fit rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
              >
                {isPending ? "Retrying..." : "Retry"}
              </button>
            </div>
          ) : applicationDetail ? (
            <>
              <div className="mb-6">
                <StatusSelector
                  applicationId={applicationDetail.id}
                  currentStatus={applicationDetail.status}
                  currentUpdatedAt={applicationDetail.updated_at}
                  onStatusCommitted={handleStatusCommitted}
                />
              </div>

              <div className="flex flex-col gap-6">
                {formDef ? (
                  formDef.steps.map((step) => (
                    <div key={step.id}>
                      <h3 className="mb-3 text-sm font-medium text-foreground">
                        {step.title}
                      </h3>
                      <dl className="flex flex-col gap-3">
                        {step.fields.map((field) => (
                          <div key={field.name} className="flex flex-col gap-0.5">
                            <dt className="text-xs text-muted-foreground">
                              {field.label}
                            </dt>
                            <dd className="break-words text-sm text-foreground">
                              {formatValue(applicationDetail.answers[field.name])}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))
                ) : (
                  <dl className="flex flex-col gap-3">
                    {Object.entries(applicationDetail.answers).map(
                      ([key, value]) => (
                        <div key={key} className="flex flex-col gap-0.5">
                          <dt className="text-xs text-muted-foreground">
                            {key}
                          </dt>
                          <dd className="break-words text-sm text-foreground">
                            {formatValue(value)}
                          </dd>
                        </div>
                      ),
                    )}
                  </dl>
                )}
              </div>

              <div className="mt-6 border-t border-border pt-4">
                <DeleteApplicationButton
                  applicationId={applicationDetail.id}
                  contactId={contactId}
                  program={applicationDetail.program}
                />
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="h-5 w-36 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
