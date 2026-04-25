"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  ApplicationImportAmbiguousDetail,
  ApplicationImportDriftDetail,
  ApplicationImportInsertPreview,
} from "@/lib/academy/import-service";
import { runAcademyImportAction } from "./actions";
import {
  initialAcademyImportActionState,
  type AcademyImportActionState,
} from "./actions-state";

type Phase =
  | { kind: "idle"; lastError?: AcademyImportActionState }
  | { kind: "preview"; result: AcademyImportActionState }
  | { kind: "syncing"; result: AcademyImportActionState }
  | { kind: "synced"; result: AcademyImportActionState };

type SyncController = {
  phase: Phase;
  isPending: boolean;
  startPreview: () => void;
  accept: () => void;
  reset: () => void;
};

const DRIFT_VALUE_PREVIEW_LIMIT = 160;

function formatDriftValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const stringified =
    typeof value === "string" ? value : JSON.stringify(value);
  if (stringified.length <= DRIFT_VALUE_PREVIEW_LIMIT) return stringified;
  return `${stringified.slice(0, DRIFT_VALUE_PREVIEW_LIMIT)}…`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDriftHeader(detail: ApplicationImportDriftDetail): string {
  const kind =
    detail.driftKind === "legacy"
      ? "Legacy row, never synced"
      : "Already imported, sheet edited since";
  return `${detail.email ?? "(no email)"} • submitted ${formatTimestamp(detail.submittedAt)} • ${kind}`;
}

function makeFormData(mode: "dry-run" | "sync"): FormData {
  const fd = new FormData();
  fd.set("mode", mode);
  return fd;
}

function collectInsertPreviews(
  state: AcademyImportActionState,
): ApplicationImportInsertPreview[] {
  return (state.summary?.sources ?? []).flatMap(
    (sourceResult) => sourceResult.insertPreviews,
  );
}

function collectDriftDetails(
  state: AcademyImportActionState,
): ApplicationImportDriftDetail[] {
  return (state.summary?.sources ?? []).flatMap(
    (sourceResult) => sourceResult.driftDetails,
  );
}

function collectAmbiguousDetails(
  state: AcademyImportActionState,
): ApplicationImportAmbiguousDetail[] {
  return (state.summary?.sources ?? []).flatMap(
    (sourceResult) => sourceResult.ambiguousDetails,
  );
}

export function useAcademyImportSync(): SyncController {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  const startPreview = useCallback(() => {
    startTransition(async () => {
      const result = await runAcademyImportAction(
        initialAcademyImportActionState,
        makeFormData("dry-run"),
      );
      setPhase(
        result.success
          ? { kind: "preview", result }
          : { kind: "idle", lastError: result },
      );
    });
  }, []);

  const accept = useCallback(() => {
    if (phase.kind !== "preview") return;
    const previewResult = phase.result;
    setPhase({ kind: "syncing", result: previewResult });
    startTransition(async () => {
      const result = await runAcademyImportAction(
        initialAcademyImportActionState,
        makeFormData("sync"),
      );
      if (result.success) {
        setPhase({ kind: "synced", result });
      } else {
        // Sync failed — surface error but keep the preview open so the
        // admin can re-try without re-running the dry-run.
        setPhase({
          kind: "preview",
          result: {
            ...previewResult,
            message: result.message,
            errors: result.errors,
            success: false,
          },
        });
      }
    });
  }, [phase]);

  const reset = useCallback(() => setPhase({ kind: "idle" }), []);

  return { phase, isPending, startPreview, accept, reset };
}

export function AcademyImportSyncButton({
  controller,
}: {
  controller: SyncController;
}) {
  const { phase, isPending, startPreview } = controller;
  const lastError = phase.kind === "idle" ? phase.lastError : undefined;

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        onClick={startPreview}
        disabled={isPending || phase.kind !== "idle"}
      >
        {isPending && phase.kind === "idle" ? "Loading…" : "Google Forms Sync"}
      </Button>
      {lastError && (
        <span className="text-xs text-destructive">
          {lastError.message ?? "Preview failed"}
        </span>
      )}
    </div>
  );
}

export function AcademyImportSyncPanel({
  controller,
}: {
  controller: SyncController;
}) {
  const { phase, isPending, accept, reset } = controller;

  if (phase.kind === "idle") return null;

  if (phase.kind === "syncing") {
    const inserts = collectInsertPreviews(phase.result);
    return (
      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Importing {inserts.length}{" "}
        {inserts.length === 1 ? "row" : "rows"}…
      </div>
    );
  }

  if (phase.kind === "synced") {
    return <SyncedView result={phase.result} onReset={reset} />;
  }

  return (
    <PreviewView
      result={phase.result}
      isPending={isPending}
      onAccept={accept}
      onCancel={reset}
    />
  );
}

function PreviewView({
  result,
  isPending,
  onAccept,
  onCancel,
}: {
  result: AcademyImportActionState;
  isPending: boolean;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const summary = result.summary;
  const inserts = useMemo(() => collectInsertPreviews(result), [result]);
  const drifts = useMemo(() => collectDriftDetails(result), [result]);
  const ambiguous = useMemo(() => collectAmbiguousDetails(result), [result]);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          Preview ready — review before applying.
        </p>
        <p className="text-xs text-muted-foreground">
          {summary
            ? `${summary.scanned} scanned • ${inserts.length} new • ${summary.backfilled} backfill • ${summary.duplicates} duplicate${drifts.length ? ` • ${drifts.length} drifted` : ""}${ambiguous.length ? ` • ${ambiguous.length} ambiguous` : ""}`
            : "—"}
        </p>
      </div>

      {!result.success && result.message && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {result.message}
        </div>
      )}

      <InsertsSection inserts={inserts} />

      {drifts.length > 0 && <DriftsSection drifts={drifts} />}

      {ambiguous.length > 0 && <AmbiguousSection ambiguous={ambiguous} />}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button type="button" onClick={onAccept} disabled={isPending}>
          {isPending
            ? "Applying…"
            : inserts.length > 0
              ? `Accept and import ${inserts.length} ${inserts.length === 1 ? "contact" : "contacts"}`
              : "Accept"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function SyncedView({
  result,
  onReset,
}: {
  result: AcademyImportActionState;
  onReset: () => void;
}) {
  const summary = result.summary;
  const errorLines = useMemo(() => {
    if (!summary) return [];
    return summary.sources.flatMap((sourceResult) => sourceResult.errors);
  }, [summary]);

  return (
    <div className="relative rounded-xl border border-border bg-muted/30 px-4 py-3 pr-10">
      <button
        type="button"
        onClick={onReset}
        aria-label="Close"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <div
        className={`rounded-xl border px-3 py-2 text-sm ${
          result.success
            ? "border-border bg-muted text-foreground"
            : "border-destructive/30 bg-destructive/5 text-destructive"
        }`}
      >
        {result.message ?? "Sync complete."}
      </div>

      {errorLines.length > 0 && (
        <details className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-foreground">
            Show {errorLines.length}{" "}
            {errorLines.length === 1 ? "error" : "errors"}
          </summary>
          <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto font-mono text-[11px] text-muted-foreground">
            {errorLines.map((line, index) => (
              <li key={`${line}:${index}`}>{line}</li>
            ))}
          </ul>
        </details>
      )}

      {result.memorySync && (
        <div className="mt-3 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          AI memory refresh: {result.memorySync.succeeded} succeeded,{" "}
          {result.memorySync.failed} failed.
        </div>
      )}
    </div>
  );
}

function InsertsSection({
  inserts,
}: {
  inserts: ApplicationImportInsertPreview[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3">
      <p className="text-sm font-medium text-foreground">
        {inserts.length === 0
          ? "No new contacts will be added."
          : `${inserts.length} new ${inserts.length === 1 ? "contact" : "contacts"} will be added`}
      </p>
      {inserts.length > 0 && (
        <ul className="mt-3 max-h-72 divide-y divide-border overflow-y-auto text-sm">
          {inserts.map((entry) => (
            <li
              key={`${entry.program}:${entry.sourceRowNumber}:${entry.email}`}
              className="flex flex-wrap items-baseline gap-x-3 py-1.5"
            >
              <span className="font-medium text-foreground">{entry.name}</span>
              <span className="text-muted-foreground">{entry.email}</span>
              <span className="ml-auto rounded-md border border-border bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                {entry.program}
              </span>
              <span className="text-xs text-muted-foreground">
                submitted {formatTimestamp(entry.submittedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DriftsSection({
  drifts,
}: {
  drifts: ApplicationImportDriftDetail[];
}) {
  return (
    <details className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium text-foreground">
        {drifts.length} drifted {drifts.length === 1 ? "contact" : "contacts"} —
        show diff
      </summary>
      <ul className="mt-3 space-y-3">
        {drifts.map((detail) => (
          <li
            key={detail.applicationId}
            className="space-y-2 border-t border-border/60 pt-3 first:border-0 first:pt-0"
          >
            <div className="flex flex-wrap items-baseline gap-x-2">
              <p className="font-medium text-foreground">
                {formatDriftHeader(detail)}
              </p>
              {detail.contactId && (
                <a
                  href={`/admin/contacts/${detail.contactId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  open contact ↗
                </a>
              )}
            </div>
            <table className="w-full table-fixed border-collapse text-left">
              <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-1/4 pb-1 pr-2 font-medium">Field</th>
                  <th className="w-3/8 pb-1 pr-2 font-medium">Existing</th>
                  <th className="w-3/8 pb-1 font-medium">In sheet</th>
                </tr>
              </thead>
              <tbody className="align-top">
                {detail.changedFields.map((change) => (
                  <tr
                    key={change.field}
                    className="border-t border-border/40"
                  >
                    <td className="py-1 pr-2 font-mono text-[11px] text-foreground">
                      {change.field}
                    </td>
                    <td className="py-1 pr-2 break-words text-muted-foreground">
                      {formatDriftValue(change.before)}
                    </td>
                    <td className="py-1 break-words text-foreground">
                      {formatDriftValue(change.after)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </li>
        ))}
      </ul>
    </details>
  );
}

function AmbiguousSection({
  ambiguous,
}: {
  ambiguous: ApplicationImportAmbiguousDetail[];
}) {
  return (
    <details className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium text-foreground">
        {ambiguous.length} ambiguous{" "}
        {ambiguous.length === 1 ? "match" : "matches"} — show details
      </summary>
      <ul className="mt-3 space-y-2">
        {ambiguous.map((detail) => (
          <li
            key={`${detail.email}:${detail.sourceRowNumber}`}
            className="border-t border-border/60 pt-2 first:border-0 first:pt-0"
          >
            <p className="font-medium text-foreground">{detail.email}</p>
            <p className="text-muted-foreground">
              Matches {detail.applicationIds.length} legacy applications
              within the same minute window — admin review required before
              this row can be safely linked.
            </p>
            <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-muted-foreground">
              {detail.applicationIds.map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </details>
  );
}
