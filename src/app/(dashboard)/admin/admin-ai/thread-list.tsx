"use client";

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
  onRename: (thread: AdminAiThreadSummary) => void;
  onDelete: (thread: AdminAiThreadSummary) => void;
}) {
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

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => onRename(thread)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => onDelete(thread)}
                className="text-xs text-destructive hover:opacity-80"
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
