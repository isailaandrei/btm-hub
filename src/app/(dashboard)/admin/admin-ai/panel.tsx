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
      <QuestionForm
        scope={scope}
        threadId={selectedThreadId}
        threadTitle={selectedThread?.title}
        threadCreatedAt={selectedThread?.createdAt}
        contactId={contactId}
        providerAvailability={providerAvailability}
        onResolved={handleAskResolved}
      />

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Threads
          </p>
          {selectedThreadId && (
            <button
              type="button"
              onClick={handleDeselectThread}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Deselect thread
            </button>
          )}
        </div>
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

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Conversation
        </p>
        <MessageList messages={messages} />
      </div>
    </div>
  );
}
