"use client";

import { useState } from "react";
import { RichTextEditor } from "./RichTextEditor";
import { sendMessage, uploadMessageFile } from "@/app/(marketing)/community/messages/actions";

interface MessageComposerProps {
  conversationId: string;
  onSend?: (body: string) => void;
}

export function MessageComposer({ conversationId, onSend }: MessageComposerProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);

  async function handleSubmit(body: string, attachmentFiles: { url: string; fileName: string; isImage: boolean }[]) {
    const textContent = body.replace(/<[^>]*>/g, "").trim();
    if (!textContent && attachmentFiles.length === 0) return;

    setError(null);
    setIsPending(true);

    try {
      const escapeHtml = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const attachmentHtml = attachmentFiles
        .map((f) =>
          f.isImage
            ? `<p><img src="${f.url}"></p>`
            : `<p><a href="${f.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(f.fileName)}</a></p>`,
        )
        .join("");
      const finalBody = body + attachmentHtml;

      onSend?.(finalBody);
      setEditorKey((k) => k + 1);

      const formData = new FormData();
      formData.append("conversationId", conversationId);
      formData.append("body", finalBody);
      formData.append("bodyFormat", "html");
      const result = await sendMessage(
        { errors: null, message: "", success: false, resetKey: 0 },
        formData,
      );
      if (!result.success) {
        setError(result.message || result.errors?.body || "Failed to send");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="border-t border-border bg-card px-4 py-3">
      <RichTextEditor
        key={editorKey}
        variant="message"
        placeholder="Type a message..."
        uploadFile={uploadMessageFile}
        onSubmit={handleSubmit}
      />
      {isPending && (
        <p className="mt-1 text-xs text-muted-foreground">Sending...</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
