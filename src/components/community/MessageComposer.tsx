"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useRef, useActionState } from "react";
import { cn } from "@/lib/utils";
import { Bold, Italic, Link as LinkIcon, Send } from "lucide-react";
import { sendMessage, type DmActionState } from "@/app/(marketing)/community/messages/actions";

interface MessageComposerProps {
  conversationId: string;
}

const initialState: DmActionState = {
  errors: null,
  message: "",
  success: false,
  resetKey: 0,
};

export function MessageComposer({ conversationId }: MessageComposerProps) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [state, formAction, isPending] = useActionState(sendMessage, initialState);

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
  });

  // Clear editor on successful send (previous-value-in-state pattern)
  const prevResetKeyRef = useRef(0);
  if (state.success && state.resetKey !== prevResetKeyRef.current) {
    prevResetKeyRef.current = state.resetKey;
    editor?.commands.clearContent();
    if (hiddenRef.current) hiddenRef.current.value = "";
  }

  function addLink() {
    if (!editor) return;
    const url = prompt("Enter URL:");
    if (!url) return;
    editor.chain().focus().setLink({ href: url }).run();
  }

  const btn = (active: boolean) =>
    cn(
      "rounded p-1.5 transition-colors",
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <form action={formAction} className="border-t border-border bg-card px-4 py-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <input ref={hiddenRef} type="hidden" name="body" />
      <input type="hidden" name="bodyFormat" value="html" />

      <div className="rounded-lg border border-border bg-background">
        {editor && (
          <div className="flex items-center gap-0.5 border-b border-border px-2 py-1">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={btn(editor.isActive("bold"))}
              title="Bold"
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={btn(editor.isActive("italic"))}
              title="Italic"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={addLink}
              className={btn(editor.isActive("link"))}
              title="Add link"
            >
              <LinkIcon className="h-3.5 w-3.5" />
            </button>

            <div className="ml-auto">
              <button
                type="submit"
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

      {state.message && !state.success && (
        <p className="mt-1 text-xs text-destructive">{state.message}</p>
      )}
      {state.errors?.body && (
        <p className="mt-1 text-xs text-destructive">{state.errors.body}</p>
      )}
    </form>
  );
}
