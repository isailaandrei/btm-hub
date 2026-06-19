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
import { Eye, Loader2, Pencil, Plus, Search, X } from "lucide-react";
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
import { deleteTemplateAction } from "../templates/actions";
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
  const [lists, setLists] = useState<EmailListSummary[] | null>(null);
  const [listsError, setListsError] = useState<string | null>(null);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [segments, setSegments] = useState<EmailSegmentSummary[] | null>(null);
  const [segmentsError, setSegmentsError] = useState<string | null>(null);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
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

  function renderPreview() {
    const builderJson =
      designerRef.current?.getSnapshot().builderJson ??
      applyLayoutToDocument(document, layout);
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
        const snapshot = designerRef.current?.getSnapshot();
        await sendEmailNowAction({
          kind,
          subject,
          builderJson: snapshot?.builderJson ?? document,
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
    startSendNow();
  }

  function handleConfirmBroadcastSend() {
    setIsBroadcastConfirmOpen(false);
    startSendNow();
  }

  const recipientSummary = getRecipientSummary({
    kind,
    selectedContactCount: contactIds.length,
    selectedManualRecipientCount,
  });

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
      <div className="grid gap-4 rounded-md border border-border bg-card p-4 md:grid-cols-2">
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
              Preview
            </span>
            <input
              value={previewText}
              onChange={(event) => setPreviewText(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Type
            </span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as EmailSendKind)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="broadcast">Broadcast</option>
              <option value="outreach">Outreach</option>
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
          <EmailLayoutControls value={layout} onChange={setLayout} />
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
              Variables show sample values; each recipient sees their own.
              {kind === "broadcast"
                ? " Broadcasts also append an unsubscribe footer when sent."
                : ""}
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
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-sm font-medium text-foreground">
                Build your audience
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Combine any of these — duplicates and excluded people are removed
                automatically.
              </p>
            </div>

            {/* Lists */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">Lists</p>
                {contactIds.length + selectedManualRecipientIds.length > 0 &&
                  (isListSaveOpen ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={newListName}
                        onChange={(event) => setNewListName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") handleSaveSelectionAsList();
                          if (event.key === "Escape") setIsListSaveOpen(false);
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
                <p className="text-sm text-muted-foreground">Loading lists...</p>
              ) : lists.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No saved lists yet. Pick people below and save them as a list to
                  reuse.
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
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                          checked
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        {list.name}
                        <span
                          className={
                            checked ? "text-primary/70" : "text-muted-foreground"
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

            {/* Segments */}
            {(segmentsError || (segments && segments.length > 0)) && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Segments
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
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                            checked
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-foreground hover:bg-muted"
                          }`}
                        >
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

            {/* Individual contacts */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Contacts
              </p>
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
                    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5">
                      <Search className="size-3.5 shrink-0 text-muted-foreground" />
                      <input
                        value={contactQuery}
                        onChange={(event) => setContactQuery(event.target.value)}
                        placeholder="Search contacts by name or email..."
                        className="h-9 flex-1 bg-transparent text-sm outline-none"
                      />
                    </div>
                    {contactQuery.trim() && (
                      <div className="absolute z-10 mt-1 max-h-[220px] w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
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
                              className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                              <span className="truncate font-medium text-foreground">
                                {contact.name}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {contact.email}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {selectedContacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No individual contacts added.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedContacts.map((contact) => (
                        <span
                          key={contact.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-1 pl-3 pr-1.5 text-xs font-medium text-foreground"
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

            {/* Saved one-off recipients (not contacts) */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  Saved recipients
                </p>
                <p className="mb-2 mt-0.5 text-xs text-muted-foreground/80">
                  One-off email addresses that aren&apos;t contacts.
                </p>
                <div className="flex max-h-[180px] flex-col gap-2 overflow-auto pr-1">
                  {manualRecipients.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      None saved yet. Add one on the right.
                    </p>
                  ) : (
                    manualRecipients.map((recipient) => (
                      <label
                        key={recipient.id}
                        className="flex min-h-10 items-center gap-3 text-sm text-foreground"
                      >
                        <input
                          type="checkbox"
                          value={recipient.id}
                          checked={selectedManualRecipientIds.includes(
                            recipient.id,
                          )}
                          onChange={() => toggleManualRecipient(recipient.id)}
                          className="h-4 w-4 rounded border-border"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {recipient.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {recipient.email}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="grid gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">
                    Recipient name
                  </span>
                  <input
                    value={manualRecipientName}
                    onChange={(event) =>
                      setManualRecipientName(event.target.value)
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">
                    Recipient email
                  </span>
                  <input
                    value={manualRecipientEmail}
                    onChange={(event) =>
                      setManualRecipientEmail(event.target.value)
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    type="email"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleSaveManualRecipient}
                  disabled={isSavingManualRecipient}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {isSavingManualRecipient ? "Saving..." : "Save recipient"}
                </button>
              </div>
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
              Confirm broadcast
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
                {isSending ? "Sending..." : "Send broadcast"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
