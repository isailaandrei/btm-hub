"use client";

import dynamic from "next/dynamic";
import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { Maximize2, Minimize2 } from "lucide-react";
import type { EditorProps } from "@maily-to/core";
import {
  ImageUploadExtension,
  VariableExtension,
  getVariableSuggestions,
} from "@maily-to/core/extensions";
import { Loader2 } from "lucide-react";
import { Extension } from "@tiptap/core";
import {
  applyLayoutToDocument,
  arrangeEmailRows,
  assertMailyDocument,
  type EmailLayout,
  type MailyDocument,
} from "@/lib/email/rendering/maily";
import { uploadEmailAssetAction } from "../assets/actions";
import { mailyBlockGroups } from "./maily-blocks";

// Adds a `fullWidth` attribute to section + image nodes so the editor preserves
// it (and so updateAttributes can toggle it). Sections default to full-width,
// images to inset — matching isFullWidthNode in the renderer.
const FullWidthExtension = Extension.create({
  name: "fullWidthAttribute",
  addGlobalAttributes() {
    // `rendered: false` keeps the flag in the document model (so getJSON/render
    // see it) without emitting it to the DOM — Maily's node views spread raw
    // attrs onto elements, which would otherwise trigger React DOM warnings.
    const attribute = (defaultValue: boolean) => ({
      fullWidth: { default: defaultValue, rendered: false },
    });
    return [
      { types: ["section"], attributes: attribute(true) },
      { types: ["image"], attributes: attribute(false) },
    ];
  },
});

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

type FullWidthTarget = { type: "section" | "image"; fullWidth: boolean };

/** Identify the section/image the current selection acts on, and its full-width
 *  state — so we can show and drive the "Full width" toggle. */
function activeFullWidthTarget(editor: TiptapEditor): FullWidthTarget | null {
  const { selection } = editor.state;
  const selectedNode = (selection as { node?: { type: { name: string }; attrs: Record<string, unknown> } }).node;
  if (selectedNode?.type.name === "image") {
    return { type: "image", fullWidth: selectedNode.attrs.fullWidth === true };
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "section") {
      return { type: "section", fullWidth: node.attrs.fullWidth !== false };
    }
  }
  return null;
}

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
   * Per-template layout (width + vertical padding). The Maily editor strips
   * unknown top-level keys from its JSON, so layout is tracked outside the editor
   * and re-merged into the snapshot here — so save, preview, and send all keep it.
   */
  layout?: EmailLayout;
}

export const EmailDesigner = forwardRef<EmailDesignerHandle, EmailDesignerProps>(
  function EmailDesigner({ sourceDocument, onDocumentChange, layout }, ref) {
    const editorRef = useRef<TiptapEditor | null>(null);

    // Arrange into rows so the editor canvas matches the render exactly
    // (full-width nodes edge-to-edge, inset content guttered). Idempotent +
    // memoized so it doesn't churn the memoized editor on unrelated re-renders.
    const editorContent = useMemo(
      () => arrangeEmailRows(assertMailyDocument(sourceDocument)),
      [sourceDocument],
    );

    const extensions = useMemo(
      () => [
        FullWidthExtension,
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

    const [fullWidthTarget, setFullWidthTarget] = useState<FullWidthTarget | null>(
      null,
    );

    const handleCreate = useCallback((editor: TiptapEditor) => {
      editorRef.current = editor;
      const sync = () => setFullWidthTarget(activeFullWidthTarget(editor));
      editor.on("selectionUpdate", sync);
      editor.on("transaction", sync);
      sync();
    }, []);

    // Toggle the selected section/image between full-width and inset, then
    // re-arrange so it moves between an edge-to-edge row and the gutter — keeping
    // the editor structure identical to what the renderer produces.
    const toggleFullWidth = useCallback(() => {
      const editor = editorRef.current;
      if (!editor) return;
      const target = activeFullWidthTarget(editor);
      if (!target) return;
      editor
        .chain()
        .focus()
        .updateAttributes(target.type, { fullWidth: !target.fullWidth })
        .run();
      const arranged = arrangeEmailRows(assertMailyDocument(editor.getJSON()));
      editor.commands.setContent(arranged);
      onDocumentChange(arranged);
      setFullWidthTarget(activeFullWidthTarget(editor));
    }, [onDocumentChange]);

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
          const withLayout: MailyDocument = layout
            ? applyLayoutToDocument(document, layout)
            : document;
          return {
            document: withLayout,
            builderJson: withLayout as Record<string, unknown>,
          };
        },
        loadDocument(document) {
          const normalized = arrangeEmailRows(assertMailyDocument(document));
          editorRef.current?.commands.setContent(normalized);
          onDocumentChange(normalized);
        },
      }),
      [layout, onDocumentChange, sourceDocument],
    );

    return (
      <div
        className="flex min-h-[760px] min-w-0 flex-col"
        // Drives the canvas card so Design matches the per-template layout
        // (width + vertical padding); see .email-maily-canvas in globals.css.
        style={
          layout
            ? ({
                "--email-canvas-width": `${layout.maxWidth}px`,
                "--email-canvas-pt": `${layout.paddingTop}px`,
                "--email-canvas-pb": `${layout.paddingBottom}px`,
              } as CSSProperties)
            : undefined
        }
      >
        {fullWidthTarget && (
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFullWidth}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              {fullWidthTarget.fullWidth ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  Inset {fullWidthTarget.type}
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  Make {fullWidthTarget.type} full width
                </>
              )}
            </button>
          </div>
        )}
        <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-[#f3f4f6]">
          <MailyEditor
            contentJson={editorContent}
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
