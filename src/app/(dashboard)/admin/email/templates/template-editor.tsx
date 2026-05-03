"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { EmailTemplate } from "@/types/database";
import {
  createDefaultMailyDocument,
  parseMailyDocumentOrDefault,
  type MailyDocument,
} from "@/lib/email/rendering/maily";
import { CreateTemplateForm } from "./create-template-form";
import {
  deleteTemplateAction,
  getTemplateVersionForEditorAction,
  publishTemplateVersionAction,
} from "./actions";
import {
  EmailDesigner,
  type EmailDesignerHandle,
} from "./email-designer";
import { prependTemplateOnce } from "./template-list-state";

export function TemplateEditor({
  templates,
}: {
  templates: EmailTemplate[];
}) {
  const [localTemplates, setLocalTemplates] = useState(templates);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    templates[0]?.id ?? "",
  );
  const [subject, setSubject] = useState("Hello {{contact.name}}");
  const [previewText, setPreviewText] = useState("");
  const [document, setDocument] = useState<MailyDocument>(() =>
    createDefaultMailyDocument(),
  );
  const [isLoadingVersion, startLoadTransition] = useTransition();
  const [isPublishing, startPublishTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const designerRef = useRef<EmailDesignerHandle>(null);

  const selectedTemplate = useMemo(
    () => localTemplates.find((template) => template.id === selectedTemplateId),
    [localTemplates, selectedTemplateId],
  );

  useEffect(() => {
    if (!selectedTemplate?.current_version_id) return;

    startLoadTransition(async () => {
      try {
        const version = await getTemplateVersionForEditorAction(
          selectedTemplate.current_version_id!,
        );
        if (!version) return;
        const nextDocument = parseMailyDocumentOrDefault(version.builderJson);
        setSubject(version.subject);
        setPreviewText(version.previewText);
        setDocument(nextDocument);
        designerRef.current?.loadDocument(nextDocument);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load template.",
        );
      }
    });
  }, [selectedTemplate?.current_version_id]);

  const resetEditor = useCallback(() => {
    const fresh = createDefaultMailyDocument();
    setSubject("Hello {{contact.name}}");
    setPreviewText("");
    setDocument(fresh);
    designerRef.current?.loadDocument(fresh);
  }, []);

  function handleSelectTemplate(template: EmailTemplate) {
    setSelectedTemplateId(template.id);
    if (!template.current_version_id) {
      resetEditor();
    }
  }

  const handleCreated = useCallback((template: EmailTemplate) => {
    setLocalTemplates((current) => prependTemplateOnce(current, template));
    setSelectedTemplateId(template.id);
    resetEditor();
  }, [resetEditor]);

  function handlePublish() {
    if (!selectedTemplateId) {
      toast.error("Create or select a template first.");
      return;
    }

    startPublishTransition(async () => {
      try {
        const snapshot = designerRef.current?.getSnapshot();
        const result = await publishTemplateVersionAction({
          templateId: selectedTemplateId,
          subject,
          previewText,
          builderJson: snapshot?.builderJson ?? document,
        });
        setLocalTemplates((current) =>
          current.map((template) =>
            template.id === selectedTemplateId
              ? {
                  ...template,
                  status: "published",
                  current_version_id: result.versionId,
                  updated_at: new Date().toISOString(),
                }
              : template,
          ),
        );
        toast.success("Template published.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to publish template.",
        );
      }
    });
  }

  function handleDelete() {
    if (!selectedTemplateId) return;
    startDeleteTransition(async () => {
      try {
        await deleteTemplateAction(selectedTemplateId);
        setLocalTemplates((current) =>
          current.filter((template) => template.id !== selectedTemplateId),
        );
        const nextTemplate = localTemplates.find(
          (template) => template.id !== selectedTemplateId,
        );
        setSelectedTemplateId(nextTemplate?.id ?? "");
        if (!nextTemplate?.current_version_id) resetEditor();
        toast.success("Template deleted.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to delete template.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <CreateTemplateForm onCreated={handleCreated} />

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-medium text-foreground">Templates</h3>
          </div>
          <div className="max-h-[760px] overflow-auto p-2">
            {localTemplates.length === 0 ? (
              <p className="px-2 py-6 text-sm text-muted-foreground">
                Create a template to start designing.
              </p>
            ) : (
              localTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => handleSelectTemplate(template)}
                  className={`mb-1 w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    template.id === selectedTemplateId
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <span className="block font-medium">{template.name}</span>
                  <span className="block truncate text-xs opacity-75">
                    {template.description || template.category}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="min-w-0 rounded-md border border-border bg-card p-4">
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_minmax(240px,1fr)_auto_auto]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Subject
              </span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Preview text
              </span>
              <input
                value={previewText}
                onChange={(event) => setPreviewText(event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handlePublish}
                disabled={isPublishing || isLoadingVersion}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {isPublishing ? "Publishing..." : "Publish"}
              </button>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleDelete}
                disabled={!selectedTemplateId || isDeleting}
                className="inline-flex items-center gap-2 rounded-md border border-destructive/60 px-3 py-2 text-sm font-medium text-destructive disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>

          <EmailDesigner
            ref={designerRef}
            sourceDocument={document}
            onDocumentChange={setDocument}
          />
        </section>
      </div>
    </div>
  );
}
