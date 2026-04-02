"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Bold, Italic, Link as LinkIcon, Send, ImageIcon, Loader2 } from "lucide-react";
import { sendMessage } from "@/app/(marketing)/community/messages/actions";
import { mentionSuggestion } from "./mention-suggestion";
import { uploadCommunityImage } from "@/app/(marketing)/community/actions";

interface MessageComposerProps {
  conversationId: string;
  onSend?: (body: string) => void;
}

export function MessageComposer({ conversationId, onSend }: MessageComposerProps) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Track editor formatting state so toolbar buttons re-render on selection changes
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
      Image.configure({
        inline: false,
        allowBase64: false,
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
    onUpdate({ editor: e }) {
      if (hiddenRef.current) {
        hiddenRef.current.value = e.isEmpty ? "" : e.getHTML();
      }
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
    if (!editor || editor.isEmpty) return;
    const html = editor.getHTML();
    const textContent = html.replace(/<[^>]*>/g, "").trim();
    if (!textContent) return;

    // Optimistic: notify parent immediately
    onSend?.(html);
    editor.commands.clearContent();
    if (hiddenRef.current) hiddenRef.current.value = "";
    setError(null);
    setIsPending(true);

    try {
      const formData = new FormData();
      formData.append("conversationId", conversationId);
      formData.append("body", html);
      formData.append("bodyFormat", "html");
      const result = await sendMessage({ errors: null, message: "", success: false, resetKey: 0 }, formData);
      if (!result.success) {
        setError(result.message || result.errors?.body || "Failed to send");
      }
    } catch {
      setError("Failed to send message");
    } finally {
      setIsPending(false);
    }
  }

  function addLink() {
    if (!editor) return;
    const url = prompt("Enter URL:");
    if (!url) return;
    editor.chain().focus().setLink({ href: url }).run();
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    e.target.value = "";
    setUploadError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const result = await uploadCommunityImage(formData);
      if (result.error) {
        setUploadError(result.error);
        return;
      }
      if (result.url) {
        editor.chain().focus().setImage({ src: result.url }).createParagraphNear().run();
      }
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
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
              onClick={addLink}
              className={btn(editorState.link)}
              title="Add link"
            >
              <LinkIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={btn(false)}
              title="Add image"
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )}
            </button>

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
        {uploadError && (
          <p className="px-3 py-1 text-xs text-destructive">{uploadError}</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>

      {error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
