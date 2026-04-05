"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { useRef, useState } from "react";
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
  ImageIcon,
  Minus,
  Loader2,
} from "lucide-react";
import { mentionSuggestion } from "./mention-suggestion";
import { uploadCommunityImage } from "@/app/(marketing)/community/actions";

interface RichTextEditorProps {
  name: string;
  defaultValue?: string;
  placeholder?: string;
}

export function RichTextEditor({
  name,
  defaultValue = "",
  placeholder,
}: RichTextEditorProps) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline underline-offset-4",
        },
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
      ...(placeholder
        ? [Placeholder.configure({ placeholder })]
        : []),
    ],
    content: defaultValue,
    editorProps: {
      attributes: {
        class:
          "prose-community min-h-[8rem] w-full px-4 py-3 text-sm text-foreground focus:outline-none",
      },
    },
    onUpdate({ editor: e }) {
      if (hiddenRef.current) {
        hiddenRef.current.value = e.isEmpty ? "" : e.getHTML();
      }
    },
  });

  function addLink() {
    if (!editor) return;
    const url = prompt("Enter URL:");
    if (!url) return;
    editor.chain().focus().setLink({ href: url }).run();
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    // Reset input so the same file can be re-selected
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
        editor
          .chain()
          .focus()
          .setImage({ src: result.url })
          .createParagraphNear()
          .run();
      }
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {editor && (
        <Toolbar
          editor={editor}
          onAddLink={addLink}
          onAddImage={() => fileInputRef.current?.click()}
          isUploading={isUploading}
        />
      )}
      <EditorContent editor={editor} />
      {uploadError && (
        <p className="px-4 py-1.5 text-xs text-destructive">{uploadError}</p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleImageUpload}
        className="hidden"
      />
      <input
        ref={hiddenRef}
        type="hidden"
        name={name}
        defaultValue={defaultValue}
      />
      <input type="hidden" name="bodyFormat" value="html" />
    </div>
  );
}

function Toolbar({
  editor,
  onAddLink,
  onAddImage,
  isUploading = false,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  onAddLink: () => void;
  onAddImage: () => void;
  isUploading?: boolean;
}) {
  const btn = (active: boolean) =>
    cn(
      "rounded p-1.5 transition-colors",
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btn(editor.isActive("bold"))}
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btn(editor.isActive("italic"))}
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </button>
      <div className="mx-1 h-5 w-px bg-border" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={btn(editor.isActive("heading", { level: 2 }))}
        title="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={btn(editor.isActive("heading", { level: 3 }))}
        title="Heading 3"
      >
        <Heading3 className="h-4 w-4" />
      </button>
      <div className="mx-1 h-5 w-px bg-border" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btn(editor.isActive("bulletList"))}
        title="Bullet list"
      >
        <List className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btn(editor.isActive("orderedList"))}
        title="Ordered list"
      >
        <ListOrdered className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={btn(editor.isActive("blockquote"))}
        title="Blockquote"
      >
        <Quote className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className={btn(false)}
        title="Horizontal rule"
      >
        <Minus className="h-4 w-4" />
      </button>
      <div className="mx-1 h-5 w-px bg-border" />
      <button
        type="button"
        onClick={onAddLink}
        className={btn(editor.isActive("link"))}
        title="Add link"
      >
        <LinkIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onAddImage}
        className={btn(false)}
        title="Add image"
        disabled={isUploading}
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImageIcon className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
