"use client";

import { Loader2 } from "lucide-react";
import type { AdminAiMessageSummary } from "@/types/admin-ai";
import { AnswerView } from "./answer-view";

// Stale-display guard (read side only, no DB write): a "running" placeholder
// this old almost certainly means the server restarted mid-run (start-and-poll
// ask flow, docs/plans/admin-ai-start-and-poll.md) — the client-side awaiting
// poll in question-form.tsx gives up at 8 minutes, so 10 here is a message
// that outlived even a reopened/reloaded thread's poll.
const STALE_RUNNING_MS = 10 * 60 * 1000;

function isStaleRunning(message: AdminAiMessageSummary): boolean {
  return (
    message.status === "running" &&
    Date.now() - new Date(message.createdAt).getTime() > STALE_RUNNING_MS
  );
}

export function MessageList({
  messages,
}: {
  messages: AdminAiMessageSummary[] | null;
}) {
  if (!messages) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-white p-4 text-sm text-muted-foreground shadow-sm">
        Select a past question or ask a new one.
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-white p-4 text-sm text-muted-foreground shadow-sm">
        No messages yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => {
        const staleRunning = isStaleRunning(message);
        return (
          <div
            key={message.id}
            className={`rounded-lg border p-4 ${
              message.role === "user"
                ? "border-border bg-white shadow-sm"
                : message.status === "failed" || staleRunning
                  ? "border-destructive/40 bg-white shadow-sm ring-1 ring-destructive/10"
                  : "border-primary/20 bg-white shadow-sm ring-1 ring-primary/10"
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {message.role === "user" ? "You" : "AI Analyst"}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(message.createdAt).toLocaleTimeString()}
              </p>
            </div>

            {message.role === "assistant" ? (
              message.status === "running" ? (
                staleRunning ? (
                  <p className="text-sm text-foreground">
                    Timed out — the server likely restarted mid-run. Re-ask
                    the question.
                  </p>
                ) : (
                  <div
                    role="status"
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span>Analyzing — the answer will appear here.</span>
                  </div>
                )
              ) : (
                <AnswerView message={message} />
              )
            ) : (
              <p className="text-sm text-foreground">{message.content}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
