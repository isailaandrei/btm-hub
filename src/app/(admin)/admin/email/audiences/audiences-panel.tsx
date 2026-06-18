"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import {
  formatSuppressionReason,
  formatSuppressionSource,
} from "@/lib/email/suppression-reason";
import type { EmailExclusionRow } from "@/lib/data/email-suppressions";
import {
  liftEmailExclusionAction,
  loadEmailExclusionsAction,
} from "../actions";

function formatExcludedOn(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function AudiencesPanel() {
  const [exclusions, setExclusions] = useState<EmailExclusionRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isLoading, startLoadTransition] = useTransition();
  const [isRemoving, startRemoveTransition] = useTransition();

  function load() {
    startLoadTransition(async () => {
      try {
        const result = await loadEmailExclusionsAction();
        setExclusions(result.exclusions);
        setLoadError(null);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load exclusions.",
        );
      }
    });
  }

  useEffect(() => {
    load();
  }, []);

  function handleRemove(row: EmailExclusionRow) {
    setRemovingId(row.id);
    startRemoveTransition(async () => {
      try {
        await liftEmailExclusionAction(row.id);
        setExclusions((current) =>
          (current ?? []).filter((item) => item.id !== row.id),
        );
        toast.success(`${row.contactName ?? row.email} can receive email again.`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to remove exclusion.",
        );
      } finally {
        setRemovingId(null);
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-base font-medium text-foreground">
          Excluded recipients
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          People here receive no email of any kind, even when they belong to a
          list or match a segment. Unsubscribes and provider bounces/complaints
          land here automatically.
        </p>
      </div>

      {exclusions === null ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading excluded recipients...
        </div>
      ) : loadError ? (
        <div className="flex flex-col gap-3 px-4 py-6">
          <p className="text-sm text-destructive">{loadError}</p>
          <button
            type="button"
            onClick={load}
            disabled={isLoading}
            className="w-fit rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
          >
            {isLoading ? "Retrying..." : "Retry"}
          </button>
        </div>
      ) : exclusions.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <ShieldOff className="h-4 w-4" />
          No one is excluded yet.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {exclusions.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(220px,1.4fr)_minmax(140px,auto)_minmax(120px,auto)_minmax(120px,auto)_auto] md:items-center"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {row.contactName ?? row.email}
                </p>
                {row.contactName && (
                  <p className="truncate text-xs text-muted-foreground">
                    {row.email}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {formatSuppressionReason(row.reason)}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatExcludedOn(row.createdAt)}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatSuppressionSource({
                  reason: row.reason,
                  provider: row.provider,
                })}
              </span>
              <div className="flex md:justify-end">
                <button
                  type="button"
                  onClick={() => handleRemove(row)}
                  disabled={isRemoving && removingId === row.id}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  {isRemoving && removingId === row.id
                    ? "Removing..."
                    : "Remove"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
