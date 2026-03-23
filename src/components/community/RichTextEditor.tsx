"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Mention from "@tiptap/extension-mention";
import { useRef } from "react";
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
} from "lucide-react";
import { mentionSuggestion } from "./mention-suggestion";

interface RichTextEditorProps {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}

export function RichTextEditor({
  name,
  defaultValue = "",
  placeholder,
  required,
}: RichTextEditorProps) {
  const hiddenRef = useRef<HTMLInputElement>(null);

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

  function addImage() {
    if (!editor) return;
    const url = prompt("Enter image URL:");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {editor && <Toolbar editor={editor} onAddLink={addLink} onAddImage={addImage} />}
      <EditorContent editor={editor} />
      <input
        ref={hiddenRef}
        type="hidden"
        name={name}
        defaultValue={defaultValue}
        required={required}
      />
      <input type="hidden" name="bodyFormat" value="html" />
      {placeholder && editor?.isEmpty && (
        <div className="pointer-events-none absolute px-4 py-3 text-sm text-muted-foreground">
          {placeholder}
        </div>
      )}
    </div>
  );
}

function Toolbar({
  editor,
  onAddLink,
  onAddImage,
}: {
  editor: ReturnType<typeof useEditor> & {};
  onAddLink: () => void;
  onAddImage: () => void;
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
      >
        <ImageIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
