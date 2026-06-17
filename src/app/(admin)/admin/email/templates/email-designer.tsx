"use client";

import dynamic from "next/dynamic";
import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { EditorProps } from "@maily-to/core";
import {
  ImageUploadExtension,
  VariableExtension,
  getVariableSuggestions,
} from "@maily-to/core/extensions";
import { Loader2 } from "lucide-react";
import {
  assertMailyDocument,
  type MailyDocument,
} from "@/lib/email/rendering/maily";
import { uploadEmailAssetAction } from "../assets/actions";
import { mailyBlockGroups } from "./maily-blocks";

// memo so unrelated parent re-renders (e.g. changing the email width, which only
// touches a CSS variable on the wrapper) don't re-render the editor and drop its
// node views (logo image, variable chips). Only genuine prop changes re-render.
const MailyEditor = memo(
  dynamic<EditorProps>(
    () => import("@maily-to/core").then((module) => module.Editor),
    {
      ssr: false,
      loading: () => (
        <div className="email-maily-editor min-h-[760px] rounded-md border border-border">
          <div className="email-maily-canvas flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading editor...
          </div>
        </div>
      ),
    },
  ),
);

export interface EmailDesignerSnapshot {
  document: MailyDocument;
  builderJson: Record<string, unknown>;
}

export interface EmailDesignerHandle {
  getSnapshot: () => EmailDesignerSnapshot;
  loadDocument: (document: MailyDocument) => void;
}

interface EmailDesignerProps {
  sourceDocument: MailyDocument;
  onDocumentChange: (document: MailyDocument) => void;
  /**
   * Per-template email width. The Maily editor strips unknown top-level keys
   * from its JSON, so the width is tracked outside the editor and re-merged into
   * the snapshot here — that way save, preview, and send all keep it.
   */
  maxWidth?: number;
}

export const EmailDesigner = forwardRef<EmailDesignerHandle, EmailDesignerProps>(
  function EmailDesigner({ sourceDocument, onDocumentChange, maxWidth }, ref) {
    const editorRef = useRef<TiptapEditor | null>(null);

    const extensions = useMemo(
      () => [
        VariableExtension.configure({
          suggestion: getVariableSuggestions("@"),
          variables: [
            { name: "contact.name", required: false },
            { name: "contact.email", required: false },
            { name: "owner.name", required: false },
            { name: "owner.email", required: false },
          ],
        }),
        ImageUploadExtension.configure({
          allowedMimeTypes: [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
          ],
          onImageUpload: async (file: Blob) => {
            const formData = new FormData();
            formData.set(
              "image",
              file instanceof File
                ? file
                : new File([file], "email-image", { type: file.type }),
            );
            const asset = await uploadEmailAssetAction(formData);
            return asset.public_url;
          },
        }),
      ],
      [],
    );

    const handleCreate = useCallback((editor: TiptapEditor) => {
      editorRef.current = editor;
    }, []);

    const handleUpdate = useCallback(
      (editor: TiptapEditor) => {
        onDocumentChange(assertMailyDocument(editor.getJSON()));
      },
      [onDocumentChange],
    );

    // Stable so the memoized MailyEditor only re-renders on real content
    // changes — not when the email width changes (that only updates a CSS var).
    const editorConfig = useMemo(
      () => ({
        autofocus: "end" as const,
        contentClassName: "min-h-[620px] max-w-none",
        bodyClassName: "email-maily-canvas min-h-[680px]",
        wrapClassName: "email-maily-editor",
      }),
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        getSnapshot() {
          const document = assertMailyDocument(
            editorRef.current?.getJSON() ?? sourceDocument,
          );
          const withWidth: MailyDocument =
            maxWidth == null ? document : { ...document, maxWidth };
          return {
            document: withWidth,
            builderJson: withWidth as Record<string, unknown>,
          };
        },
        loadDocument(document) {
          const normalized = assertMailyDocument(document);
          editorRef.current?.commands.setContent(normalized);
          onDocumentChange(normalized);
        },
      }),
      [maxWidth, onDocumentChange, sourceDocument],
    );

    return (
      <div
        className="flex min-h-[760px] min-w-0 flex-col"
        // Drives the canvas card width so Design matches the per-template email
        // width (see .email-maily-canvas in globals.css).
        style={
          maxWidth
            ? ({ "--email-canvas-width": `${maxWidth}px` } as CSSProperties)
            : undefined
        }
      >
        <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-[#f3f4f6]">
          <MailyEditor
            contentJson={sourceDocument}
            onCreate={handleCreate}
            onUpdate={handleUpdate}
            extensions={extensions}
            blocks={mailyBlockGroups}
            config={editorConfig}
          />
        </div>
      </div>
    );
  },
);
