"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";

import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import NextImage from "next/image";
import { useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import data from "@emoji-mart/data";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Minus,
  Loader2,
  Paperclip,
  Smile,
  Send,
  X,
  FileText,
} from "lucide-react";
import { mentionSuggestion } from "./mention-suggestion";
import { uploadMessageFile } from "@/app/(marketing)/community/messages/actions";

const EmojiPicker = dynamic(() => import("@emoji-mart/react").then((m) => m.default), {
  ssr: false,
  loading: () => null,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EditorVariant = "thread" | "message";

interface Attachment {
  file: File;
  previewUrl: string | null;
  isImage: boolean;
}

interface RichTextEditorProps {
  /** "thread" = full toolbar (headings, lists, inline images). "message" = compact (attachments, emoji). */
  variant?: EditorVariant;
  /** Field name for hidden input (form submission). Required for "thread" variant. */
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  /** Called with the HTML body when the user submits. Used by "message" variant. */
  onSubmit?: (body: string, attachmentUrls: { url: string; fileName: string; isImage: boolean }[]) => void;
  /** Upload action for file attachments (message variant). */
  uploadFile?: (formData: FormData) => Promise<{ url: string | null; fileName: string | null; isImage: boolean; error: string | null }>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RichTextEditor({
  variant = "thread",
  name,
  defaultValue = "",
  placeholder,
  onSubmit,
  uploadFile: uploadFileProp,
}: RichTextEditorProps) {
  const uploadFile = uploadFileProp ?? uploadMessageFile;
  const containerRef = useRef<HTMLDivElement>(null);
  const [bodyHtml, setBodyHtml] = useState(defaultValue);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [editorState, setEditorState] = useState({
    bold: false,
    italic: false,
    link: false,
    heading2: false,
    heading3: false,
    bulletList: false,
    orderedList: false,
    blockquote: false,
  });

  const isThread = variant === "thread";
  const isMessage = variant === "message";

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: isThread ? { levels: [2, 3] } : false,
        bulletList: isThread ? {} : false,
        orderedList: isThread ? {} : false,
        blockquote: isThread ? {} : false,
        codeBlock: isThread ? {} : false,
        horizontalRule: isThread ? {} : false,
      }),
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline underline-offset-4",
        },
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
      ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
    ],
    content: defaultValue,
    editorProps: {
      attributes: {
        class: isThread
          ? "prose-community min-h-[8rem] w-full px-4 py-3 text-sm text-foreground focus:outline-none"
          : "min-h-[2.5rem] max-h-[10rem] overflow-y-auto w-full px-3 py-2 text-sm text-foreground focus:outline-none",
      },
    },
    onUpdate({ editor: e }) {
      setBodyHtml(e.isEmpty ? "" : e.getHTML());
    },
    onTransaction({ editor: e }) {
      setEditorState({
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        link: e.isActive("link"),
        heading2: e.isActive("heading", { level: 2 }),
        heading3: e.isActive("heading", { level: 3 }),
        bulletList: e.isActive("bulletList"),
        orderedList: e.isActive("orderedList"),
        blockquote: e.isActive("blockquote"),
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  // Thread variant: intercept parent form submission to upload attachments first
  useEffect(() => {
    if (!isThread || !containerRef.current) return;
    const form = containerRef.current.closest("form");
    if (!form) return;

    async function handleFormSubmit(e: SubmitEvent) {
      if (attachments.length === 0) return; // No attachments, let form submit normally

      e.preventDefault();
      setIsUploading(true);
      setUploadError(null);

      try {
        const uploaded: string[] = [];
        for (const attachment of attachments) {
          const fd = new FormData();
          fd.append("file", attachment.file);
          const result = await uploadFile(fd);
          if (result.error) {
            setUploadError(result.error);
            setIsUploading(false);
            return;
          }
          if (result.url) {
            const isImg = attachment.isImage;
            uploaded.push(
              isImg
                ? `<p><img src="${result.url}"></p>`
                : `<p><a href="${result.url}" target="_blank" rel="noopener noreferrer">${attachment.file.name.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</a></p>`,
            );
          }
        }

        // Append attachment HTML to the body and re-submit after state update
        const attachmentHtml = uploaded.join("");
        setBodyHtml((prev) => (prev || "") + attachmentHtml);
        setAttachments([]);
        setIsUploading(false);

        // Wait for React to flush the state update before re-submitting
        requestAnimationFrame(() => {
          form!.requestSubmit();
        });
      } catch {
        setUploadError("Upload failed. Please try again.");
        setIsUploading(false);
      }
    }

    form.addEventListener("submit", handleFormSubmit);
    return () => form.removeEventListener("submit", handleFormSubmit);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attachments read via closure
  }, [isThread, attachments.length]);

  function addLink() {
    if (!editor) return;
    const url = prompt("Enter URL:");
    if (!url) return;
    editor.chain().focus().setLink({ href: url }).run();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        setUploadError("File must be under 20 MB");
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

  const [isSending, setIsSending] = useState(false);

  async function handleSend() {
    if (!editor || !onSubmit) return;
    const hasText = !editor.isEmpty;
    const hasAttachments = attachments.length > 0;
    if (!hasText && !hasAttachments) return;

    const html = hasText ? editor.getHTML() : "";
    setIsSending(true);
    setUploadError(null);

    try {
      // Upload attachments
      const uploaded: { url: string; fileName: string; isImage: boolean }[] = [];
      if (hasAttachments && uploadFile) {
        setIsUploading(true);
        for (const attachment of attachments) {
          const formData = new FormData();
          formData.append("file", attachment.file);
          const result = await uploadFile(formData);
          if (result.error) {
            setUploadError(result.error);
            setIsUploading(false);
            setIsSending(false);
            return;
          }
          if (result.url && result.fileName) {
            uploaded.push({ url: result.url, fileName: result.fileName, isImage: result.isImage });
          }
        }
        setIsUploading(false);
      }

      onSubmit(html, uploaded);
      editor.commands.clearContent();
      setAttachments([]);
    } catch {
      setUploadError("Failed to send");
    } finally {
      setIsSending(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Toolbar button helper
  // ---------------------------------------------------------------------------

  const btn = (active: boolean) =>
    cn(
      "rounded p-1.5 transition-colors",
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  const iconSize = isThread ? "h-4 w-4" : "h-3.5 w-3.5";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div ref={containerRef}>
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

      <div className="rounded-lg border border-border bg-card">
        {editor && (
          <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
            {/* Bold + Italic (always) */}
            <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editorState.bold)} title="Bold">
              <Bold className={iconSize} />
            </button>
            <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editorState.italic)} title="Italic">
              <Italic className={iconSize} />
            </button>

            {/* Thread-only: headings, lists, blockquote, HR, link, inline image */}
            {isThread && (
              <>
                <div className="mx-1 h-5 w-px bg-border" />
                <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editorState.heading2)} title="Heading 2">
                  <Heading2 className={iconSize} />
                </button>
                <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editorState.heading3)} title="Heading 3">
                  <Heading3 className={iconSize} />
                </button>
                <div className="mx-1 h-5 w-px bg-border" />
                <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editorState.bulletList)} title="Bullet list">
                  <List className={iconSize} />
                </button>
                <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editorState.orderedList)} title="Ordered list">
                  <ListOrdered className={iconSize} />
                </button>
                <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editorState.blockquote)} title="Blockquote">
                  <Quote className={iconSize} />
                </button>
                <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btn(false)} title="Horizontal rule">
                  <Minus className={iconSize} />
                </button>
                <div className="mx-1 h-5 w-px bg-border" />
                <button type="button" onClick={addLink} className={btn(editorState.link)} title="Add link">
                  <LinkIcon className={iconSize} />
                </button>
              </>
            )}

            {/* Attach file (both variants) */}
            <button type="button" onClick={() => fileInputRef.current?.click()} className={btn(false)} title="Attach file">
              <Paperclip className={iconSize} />
            </button>

            {/* Message-only: emoji, send */}
            {isMessage && (
              <>
                <div className="relative">
                  <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={btn(showEmojiPicker)} title="Emoji">
                    <Smile className={iconSize} />
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
                    onClick={handleSend}
                    disabled={isSending}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    title="Send message"
                  >
                    <Send className={iconSize} />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <EditorContent editor={editor} />
        {uploadError && (
          <p className="px-4 py-1.5 text-xs text-destructive">{uploadError}</p>
        )}
      </div>

      {/* Hidden file input (both variants) */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="sr-only"
        tabIndex={-1}
      />

      {/* Hidden form inputs (thread variant) */}
      {isThread && name && (
        <>
          <input type="hidden" name={name} value={bodyHtml} readOnly />
          <input type="hidden" name="bodyFormat" value="html" />
        </>
      )}
    </div>
  );
}
