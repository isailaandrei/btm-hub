"use client";

import dynamic from "next/dynamic";
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
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

const MailyEditor = dynamic<EditorProps>(
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
}

export const EmailDesigner = forwardRef<EmailDesignerHandle, EmailDesignerProps>(
  function EmailDesigner({ sourceDocument, onDocumentChange }, ref) {
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

    useImperativeHandle(
      ref,
      () => ({
        getSnapshot() {
          const document = assertMailyDocument(
            editorRef.current?.getJSON() ?? sourceDocument,
          );
          return {
            document,
            builderJson: document as Record<string, unknown>,
          };
        },
        loadDocument(document) {
          const normalized = assertMailyDocument(document);
          editorRef.current?.commands.setContent(normalized);
          onDocumentChange(normalized);
        },
      }),
      [onDocumentChange, sourceDocument],
    );

    return (
      <div className="flex min-h-[760px] min-w-0 flex-col">
        <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-[#f3f4f6]">
          <MailyEditor
            contentJson={sourceDocument}
            onCreate={(editor) => {
              editorRef.current = editor;
            }}
            onUpdate={(editor) => {
              onDocumentChange(assertMailyDocument(editor.getJSON()));
            }}
            extensions={extensions}
            blocks={mailyBlockGroups}
            config={{
              autofocus: "end",
              contentClassName: "min-h-[620px] max-w-none",
              bodyClassName: "email-maily-canvas min-h-[680px]",
              wrapClassName: "email-maily-editor",
            }}
          />
        </div>
      </div>
    );
  },
);
