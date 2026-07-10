"use client";

import { Loader2, MessageCircleQuestion, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatRelative } from "@/lib/format-relative";
import { cn } from "@/lib/utils";
import type { AdminAiThreadSummary } from "@/types/admin-ai";

export function ThreadList({
  threads,
  selectedThreadId,
  loadingThreadId,
  onSelect,
  onDeselect,
  onRename,
  onDelete,
}: {
  threads: AdminAiThreadSummary[];
  selectedThreadId: string | null;
  loadingThreadId: string | null;
  onSelect: (thread: AdminAiThreadSummary) => void;
  onDeselect?: () => void;
  onRename: (thread: AdminAiThreadSummary, nextTitle: string) => void;
  onDelete: (thread: AdminAiThreadSummary) => void;
}) {
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteThreadId, setDeleteThreadId] = useState<string | null>(null);

  function beginRename(thread: AdminAiThreadSummary) {
    setDeleteThreadId(null);
    setRenamingThreadId(thread.id);
    setRenameValue(thread.title);
  }

  function submitRename(thread: AdminAiThreadSummary) {
    const nextTitle = renameValue.trim();
    if (!nextTitle || nextTitle === thread.title) {
      setRenamingThreadId(null);
      setRenameValue("");
      return;
    }

    onRename(thread, nextTitle);
    setRenamingThreadId(null);
    setRenameValue("");
  }

  function cancelRename() {
    setRenamingThreadId(null);
    setRenameValue("");
  }

  function beginDelete(thread: AdminAiThreadSummary) {
    setRenamingThreadId(null);
    setRenameValue("");
    setDeleteThreadId(thread.id);
  }

  function cancelDelete() {
    setDeleteThreadId(null);
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
        <MessageCircleQuestion className="size-6 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">
          No past questions yet. Ask one above to log your first analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {threads.map((thread) => {
        const isActive = thread.id === selectedThreadId;
        const isLoading = thread.id === loadingThreadId;
        const isRenaming = thread.id === renamingThreadId;
        const isConfirmingDelete = thread.id === deleteThreadId;

        return (
          <div
            key={thread.id}
            className={cn(
              "group rounded-xl border bg-white p-4 shadow-sm transition-all",
              isActive
                ? "border-primary/50 bg-primary/[0.03] ring-1 ring-primary/20"
                : "border-border hover:border-primary/30 hover:shadow-md",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  if (isActive && onDeselect) {
                    onDeselect();
                  } else {
                    onSelect(thread);
                  }
                }}
                aria-pressed={isActive}
                title={
                  isActive
                    ? "Click to close this past question"
                    : "Click to view this past question"
                }
                className="min-w-0 flex-1 text-left"
              >
                <p className="line-clamp-2 text-sm font-medium text-foreground">
                  {thread.title}
                </p>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatRelative(thread.updatedAt)}</span>
                  {isLoading && (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Loader2 className="size-3 animate-spin" />
                      Loading
                    </span>
                  )}
                </p>
              </button>

              {!isRenaming && !isConfirmingDelete && (
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => beginRename(thread)}
                    aria-label={`Rename "${thread.title}"`}
                    className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => beginDelete(thread)}
                    aria-label={`Delete "${thread.title}"`}
                    className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </div>

            {isRenaming && (
              <div className="mt-3 space-y-2">
                <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Rename
                </label>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => submitRename(thread)}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelRename}
                    className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isConfirmingDelete && (
              <div className="mt-3 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm text-foreground">
                  Delete <span className="font-medium">{thread.title}</span>?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(thread);
                      cancelDelete();
                    }}
                    className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={cancelDelete}
                    className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
