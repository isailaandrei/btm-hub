"use client";

import { startTransition, useState } from "react";
import type { AdminAiProviderAvailability } from "@/lib/admin-ai/provider";
import type {
  AdminAiMessageSummary,
  AdminAiThreadSummary,
} from "@/types/admin-ai";
import type { AdminAiAskFormState } from "./actions";
import {
  deleteAdminAiThreadAction,
  loadAdminAiThread,
  renameAdminAiThreadAction,
} from "./actions";
import { MessageList } from "./message-list";
import { QuestionForm } from "./question-form";
import { ThreadList } from "./thread-list";

type SerializedThreadDetail = {
  thread: AdminAiThreadSummary;
  messages: AdminAiMessageSummary[];
};

function upsertThread(
  threads: AdminAiThreadSummary[],
  thread: AdminAiThreadSummary,
): AdminAiThreadSummary[] {
  const withoutCurrent = threads.filter((item) => item.id !== thread.id);
  return [thread, ...withoutCurrent];
}

export function AdminAiPanel({
  scope,
  contactId,
  initialThreads,
  providerAvailability,
}: {
  scope: "global" | "contact";
  contactId?: string;
  contactName?: string;
  initialThreads: AdminAiThreadSummary[];
  providerAvailability: AdminAiProviderAvailability;
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [selectedThread, setSelectedThread] = useState<AdminAiThreadSummary | null>(
    null,
  );
  const [messages, setMessages] = useState<AdminAiMessageSummary[] | null>(null);
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);

  const selectedThreadId = selectedThread?.id ?? null;

  function handleDeselectThread() {
    setSelectedThread(null);
    setMessages(null);
    setLoadingThreadId(null);
  }

  function handleAskResolved(state: AdminAiAskFormState) {
    if (!state.thread || !state.messages) return;
    setThreads((current) => upsertThread(current, state.thread!));
    setSelectedThread(state.thread);
    setMessages(state.messages);
  }

  function handleSelectThread(thread: AdminAiThreadSummary) {
    setLoadingThreadId(thread.id);
    startTransition(async () => {
      try {
        const detail = await loadAdminAiThread(thread.id) as SerializedThreadDetail;
        setSelectedThread(detail.thread);
        setMessages(detail.messages);
      } finally {
        setLoadingThreadId(null);
      }
    });
  }

  function handleRenameThread(
    thread: AdminAiThreadSummary,
    nextTitle: string,
  ) {
    startTransition(async () => {
      await renameAdminAiThreadAction({
        threadId: thread.id,
        title: nextTitle,
        scope: thread.scope,
        contactId: thread.contactId,
      });
      setThreads((current) =>
        current.map((item) =>
          item.id === thread.id ? { ...item, title: nextTitle } : item,
        ),
      );
      setSelectedThread((current) =>
        current?.id === thread.id ? { ...current, title: nextTitle } : current,
      );
    });
  }

  function handleDeleteThread(thread: AdminAiThreadSummary) {
    startTransition(async () => {
      await deleteAdminAiThreadAction({
        threadId: thread.id,
        scope: thread.scope,
        contactId: thread.contactId,
      });
      setThreads((current) => current.filter((item) => item.id !== thread.id));
      if (selectedThread?.id === thread.id) {
        setSelectedThread(null);
        setMessages(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      {selectedThread ? (
        <section className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <header className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Past question
              </p>
              <h3 className="mt-1 text-base font-semibold text-foreground">
                {selectedThread.title}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(selectedThread.createdAt).toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDeselectThread}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Ask a new question
            </button>
          </header>

          <MessageList messages={messages} />
        </section>
      ) : (
        <QuestionForm
          scope={scope}
          contactId={contactId}
          providerAvailability={providerAvailability}
          onResolved={handleAskResolved}
        />
      )}

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Past questions
        </p>
        <ThreadList
          threads={threads}
          selectedThreadId={selectedThreadId}
          loadingThreadId={loadingThreadId}
          onSelect={handleSelectThread}
          onDeselect={handleDeselectThread}
          onRename={handleRenameThread}
          onDelete={handleDeleteThread}
        />
      </div>
    </div>
  );
}
