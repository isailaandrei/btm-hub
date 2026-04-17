"use client";

import { useState } from "react";
import type { AdminAiThreadSummary } from "@/types/admin-ai";

export function ThreadList({
  threads,
  selectedThreadId,
  loadingThreadId,
  onSelect,
  onRename,
  onDelete,
}: {
  threads: AdminAiThreadSummary[];
  selectedThreadId: string | null;
  loadingThreadId: string | null;
  onSelect: (thread: AdminAiThreadSummary) => void;
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
      <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
        No saved threads yet. Ask a question to start one.
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
            className={`rounded-lg border p-3 transition-colors ${
              isActive
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/40"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(thread)}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="line-clamp-2 text-sm font-medium text-foreground">
                  {thread.title}
                </p>
                {isLoading && (
                  <span className="text-xs text-muted-foreground">Loading…</span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(thread.updatedAt).toLocaleString()}
              </p>
            </button>

            {isRenaming ? (
              <div className="mt-3 space-y-2">
                <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Rename thread
                </label>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => submitRename(thread)}
                    className="text-xs font-medium text-foreground hover:opacity-80"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelRename}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : isConfirmingDelete ? (
              <div className="mt-3 space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
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
                    className="text-xs font-medium text-destructive hover:opacity-80"
                  >
                    Delete thread
                  </button>
                  <button
                    type="button"
                    onClick={cancelDelete}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => beginRename(thread)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => beginDelete(thread)}
                  className="text-xs text-destructive hover:opacity-80"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
