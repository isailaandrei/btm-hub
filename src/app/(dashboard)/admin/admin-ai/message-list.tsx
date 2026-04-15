"use client";

import type { AdminAiMessageSummary } from "@/types/admin-ai";
import { AnswerView } from "./answer-view";

export function MessageList({
  messages,
}: {
  messages: AdminAiMessageSummary[] | null;
}) {
  if (!messages) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        Select a thread or ask a new question.
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        No messages yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`rounded-lg border p-4 ${
            message.role === "user"
              ? "border-border bg-background"
              : message.status === "failed"
                ? "border-destructive/40 bg-destructive/5"
                : "border-border bg-muted/20"
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
            <AnswerView message={message} />
          ) : (
            <p className="text-sm text-foreground">{message.content}</p>
          )}
        </div>
      ))}
    </div>
  );
}
