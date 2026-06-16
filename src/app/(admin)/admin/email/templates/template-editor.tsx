"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { EmailTemplate } from "@/types/database";
import {
  assertMailyDocument,
  createDefaultMailyDocument,
  type MailyDocument,
} from "@/lib/email/rendering/maily";
import {
  createAndPublishTemplateAction,
  deleteTemplateAction,
  publishTemplateVersionAction,
  renderTemplatePreviewAction,
} from "./actions";
import type {
  EmailTemplateVersionDocument,
  EmailTemplateVersionsById,
} from "../actions";
import {
  EmailDesigner,
  type EmailDesignerHandle,
} from "./email-designer";
import { EmailPreview } from "./email-preview";
import { prependTemplateOnce } from "./template-list-state";

function readCachedTemplateDocument(
  versionId: string,
  templateVersionsById: EmailTemplateVersionsById,
) {
  const cachedVersion = templateVersionsById[versionId];
  if (!cachedVersion) return null;
  return assertMailyDocument(cachedVersion.builderJson);
}

export function TemplateEditor({
  templates,
  templateVersionsById,
  ensureTemplateVersion,
  onTemplatesChange,
}: {
  templates: EmailTemplate[];
  templateVersionsById: EmailTemplateVersionsById;
  ensureTemplateVersion: (
    versionId: string,
    options?: { quiet?: boolean },
  ) => Promise<EmailTemplateVersionDocument | null>;
  onTemplatesChange?: (templates: EmailTemplate[]) => void;
}) {
  const [uncontrolledTemplates, setUncontrolledTemplates] = useState(templates);
  const localTemplates = onTemplatesChange ? templates : uncontrolledTemplates;
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    templates[0]?.id ?? "",
  );
  const initialTemplateVersionId = templates[0]?.current_version_id ?? "";
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [document, setDocument] = useState<MailyDocument>(() => {
    if (!initialTemplateVersionId) return createDefaultMailyDocument();
    try {
      return (
        readCachedTemplateDocument(
          initialTemplateVersionId,
          templateVersionsById,
        ) ?? createDefaultMailyDocument()
      );
    } catch {
      return createDefaultMailyDocument();
    }
  });
  const [loadedTemplateVersionId, setLoadedTemplateVersionId] = useState(() => {
    if (!initialTemplateVersionId) return "";
    try {
      return readCachedTemplateDocument(
        initialTemplateVersionId,
        templateVersionsById,
      )
        ? initialTemplateVersionId
        : "";
    } catch {
      return "";
    }
  });
  const [templateLoadError, setTemplateLoadError] = useState<{
    versionId: string;
    message: string;
  } | null>(null);
  const [isLoadingVersion, startLoadTransition] = useTransition();
  const [isPublishing, startPublishTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [view, setView] = useState<"design" | "preview">("design");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isRenderingPreview, startPreviewTransition] = useTransition();
  const designerRef = useRef<EmailDesignerHandle>(null);

  const renderPreview = useCallback(() => {
    const builderJson =
      designerRef.current?.getSnapshot().builderJson ?? document;
    startPreviewTransition(async () => {
      try {
        const result = await renderTemplatePreviewAction({ builderJson });
        setPreviewHtml(result.html);
        setPreviewError(null);
      } catch (error) {
        setPreviewError(
          error instanceof Error
            ? error.message
            : "Failed to render preview.",
        );
      }
    });
  }, [document]);

  const showPreview = useCallback(() => {
    setView("preview");
    renderPreview();
  }, [renderPreview]);

  const applyLocalTemplates = useCallback(
    (nextTemplates: EmailTemplate[]) => {
      if (onTemplatesChange) {
        onTemplatesChange(nextTemplates);
        return;
      }
      setUncontrolledTemplates(nextTemplates);
    },
    [onTemplatesChange],
  );

  const selectedTemplate = useMemo(
    () => localTemplates.find((template) => template.id === selectedTemplateId),
    [localTemplates, selectedTemplateId],
  );
  const selectedTemplateVersionId = selectedTemplate?.current_version_id ?? "";
  const activeTemplateLoadError =
    templateLoadError?.versionId === selectedTemplateVersionId
      ? templateLoadError.message
      : null;

  useEffect(() => {
    if (isCreatingTemplate) return;
    if (!selectedTemplateVersionId) return;
    if (loadedTemplateVersionId === selectedTemplateVersionId) return;
    let isActive = true;

    startLoadTransition(async () => {
      try {
        const version = await ensureTemplateVersion(
          selectedTemplateVersionId,
          { quiet: true },
        );
        if (!isActive || !version) return;
        const nextDocument = assertMailyDocument(version.builderJson);
        setDocument(nextDocument);
        setLoadedTemplateVersionId(selectedTemplateVersionId);
        setTemplateLoadError(null);
        designerRef.current?.loadDocument(nextDocument);
      } catch (error) {
        if (!isActive) return;
        const message =
          error instanceof Error ? error.message : "Failed to load template.";
        setTemplateLoadError({
          versionId: selectedTemplateVersionId,
          message,
        });
        toast.error(
          message,
        );
      }
    });

    return () => {
      isActive = false;
    };
  }, [
    ensureTemplateVersion,
    isCreatingTemplate,
    loadedTemplateVersionId,
    selectedTemplateVersionId,
  ]);

  const resetEditor = useCallback(() => {
    const fresh = createDefaultMailyDocument();
    setDocument(fresh);
    setLoadedTemplateVersionId("");
    designerRef.current?.loadDocument(fresh);
  }, []);

  function handleSelectTemplate(template: EmailTemplate) {
    setIsCreatingTemplate(false);
    setTemplateLoadError(null);
    setSelectedTemplateId(template.id);
    if (!template.current_version_id) {
      resetEditor();
    }
  }

  const handleAddTemplate = useCallback(() => {
    setIsCreatingTemplate(true);
    setTemplateLoadError(null);
    setSelectedTemplateId("");
    setDraftName("");
    setDraftDescription("");
    resetEditor();
  }, [resetEditor]);

  function handlePublish() {
    startPublishTransition(async () => {
      try {
        const snapshot = designerRef.current?.getSnapshot();
        const builderJson = snapshot?.builderJson ?? document;

        if (isCreatingTemplate) {
          const result = await createAndPublishTemplateAction({
            name: draftName,
            description: draftDescription,
            builderJson,
          });
          applyLocalTemplates(
            prependTemplateOnce(localTemplates, result.template),
          );
          setSelectedTemplateId(result.template.id);
          setLoadedTemplateVersionId(result.versionId);
          setIsCreatingTemplate(false);
          toast.success("Template created.");
          return;
        }

        if (!selectedTemplateId) {
          toast.error("Create or select a template first.");
          return;
        }

        const result = await publishTemplateVersionAction({
          templateId: selectedTemplateId,
          builderJson,
        });
        applyLocalTemplates(
          localTemplates.map((template) =>
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
        setLoadedTemplateVersionId(result.versionId);
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
        const nextTemplates = localTemplates.filter(
          (template) => template.id !== selectedTemplateId,
        );
        applyLocalTemplates(nextTemplates);
        const nextTemplate = nextTemplates[0];
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
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-medium text-foreground">Templates</h3>
            <button
              type="button"
              onClick={handleAddTemplate}
              className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isCreatingTemplate
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              <Plus className="h-4 w-4" />
              Add new template
            </button>
          </div>
          <div className="max-h-[760px] overflow-auto p-2">
            {localTemplates.length === 0 ? (
              <p className="px-2 py-6 text-sm text-muted-foreground">
                Add a template to start designing.
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

        {!isCreatingTemplate && !selectedTemplate ? (
          <section className="flex min-h-[760px] min-w-0 items-center justify-center rounded-md border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              Select a template or add a new one.
            </p>
          </section>
        ) : (
          <section className="min-w-0 rounded-md border border-border bg-card p-4">
            <div className="mb-4 flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-foreground">
                    {isCreatingTemplate
                      ? "New template"
                      : selectedTemplate?.name}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isCreatingTemplate
                      ? "Name the reusable design and build the email body."
                      : selectedTemplate?.description ||
                        "Reusable visual email design."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={
                      isPublishing ||
                      isLoadingVersion ||
                      Boolean(activeTemplateLoadError) ||
                      (isCreatingTemplate && !draftName.trim())
                    }
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {isPublishing
                      ? isCreatingTemplate
                        ? "Creating..."
                        : "Publishing..."
                      : isCreatingTemplate
                        ? "Create template"
                        : "Publish changes"}
                  </button>
                  {!isCreatingTemplate && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={!selectedTemplateId || isDeleting}
                      className="inline-flex items-center gap-2 rounded-md border border-destructive/60 px-3 py-2 text-sm font-medium text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {isCreatingTemplate && (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                      Name
                    </span>
                    <input
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                      Description
                    </span>
                    <input
                      value={draftDescription}
                      onChange={(event) =>
                        setDraftDescription(event.target.value)
                      }
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="mb-3 inline-flex rounded-md border border-border p-0.5">
              <button
                type="button"
                onClick={() => setView("design")}
                aria-pressed={view === "design"}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === "design"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Pencil className="h-3.5 w-3.5" />
                Design
              </button>
              <button
                type="button"
                onClick={showPreview}
                aria-pressed={view === "preview"}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === "preview"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
            </div>

            {/* Editor stays mounted (just hidden) so in-progress edits and
                cursor state survive toggling to the preview and back. */}
            <div className={view === "design" ? "" : "hidden"}>
              <EmailDesigner
                ref={designerRef}
                sourceDocument={document}
                onDocumentChange={setDocument}
              />
            </div>
            {view === "preview" && (
              <EmailPreview
                html={previewHtml}
                isLoading={isRenderingPreview}
                error={previewError}
                onRefresh={renderPreview}
              />
            )}
            {activeTemplateLoadError && (
              <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                This saved template version is invalid. Select another template
                or create a new one.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
