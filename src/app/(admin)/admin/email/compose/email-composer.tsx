"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  AtSign,
  Eye,
  Filter,
  Inbox,
  Loader2,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  EmailManualRecipient,
  EmailSendKind,
  EmailTemplate,
} from "@/types/database";
import {
  applyLayoutToDocument,
  assertMailyDocument,
  createDefaultMailyDocument,
  getMailyDocumentLayout,
  type EmailLayout,
  type MailyDocument,
} from "@/lib/email/rendering/maily";
import {
  EmailDesigner,
  type EmailDesignerHandle,
} from "../templates/email-designer";
import {
  createEmailListAction,
  getComposeRecipientsAction,
  loadAudienceContactsAction,
  loadEmailListsAction,
  loadEmailSegmentsAction,
  renderComposePreviewAction,
  saveEmailManualRecipientAction,
  sendEmailNowAction,
  type ComposeRecipient,
  type ComposeSkippedRecipient,
  type EmailTemplateVersionDocument,
} from "../actions";

interface PickerContact {
  id: string;
  name: string;
  email: string;
}
import type { EmailListSummary } from "@/lib/data/email-lists";
import type { EmailSegmentSummary } from "@/lib/data/email-segments";
import { deleteTemplateAction, renameTemplateAction } from "../templates/actions";
import { SaveAsTemplate } from "./save-as-template";
import {
  BROADCAST_CONFIRMATION_MESSAGE,
  requiresBroadcastConfirmation,
} from "./broadcast-confirmation";
import { getRecipientSummary } from "./recipient-summary";
import { RecipientList } from "./recipient-list";
import { StartFromPicker } from "./start-from-picker";
import { EmailPreview } from "../templates/email-preview";
import { EmailLayoutControls } from "../templates/email-layout-controls";

export function EmailComposer({
  templates,
  ensureTemplateVersion,
  selectedContactIds,
  manualRecipients,
  setManualRecipients,
  setTemplates,
  onSendStarted,
  isActive = true,
}: {
  templates: EmailTemplate[];
  ensureTemplateVersion: (
    versionId: string,
    options?: { quiet?: boolean },
  ) => Promise<EmailTemplateVersionDocument | null>;
  selectedContactIds: string[];
  manualRecipients: EmailManualRecipient[];
  setManualRecipients: Dispatch<SetStateAction<EmailManualRecipient[] | null>>;
  setTemplates: Dispatch<SetStateAction<EmailTemplate[] | null>>;
  onSendStarted?: () => void;
  /** Compose tab is the visible one — reload audiences when returning to it. */
  isActive?: boolean;
}) {
  const publishedTemplates = useMemo(
    () => templates.filter((template) => template.current_version_id),
    [templates],
  );
  const [kind, setKind] = useState<EmailSendKind>("outreach");
  // "" = a blank starting point. Compose defaults to blank; admins choose a
  // saved template from the "Start from…" picker when they want to reuse one.
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [subject, setSubject] = useState("Hello {{contact.name}}");
  const [previewText, setPreviewText] = useState("");
  const [document, setDocument] = useState<MailyDocument>(() =>
    createDefaultMailyDocument(),
  );
  const [layout, setLayout] = useState<EmailLayout>(() =>
    getMailyDocumentLayout(document),
  );
  const [loadedTemplateVersionId, setLoadedTemplateVersionId] = useState("");
  const [templateLoadError, setTemplateLoadError] = useState<{
    versionId: string;
    message: string;
  } | null>(null);
  const [selectedManualRecipientIds, setSelectedManualRecipientIds] = useState<
    string[]
  >([]);
  const [manualRecipientName, setManualRecipientName] = useState("");
  const [manualRecipientEmail, setManualRecipientEmail] = useState("");
  const [isAddRecipientOpen, setIsAddRecipientOpen] = useState(false);
  const [lists, setLists] = useState<EmailListSummary[] | null>(null);
  const [listsError, setListsError] = useState<string | null>(null);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [segments, setSegments] = useState<EmailSegmentSummary[] | null>(null);
  const [segmentsError, setSegmentsError] = useState<string | null>(null);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [activeAudienceSource, setActiveAudienceSource] = useState<
    "lists" | "segments" | "contacts" | "saved"
  >("contacts");
  // Individual contacts: seeded from the Contacts-tab selection, then managed
  // here so admins can add/remove specific people without leaving Compose.
  const [contactIds, setContactIds] = useState<string[]>(
    () => selectedContactIds,
  );
  const [contacts, setContacts] = useState<PickerContact[] | null>(null);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactQuery, setContactQuery] = useState("");
  const [isListSaveOpen, setIsListSaveOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [isSavingList, startSaveListTransition] = useTransition();
  const [isBroadcastConfirmOpen, setIsBroadcastConfirmOpen] = useState(false);
  const [isConfirmRecipientsOpen, setIsConfirmRecipientsOpen] = useState(false);
  const [view, setView] = useState<"design" | "preview">("design");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isRenderingPreview, startPreviewTransition] = useTransition();
  const [recipientDetails, setRecipientDetails] = useState<{
    eligible: ComposeRecipient[];
    skipped: ComposeSkippedRecipient[];
  } | null>(null);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);
  const [isLoadingRecipients, startRecipientsTransition] = useTransition();
  const [isLoadingTemplate, startLoadTransition] = useTransition();
  const [isSending, startSendTransition] = useTransition();
  const [isSavingManualRecipient, startSaveManualRecipientTransition] =
    useTransition();
  const designerRef = useRef<EmailDesignerHandle>(null);

  const selectedTemplate = publishedTemplates.find(
    (template) => template.id === selectedTemplateId,
  );
  const selectedTemplateVersionId = selectedTemplate?.current_version_id ?? "";
  const activeTemplateLoadError =
    templateLoadError?.versionId === selectedTemplateVersionId
      ? templateLoadError.message
      : null;

  useEffect(() => {
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
        setLayout(getMailyDocumentLayout(nextDocument));
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
  }, [ensureTemplateVersion, loadedTemplateVersionId, selectedTemplateVersionId]);

  // Load saved lists + segments so they can be picked as recipient sources. On
  // failure we surface an error (and a retry) rather than rendering an empty
  // picker, which would silently hide saved audiences — see "Fail Loud".
  const loadRecipientSources = useCallback(() => {
    void (async () => {
      try {
        const result = await loadEmailListsAction();
        setLists(result.lists);
        setListsError(null);
      } catch (error) {
        setListsError(
          error instanceof Error ? error.message : "Failed to load lists.",
        );
        setLists((current) => current ?? []);
      }
    })();
    void (async () => {
      try {
        const result = await loadEmailSegmentsAction();
        setSegments(result.segments);
        setSegmentsError(null);
      } catch (error) {
        setSegmentsError(
          error instanceof Error ? error.message : "Failed to load segments.",
        );
        setSegments((current) => current ?? []);
      }
    })();
    void (async () => {
      try {
        const result = await loadAudienceContactsAction();
        setContacts(result.contacts);
        setContactsError(null);
      } catch (error) {
        setContactsError(
          error instanceof Error ? error.message : "Failed to load contacts.",
        );
        setContacts((current) => current ?? []);
      }
    })();
  }, []);

  // Reload on mount and each time Compose becomes active again, so list/segment
  // counts stay fresh after edits made elsewhere (Audiences, Contacts bulk add).
  useEffect(() => {
    if (isActive) loadRecipientSources();
  }, [isActive, loadRecipientSources]);

  // Resolve the actual people an outreach send will reach (names + emails, plus
  // who gets skipped and why) so the Recipients panel can list them instead of
  // just a count. Broadcast targets everyone, so it is not itemized.
  useEffect(() => {
    if (
      kind !== "outreach" ||
      contactIds.length +
        selectedManualRecipientIds.length +
        selectedListIds.length +
        selectedSegmentIds.length ===
        0
    ) {
      return;
    }

    let isActive = true;
    startRecipientsTransition(async () => {
      try {
        const result = await getComposeRecipientsAction({
          kind: "outreach",
          contactIds,
          manualRecipientIds: selectedManualRecipientIds,
          listIds: selectedListIds,
          segmentIds: selectedSegmentIds,
        });
        if (!isActive) return;
        setRecipientDetails(result);
        setRecipientsError(null);
      } catch (error) {
        if (!isActive) return;
        setRecipientsError(
          error instanceof Error ? error.message : "Failed to load recipients.",
        );
      }
    });

    return () => {
      isActive = false;
    };
  }, [
    kind,
    contactIds,
    selectedManualRecipientIds,
    selectedListIds,
    selectedSegmentIds,
  ]);

  // While a chosen template is loading we hold off sending so we never send a
  // stale/empty document. A blank starting point is always ready.
  const isLoadingSelectedTemplate =
    Boolean(selectedTemplateVersionId) &&
    loadedTemplateVersionId !== selectedTemplateVersionId &&
    !activeTemplateLoadError;
  const isStartingPointReady =
    !selectedTemplateId ||
    (loadedTemplateVersionId === selectedTemplateVersionId &&
      !activeTemplateLoadError);
  const selectedManualRecipientCount =
    kind === "outreach" ? selectedManualRecipientIds.length : 0;
  const isOutreachWithoutRecipients =
    kind === "outreach" &&
    contactIds.length +
      selectedManualRecipientCount +
      selectedListIds.length +
      selectedSegmentIds.length ===
      0;

  function toggleManualRecipient(recipientId: string) {
    setSelectedManualRecipientIds((current) =>
      current.includes(recipientId)
        ? current.filter((id) => id !== recipientId)
        : [...current, recipientId],
    );
  }

  function toggleList(listId: string) {
    setSelectedListIds((current) =>
      current.includes(listId)
        ? current.filter((id) => id !== listId)
        : [...current, listId],
    );
  }

  function toggleSegment(segmentId: string) {
    setSelectedSegmentIds((current) =>
      current.includes(segmentId)
        ? current.filter((id) => id !== segmentId)
        : [...current, segmentId],
    );
  }

  function addContact(contactId: string) {
    setContactIds((current) =>
      current.includes(contactId) ? current : [...current, contactId],
    );
    setContactQuery("");
  }

  function removeContact(contactId: string) {
    setContactIds((current) => current.filter((id) => id !== contactId));
  }

  // Save the current ad-hoc selection (contacts + saved recipients) as a new,
  // reusable list. Already-selected lists are persisted, so they aren't included.
  function handleSaveSelectionAsList() {
    const name = newListName.trim();
    if (!name) return;
    startSaveListTransition(async () => {
      try {
        const { list } = await createEmailListAction({
          name,
          contactIds,
          manualRecipientIds: selectedManualRecipientIds,
        });
        const refreshed = await loadEmailListsAction();
        setLists(refreshed.lists);
        setSelectedListIds((current) =>
          current.includes(list.id) ? current : [...current, list.id],
        );
        setNewListName("");
        setIsListSaveOpen(false);
        toast.success("Saved as a list.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save list.",
        );
      }
    });
  }

  function handleSelectBlank() {
    setSelectedTemplateId("");
    setLoadedTemplateVersionId("");
    setTemplateLoadError(null);
    const blank = createDefaultMailyDocument();
    setDocument(blank);
    setLayout(getMailyDocumentLayout(blank));
    designerRef.current?.loadDocument(blank);
  }

  function handleSelectTemplate(templateId: string) {
    // The load effect picks up the new selection and loads its document.
    setSelectedTemplateId(templateId);
  }

  function handleDeleteTemplate(templateId: string) {
    void (async () => {
      try {
        await deleteTemplateAction(templateId);
        setTemplates((current) =>
          (current ?? []).filter((template) => template.id !== templateId),
        );
        if (selectedTemplateId === templateId) handleSelectBlank();
        toast.success("Template removed.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to remove template.",
        );
      }
    })();
  }

  function getCurrentBuilderJson() {
    return (
      designerRef.current?.getSnapshot().builderJson ??
      applyLayoutToDocument(document, layout)
    );
  }

  // The just-saved template becomes the active starting point. We mark its
  // version as already loaded so the load effect doesn't re-fetch and reset the
  // editor — the document on screen is exactly what we saved.
  function handleSavedAsTemplate(template: EmailTemplate, versionId: string) {
    setTemplates((current) => [
      template,
      ...(current ?? []).filter((existing) => existing.id !== template.id),
    ]);
    setSelectedTemplateId(template.id);
    setLoadedTemplateVersionId(versionId);
    setTemplateLoadError(null);
  }

  // The selected template now has a new current version (its content was
  // updated). Reflect that in the list and mark it loaded so the load effect
  // doesn't refetch and reset the editor — the document on screen is the update.
  function handleUpdatedTemplate(templateId: string, versionId: string) {
    setTemplates((current) =>
      (current ?? []).map((template) =>
        template.id === templateId
          ? {
              ...template,
              current_version_id: versionId,
              updated_at: new Date().toISOString(),
            }
          : template,
      ),
    );
    if (selectedTemplateId === templateId) {
      setLoadedTemplateVersionId(versionId);
      setTemplateLoadError(null);
    }
  }

  function handleRenameTemplate(templateId: string, name: string) {
    const previous = templates;
    // Optimistically reflect the new name; revert if the server rejects it.
    setTemplates((current) =>
      (current ?? []).map((template) =>
        template.id === templateId ? { ...template, name } : template,
      ),
    );
    void (async () => {
      try {
        await renameTemplateAction({ templateId, name });
        toast.success("Template renamed.");
      } catch (error) {
        setTemplates(previous);
        toast.error(
          error instanceof Error ? error.message : "Failed to rename template.",
        );
      }
    })();
  }

  function renderPreview() {
    const builderJson = getCurrentBuilderJson();
    startPreviewTransition(async () => {
      try {
        const result = await renderComposePreviewAction({
          builderJson,
          subject,
          previewText,
        });
        setPreviewHtml(result.html);
        setPreviewSubject(result.subject);
        setPreviewError(null);
      } catch (error) {
        setPreviewError(
          error instanceof Error ? error.message : "Failed to render preview.",
        );
      }
    });
  }

  function showPreview() {
    setView("preview");
    renderPreview();
  }

  // Re-render the on-demand preview when the width changes while it is open.
  const refreshPreviewOnWidthChange = useRef<() => void>(() => {});
  useEffect(() => {
    refreshPreviewOnWidthChange.current = () => {
      if (view === "preview") renderPreview();
    };
  });
  useEffect(() => {
    refreshPreviewOnWidthChange.current();
  }, [layout]);

  function handleSaveManualRecipient() {
    startSaveManualRecipientTransition(async () => {
      try {
        const result = await saveEmailManualRecipientAction({
          email: manualRecipientEmail,
          name: manualRecipientName,
        });
        setManualRecipients((current) => {
          const existing = current ?? [];
          const withoutSaved = existing.filter(
            (recipient) =>
              recipient.id !== result.manualRecipient.id &&
              recipient.email !== result.manualRecipient.email,
          );
          return [...withoutSaved, result.manualRecipient].sort((a, b) =>
            a.name.localeCompare(b.name),
          );
        });
        setSelectedManualRecipientIds((current) =>
          current.includes(result.manualRecipient.id)
            ? current
            : [...current, result.manualRecipient.id],
        );
        setManualRecipientName("");
        setManualRecipientEmail("");
        toast.success("Recipient saved.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save recipient.",
        );
      }
    });
  }

  function startSendNow() {
    if (!isStartingPointReady) {
      toast.error(
        activeTemplateLoadError ?? "Wait for the selected template to load.",
      );
      return;
    }
    if (isOutreachWithoutRecipients) {
      toast.error("Select at least one recipient before sending outreach.");
      return;
    }
    startSendTransition(async () => {
      try {
        // Same builder JSON the preview renders from, so send and preview can't
        // diverge — the fallback keeps the layout/font (applyLayoutToDocument)
        // even if the designer ref is momentarily null.
        await sendEmailNowAction({
          kind,
          subject,
          builderJson: getCurrentBuilderJson(),
          previewText,
          contactIds,
          manualRecipientIds:
            kind === "outreach" ? selectedManualRecipientIds : [],
          listIds: kind === "outreach" ? selectedListIds : [],
          segmentIds: kind === "outreach" ? selectedSegmentIds : [],
        });
        if (onSendStarted) {
          onSendStarted();
        } else {
          toast.success("Email sending started.");
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to start sending.",
        );
      }
    });
  }

  function handleSendNow() {
    if (!isStartingPointReady) {
      toast.error(
        activeTemplateLoadError ?? "Wait for the selected template to load.",
      );
      return;
    }
    if (isOutreachWithoutRecipients) {
      toast.error("Select at least one recipient before sending outreach.");
      return;
    }
    if (requiresBroadcastConfirmation(kind)) {
      setIsBroadcastConfirmOpen(true);
      return;
    }
    // Targeted: confirm against the resolved recipient list before sending.
    setIsConfirmRecipientsOpen(true);
  }

  function handleConfirmBroadcastSend() {
    setIsBroadcastConfirmOpen(false);
    startSendNow();
  }

  function handleConfirmRecipientsSend() {
    setIsConfirmRecipientsOpen(false);
    startSendNow();
  }

  const confirmEligibleCount = recipientDetails?.eligible.length ?? 0;

  const recipientSummary = getRecipientSummary({
    kind,
    selectedContactCount: contactIds.length,
    selectedManualRecipientCount,
  });

  // Suggest a template name from the subject, stripped of variable
  // placeholders (e.g. "Hello {{contact.name}}" → "Hello").
  const suggestedTemplateName =
    subject.replace(/\{\{.*?\}\}/g, "").replace(/\s+/g, " ").trim() ||
    selectedTemplate?.name ||
    "Untitled template";

  // Segments only appear as a source when some exist (or failed to load), so
  // admins with no segments see exactly the three sources they expect.
  const hasSegmentsSource =
    Boolean(segmentsError) || (segments?.length ?? 0) > 0;
  const audienceSources = [
    { key: "lists" as const, label: "Lists", icon: Users, count: selectedListIds.length },
    ...(hasSegmentsSource
      ? [
          {
            key: "segments" as const,
            label: "Segments",
            icon: Filter,
            count: selectedSegmentIds.length,
          },
        ]
      : []),
    {
      key: "contacts" as const,
      label: "Contacts",
      icon: UserPlus,
      count: contactIds.length,
    },
    {
      key: "saved" as const,
      label: "Saved",
      icon: AtSign,
      count: selectedManualRecipientIds.length,
    },
  ];

  const contactById = useMemo(() => {
    const map = new Map<string, PickerContact>();
    for (const contact of contacts ?? []) map.set(contact.id, contact);
    return map;
  }, [contacts]);

  const selectedContacts = useMemo(
    () =>
      contactIds.map(
        (id) =>
          contactById.get(id) ?? { id, name: "Selected contact", email: "" },
      ),
    [contactIds, contactById],
  );

  const contactResults = useMemo(() => {
    if (!contacts) return [];
    const query = contactQuery.trim().toLowerCase();
    if (!query) return [];
    const selected = new Set(contactIds);
    return contacts
      .filter((contact) => !selected.has(contact.id))
      .filter(
        (contact) =>
          contact.name.toLowerCase().includes(query) ||
          contact.email.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [contacts, contactQuery, contactIds]);

  return (
    <div className="flex flex-col gap-5">
      {/* Delivery: admin-only logistics — how the email is sent and where the
          design starts. Kept visually distinct from the recipient-facing
          fields below so admins don't confuse settings with content. */}
      <div className="rounded-md border border-dashed border-border bg-muted/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <SlidersHorizontal className="size-3.5 text-muted-foreground" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Delivery
          </h2>
          <span className="text-xs text-muted-foreground">
            · setup only you see
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Type
            </span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as EmailSendKind)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="broadcast">Newsletter</option>
              <option value="outreach">Targeted</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Start from
            </span>
            <StartFromPicker
              templates={publishedTemplates}
              selectedTemplateId={selectedTemplateId}
              onSelectBlank={handleSelectBlank}
              onSelectTemplate={handleSelectTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              onRenameTemplate={handleRenameTemplate}
            />
          </label>
        </div>
      </div>

      {/* Message: the fields recipients actually see in their inbox. */}
      <div className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Inbox className="size-3.5 text-muted-foreground" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What recipients see
          </h2>
        </div>
        <div className="flex flex-col gap-4">
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
              placeholder="Short summary shown after the subject in most inboxes"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-md border border-border p-0.5">
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
          <div className="flex flex-wrap items-center gap-2">
            <SaveAsTemplate
              getBuilderJson={getCurrentBuilderJson}
              suggestedName={suggestedTemplateName}
              currentTemplate={
                selectedTemplate
                  ? { id: selectedTemplate.id, name: selectedTemplate.name }
                  : null
              }
              onSavedNew={handleSavedAsTemplate}
              onUpdated={handleUpdatedTemplate}
              disabled={isLoadingSelectedTemplate}
            />
            <EmailLayoutControls value={layout} onChange={setLayout} />
          </div>
        </div>

        {/* Editor stays mounted (hidden) so edits and cursor survive toggling. */}
        <div className={view === "design" ? "" : "hidden"}>
          <EmailDesigner
            ref={designerRef}
            sourceDocument={document}
            onDocumentChange={setDocument}
            layout={layout}
          />
        </div>
        {view === "preview" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-foreground">
              <span className="text-muted-foreground">Subject: </span>
              {previewSubject || subject}
            </p>
            <EmailPreview
              html={previewHtml}
              isLoading={isRenderingPreview}
              error={previewError}
              onRefresh={renderPreview}
            />
            <p className="text-xs text-muted-foreground">
              Variables show sample values; each recipient sees their own. Every
              email appends an unsubscribe footer when sent.
            </p>
          </div>
        )}
      </div>
      {activeTemplateLoadError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          This template could not be loaded. Select another template or open it
          in Templates to repair it.
        </p>
      )}

      <div className="rounded-md border border-border bg-card p-4">
        {kind === "outreach" && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Audience</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pick from any source — duplicates and excluded people are removed
                automatically.
              </p>
            </div>

            {/* Source selector: one panel at a time, with per-source counts. */}
            <div className="flex gap-1 rounded-lg border border-border bg-muted/50 p-1">
              {audienceSources.map(({ key, label, icon: Icon, count }) => {
                const active = activeAudienceSource === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveAudienceSource(key)}
                    aria-pressed={active}
                    className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md px-2 py-2 text-xs font-medium transition-colors sm:text-sm ${
                      active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="hidden sm:inline">{label}</span>
                    {count > 0 && (
                      <span className="inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active source panel */}
            <div className="min-h-[148px] rounded-md border border-border bg-background/40 p-3">
              {activeAudienceSource === "lists" && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Reusable saved lists
                    </p>
                    {contactIds.length + selectedManualRecipientIds.length > 0 &&
                      (isListSaveOpen ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={newListName}
                            onChange={(event) =>
                              setNewListName(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter")
                                handleSaveSelectionAsList();
                              if (event.key === "Escape")
                                setIsListSaveOpen(false);
                            }}
                            placeholder="New list name"
                            className="h-8 rounded-md border border-border bg-background px-3 text-xs"
                          />
                          <button
                            type="button"
                            onClick={handleSaveSelectionAsList}
                            disabled={isSavingList || !newListName.trim()}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                          >
                            {isSavingList ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsListSaveOpen(false)}
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsListSaveOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Save selection as a list
                        </button>
                      ))}
                  </div>
                  {listsError ? (
                    <p className="text-sm text-destructive">
                      Couldn&apos;t load lists.{" "}
                      <button
                        type="button"
                        onClick={loadRecipientSources}
                        className="font-medium underline underline-offset-2"
                      >
                        Retry
                      </button>
                    </p>
                  ) : lists === null ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Loading lists...
                    </p>
                  ) : lists.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No saved lists yet. Pick people under Contacts, then save
                      them as a list to reuse.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {lists.map((list) => {
                        const checked = selectedListIds.includes(list.id);
                        return (
                          <button
                            key={list.id}
                            type="button"
                            onClick={() => toggleList(list.id)}
                            aria-pressed={checked}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              checked
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-background text-foreground hover:bg-muted"
                            }`}
                          >
                            <Users className="size-3.5 opacity-70" />
                            {list.name}
                            <span
                              className={
                                checked
                                  ? "text-primary/70"
                                  : "text-muted-foreground"
                              }
                            >
                              {list.memberCount}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeAudienceSource === "segments" && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Tag rules, re-evaluated at send
                  </p>
                  {segmentsError ? (
                    <p className="text-sm text-destructive">
                      Couldn&apos;t load segments.{" "}
                      <button
                        type="button"
                        onClick={loadRecipientSources}
                        className="font-medium underline underline-offset-2"
                      >
                        Retry
                      </button>
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(segments ?? []).map((segment) => {
                        const checked = selectedSegmentIds.includes(segment.id);
                        return (
                          <button
                            key={segment.id}
                            type="button"
                            onClick={() => toggleSegment(segment.id)}
                            aria-pressed={checked}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              checked
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-background text-foreground hover:bg-muted"
                            }`}
                          >
                            <Filter className="size-3.5 opacity-70" />
                            {segment.name}
                            <span
                              className={
                                checked
                                  ? "text-primary/70"
                                  : "text-muted-foreground"
                              }
                            >
                              ~{segment.matchCount}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeAudienceSource === "contacts" && (
                <div className="flex flex-col gap-3">
                  {contactsError ? (
                    <p className="text-sm text-destructive">
                      Couldn&apos;t load contacts.{" "}
                      <button
                        type="button"
                        onClick={loadRecipientSources}
                        className="font-medium underline underline-offset-2"
                      >
                        Retry
                      </button>
                    </p>
                  ) : (
                    <>
                      <div className="relative max-w-md">
                        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
                          <Search className="size-4 shrink-0 text-muted-foreground" />
                          <input
                            value={contactQuery}
                            onChange={(event) =>
                              setContactQuery(event.target.value)
                            }
                            placeholder="Search contacts by name or email..."
                            className="h-9 flex-1 bg-transparent text-sm outline-none"
                          />
                        </div>
                        {contactQuery.trim() && (
                          <div className="absolute z-10 mt-1 max-h-[220px] w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
                            {contacts === null ? (
                              <p className="px-3 py-2 text-sm text-muted-foreground">
                                Loading contacts...
                              </p>
                            ) : contactResults.length === 0 ? (
                              <p className="px-3 py-2 text-sm text-muted-foreground">
                                No matching contacts.
                              </p>
                            ) : (
                              contactResults.map((contact) => (
                                <button
                                  key={contact.id}
                                  type="button"
                                  onClick={() => addContact(contact.id)}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate font-medium text-foreground">
                                      {contact.name}
                                    </span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                      {contact.email}
                                    </span>
                                  </span>
                                  <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      {selectedContacts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Search above to add specific people.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedContacts.map((contact) => (
                            <span
                              key={contact.id}
                              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-1 pl-3 pr-1.5 text-xs font-medium text-foreground"
                            >
                              {contact.name}
                              <button
                                type="button"
                                aria-label={`Remove ${contact.name}`}
                                onClick={() => removeContact(contact.id)}
                                className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeAudienceSource === "saved" && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      One-off addresses that aren&apos;t contacts
                    </p>
                    {!isAddRecipientOpen && (
                      <button
                        type="button"
                        onClick={() => setIsAddRecipientOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add new
                      </button>
                    )}
                  </div>

                  {isAddRecipientOpen && (
                    <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                          Name
                        </span>
                        <input
                          autoFocus
                          value={manualRecipientName}
                          onChange={(event) =>
                            setManualRecipientName(event.target.value)
                          }
                          placeholder="Jane Doe"
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                          Email
                        </span>
                        <input
                          value={manualRecipientEmail}
                          onChange={(event) =>
                            setManualRecipientEmail(event.target.value)
                          }
                          placeholder="jane@example.com"
                          type="email"
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveManualRecipient}
                          disabled={isSavingManualRecipient}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
                        >
                          <Plus className="h-4 w-4" />
                          {isSavingManualRecipient ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsAddRecipientOpen(false)}
                          className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-foreground"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex max-h-[160px] flex-col gap-1 overflow-auto pr-1">
                    {manualRecipients.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {isAddRecipientOpen
                          ? "Add an address above to get started."
                          : "No saved recipients yet — use “Add new” to create one."}
                      </p>
                    ) : (
                      manualRecipients.map((recipient) => {
                        const checked = selectedManualRecipientIds.includes(
                          recipient.id,
                        );
                        return (
                          <label
                            key={recipient.id}
                            className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm ${
                              checked ? "bg-primary/5" : "hover:bg-muted"
                            }`}
                          >
                            <input
                              type="checkbox"
                              value={recipient.id}
                              checked={checked}
                              onChange={() =>
                                toggleManualRecipient(recipient.id)
                              }
                              className="h-4 w-4 rounded border-border"
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-foreground">
                                {recipient.name}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {recipient.email}
                              </span>
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Resolved recipients + Send — the result of the selection, shown last */}
        <div
          className={`grid gap-4 md:grid-cols-[1fr_auto] md:items-center ${
            kind === "outreach" ? "mt-5 border-t border-border pt-5" : ""
          }`}
        >
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Recipients
            </p>
            {kind === "broadcast" ? (
              <>
                <p className="mt-1 text-sm text-foreground">
                  {recipientSummary.headline}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {recipientSummary.detail}
                </p>
              </>
            ) : isOutreachWithoutRecipients ? (
              <p className="mt-1 text-sm text-muted-foreground">
                No one selected yet. Add lists, contacts, or saved recipients
                above to choose who receives this email.
              </p>
            ) : recipientsError ? (
              <p className="mt-1 text-sm text-destructive">{recipientsError}</p>
            ) : recipientDetails ? (
              <RecipientList
                eligible={recipientDetails.eligible}
                skipped={recipientDetails.skipped}
                isLoading={isLoadingRecipients}
              />
            ) : (
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Resolving recipients...
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleSendNow}
            disabled={
              isSending ||
              isLoadingTemplate ||
              isLoadingSelectedTemplate ||
              !isStartingPointReady ||
              isOutreachWithoutRecipients
            }
            className="h-[50px] w-[200px] justify-self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 md:justify-self-end"
          >
            {isSending ? "Sending..." : "Send now"}
          </button>
        </div>
      </div>

      {isBroadcastConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="broadcast-confirm-title"
            className="w-full max-w-md rounded-md border border-border bg-background p-5 shadow-lg"
          >
            <h2
              id="broadcast-confirm-title"
              className="text-base font-medium text-foreground"
            >
              Confirm newsletter
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {BROADCAST_CONFIRMATION_MESSAGE}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsBroadcastConfirmOpen(false)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
                disabled={isSending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBroadcastSend}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                disabled={isSending}
              >
                {isSending ? "Sending..." : "Send newsletter"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isConfirmRecipientsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-recipients-title"
            className="flex max-h-full w-full max-w-md flex-col rounded-md border border-border bg-background shadow-lg"
          >
            <div className="border-b border-border px-5 py-4">
              <h2
                id="confirm-recipients-title"
                className="text-base font-medium text-foreground"
              >
                Send this email?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Double-check who it goes to — this sends as soon as you confirm.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
              {recipientDetails ? (
                <RecipientList
                  eligible={recipientDetails.eligible}
                  skipped={recipientDetails.skipped}
                  isLoading={isLoadingRecipients}
                />
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Resolving recipients...
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => setIsConfirmRecipientsOpen(false)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
                disabled={isSending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRecipientsSend}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                disabled={isSending || confirmEligibleCount === 0}
              >
                {isSending
                  ? "Sending..."
                  : confirmEligibleCount === 0
                    ? "No one to send to"
                    : `Send to ${confirmEligibleCount} ${
                        confirmEligibleCount === 1 ? "person" : "people"
                      }`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
