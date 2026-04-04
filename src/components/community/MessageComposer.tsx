"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import NextImage from "next/image";
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import data from "@emoji-mart/data";
import { cn } from "@/lib/utils";
import { Bold, Italic, Send, Paperclip, Loader2, Smile, X, FileText } from "lucide-react";
import { sendMessage, uploadMessageFile } from "@/app/(marketing)/community/messages/actions";
import { mentionSuggestion } from "./mention-suggestion";

const EmojiPicker = dynamic(() => import("@emoji-mart/react").then((m) => m.default), {
  ssr: false,
  loading: () => null,
});

interface Attachment {
  file: File;
  previewUrl: string | null;
  isImage: boolean;
}

interface MessageComposerProps {
  conversationId: string;
  onSend?: (body: string) => void;
}

export function MessageComposer({ conversationId, onSend }: MessageComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [editorState, setEditorState] = useState({ bold: false, italic: false, link: false });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline underline-offset-4",
        },
      }),
      Placeholder.configure({
        placeholder: "Type a message...",
      }),
      Mention.configure({
        HTMLAttributes: {
          class: "text-primary font-medium",
          "data-type": "mention",
        },
        renderLabel({ node }) {
          return `@${node.attrs.label ?? node.attrs.id}`;
        },
        suggestion: mentionSuggestion,
      }),
    ],
    editorProps: {
      attributes: {
        class: "min-h-[2.5rem] max-h-[10rem] overflow-y-auto w-full px-3 py-2 text-sm text-foreground focus:outline-none",
      },
    },
    onTransaction({ editor: e }) {
      setEditorState({
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        link: e.isActive("link"),
      });
    },
  });

  async function handleSubmit() {
    const hasText = editor && !editor.isEmpty;
    const hasAttachments = attachments.length > 0;

    if (!hasText && !hasAttachments) return;

    const textHtml = hasText ? editor!.getHTML() : "";
    const textContent = textHtml.replace(/<[^>]*>/g, "").trim();

    if (!textContent && !hasAttachments) return;

    setError(null);
    setIsPending(true);

    try {
      // Upload all attachments
      const uploaded: { url: string; fileName: string; isImage: boolean }[] = [];
      if (hasAttachments) {
        setIsUploading(true);
        for (const attachment of attachments) {
          const formData = new FormData();
          formData.append("file", attachment.file);
          const result = await uploadMessageFile(formData);
          if (result.error) {
            setError(result.error);
            setIsUploading(false);
            setIsPending(false);
            return;
          }
          if (result.url && result.fileName) {
            uploaded.push({ url: result.url, fileName: result.fileName, isImage: result.isImage });
          }
        }
        setIsUploading(false);
      }

      // Build final HTML: text + attachments
      const escapeHtml = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const attachmentHtml = uploaded
        .map((f) =>
          f.isImage
            ? `<p><img src="${f.url}"></p>`
            : `<p><a href="${f.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(f.fileName)}</a></p>`,
        )
        .join("");
      const finalBody = textHtml + attachmentHtml;

      // Optimistic: notify parent immediately
      onSend?.(finalBody);
      editor?.commands.clearContent();
      setAttachments([]);

      const sendFormData = new FormData();
      sendFormData.append("conversationId", conversationId);
      sendFormData.append("body", finalBody);
      sendFormData.append("bodyFormat", "html");
      const result = await sendMessage(
        { errors: null, message: "", success: false, resetKey: 0 },
        sendFormData,
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

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        setError("File must be under 20 MB");
        continue;
      }
      const isImage = file.type.startsWith("image/");
      newAttachments.push({
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : null,
        isImage,
      });
    }
    setAttachments((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => {
      const removed = prev[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function insertEmoji(emoji: { native: string }) {
    if (!editor) return;
    editor.chain().focus().insertContent(emoji.native).run();
    setShowEmojiPicker(false);
  }

  const btn = (active: boolean) =>
    cn(
      "rounded p-1.5 transition-colors",
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <div className="border-t border-border bg-card px-4 py-3">
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment, i) => (
            <div key={attachment.previewUrl ?? attachment.file.name} className="group/att relative">
              {attachment.isImage && attachment.previewUrl ? (
                <NextImage
                  src={attachment.previewUrl}
                  alt={attachment.file.name}
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-lg border border-border object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-16 items-center gap-2 rounded-lg border border-border bg-muted px-3">
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="max-w-[120px] truncate text-xs text-foreground">
                    {attachment.file.name}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white opacity-0 transition-opacity group-hover/att:opacity-100"
                title="Remove"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
          {isUploading && (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-muted">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-background">
        {editor && (
          <div className="flex items-center gap-0.5 border-b border-border px-2 py-1">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={btn(editorState.bold)}
              title="Bold"
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={btn(editorState.italic)}
              title="Italic"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={btn(false)}
              title="Attach file"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={btn(showEmojiPicker)}
                title="Emoji"
              >
                <Smile className="h-3.5 w-3.5" />
              </button>
              {showEmojiPicker && (
                <div className="absolute bottom-full left-0 z-50 mb-1">
                  <EmojiPicker data={data} onEmojiSelect={insertEmoji} theme="light" previewPosition="none" skinTonePosition="none" />
                </div>
              )}
            </div>

            <div className="ml-auto">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                title="Send message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="sr-only"
        tabIndex={-1}
      />

      {error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
