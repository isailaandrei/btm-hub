"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { logAdminTiming, startAdminTiming } from "@/lib/admin/timing";
import type {
  EmailManualRecipient,
  EmailSend,
  EmailTemplate,
  Tag,
  TagCategory,
} from "@/types/database";
import type { EmailListSummary } from "@/lib/data/email-lists";
import type { EmailSegmentSummary } from "@/lib/data/email-segments";
import type { EmailExclusionRow } from "@/lib/data/email-suppressions";
import {
  loadAudienceContactsAction,
  loadAudienceTagsAction,
  loadEmailExclusionsAction,
  loadEmailListsAction,
  loadEmailManualRecipientsAction,
  loadEmailSegmentsAction,
  loadEmailSendsAction,
  loadEmailTemplatesAction,
  type EmailTemplateVersionDocument,
  type EmailTemplateVersionsById,
} from "./actions";
import { getTemplateVersionForEditorAction } from "./templates/actions";

type FetchState = "idle" | "loading" | "done";
type LoadOptions = { quiet?: boolean };

/** Tag picker data for the segment editor (loaded together, cached as one). */
export type AudienceTags = { categories: TagCategory[]; tags: Tag[] };
/** Lightweight contact shape for the "add people" / "exclude" pickers. */
export type AudienceContact = { id: string; name: string; email: string };

/**
 * The load-once-and-cache machinery that templates / sends / manualRecipients
 * each hand-roll below, factored into one hook so every audience resource gets
 * the exact same behaviour:
 *  - `ensure` fetches on the first call and is a no-op once loaded — so it
 *    survives a component unmount/remount *and* admin navigation, because the
 *    provider is mounted in admin/layout.tsx and never unmounts;
 *  - `refresh` forces a refetch (e.g. after a mutation);
 *  - concurrent callers share the single in-flight promise (the "loading" ref).
 * Each resource keeps its own `error` so a failure in one section never wipes
 * another's data.
 */
function useEnsuredResource<T>(
  loader: () => Promise<T>,
  fallbackMessage: string,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchStateRef = useRef<FetchState>("idle");
  const pendingRef = useRef<Promise<void> | null>(null);

  const load = useCallback(
    (options?: LoadOptions & { force?: boolean }) => {
      if (fetchStateRef.current === "loading") {
        return pendingRef.current ?? Promise.resolve();
      }
      if (!options?.force && fetchStateRef.current === "done") {
        return Promise.resolve();
      }

      fetchStateRef.current = "loading";
      const pendingLoad = (async () => {
        try {
          const result = await loader();
          setData(result);
          setError(null);
          fetchStateRef.current = "done";
        } catch (caught) {
          fetchStateRef.current = "idle";
          const message =
            caught instanceof Error ? caught.message : fallbackMessage;
          setError(message);
          if (!options?.quiet) toast.error(message);
        } finally {
          pendingRef.current = null;
        }
      })();

      pendingRef.current = pendingLoad;
      return pendingLoad;
    },
    [loader, fallbackMessage],
  );

  const ensure = useCallback((options?: LoadOptions) => load(options), [load]);
  const refresh = useCallback(
    (options?: LoadOptions) => load({ ...options, force: true }),
    [load],
  );

  return { data, setData, error, ensure, refresh } as const;
}

interface AdminEmailDataContextValue {
  templates: EmailTemplate[] | null;
  sends: EmailSend[] | null;
  manualRecipients: EmailManualRecipient[] | null;
  templateVersionsById: EmailTemplateVersionsById;
  emailError: string | null;
  ensureEmailTemplates: (options?: LoadOptions) => Promise<void>;
  refreshEmailTemplates: (options?: LoadOptions) => Promise<void>;
  ensureEmailSends: (options?: LoadOptions) => Promise<void>;
  refreshEmailSends: (options?: LoadOptions) => Promise<void>;
  ensureManualRecipients: (options?: LoadOptions) => Promise<void>;
  refreshManualRecipients: (options?: LoadOptions) => Promise<void>;
  ensureTemplateVersion: (
    versionId: string,
    options?: LoadOptions,
  ) => Promise<EmailTemplateVersionDocument | null>;
  setEmailTemplates: Dispatch<SetStateAction<EmailTemplate[] | null>>;
  setEmailSends: Dispatch<SetStateAction<EmailSend[] | null>>;
  setManualRecipients: Dispatch<
    SetStateAction<EmailManualRecipient[] | null>
  >;
  // Audiences — same load-once cache as the resources above.
  lists: EmailListSummary[] | null;
  listsError: string | null;
  ensureLists: (options?: LoadOptions) => Promise<void>;
  refreshLists: (options?: LoadOptions) => Promise<void>;
  setLists: Dispatch<SetStateAction<EmailListSummary[] | null>>;
  segments: EmailSegmentSummary[] | null;
  segmentsError: string | null;
  ensureSegments: (options?: LoadOptions) => Promise<void>;
  refreshSegments: (options?: LoadOptions) => Promise<void>;
  setSegments: Dispatch<SetStateAction<EmailSegmentSummary[] | null>>;
  audienceTags: AudienceTags | null;
  audienceTagsError: string | null;
  ensureAudienceTags: (options?: LoadOptions) => Promise<void>;
  refreshAudienceTags: (options?: LoadOptions) => Promise<void>;
  exclusions: EmailExclusionRow[] | null;
  exclusionsError: string | null;
  ensureExclusions: (options?: LoadOptions) => Promise<void>;
  refreshExclusions: (options?: LoadOptions) => Promise<void>;
  setExclusions: Dispatch<SetStateAction<EmailExclusionRow[] | null>>;
  audienceContacts: AudienceContact[] | null;
  audienceContactsError: string | null;
  ensureAudienceContacts: (options?: LoadOptions) => Promise<void>;
  refreshAudienceContacts: (options?: LoadOptions) => Promise<void>;
}

const AdminEmailDataContext =
  createContext<AdminEmailDataContextValue | null>(null);

export function useAdminEmailData() {
  const ctx = useContext(AdminEmailDataContext);
  if (!ctx) {
    throw new Error(
      "useAdminEmailData must be used within AdminEmailDataProvider",
    );
  }
  return ctx;
}

export function AdminEmailDataProvider({ children }: { children: ReactNode }) {
  const [templates, setEmailTemplates] = useState<EmailTemplate[] | null>(null);
  const [sends, setEmailSends] = useState<EmailSend[] | null>(null);
  const [manualRecipients, setManualRecipients] = useState<
    EmailManualRecipient[] | null
  >(null);
  const [templateVersionsById, setTemplateVersionsById] =
    useState<EmailTemplateVersionsById>({});
  const [emailError, setEmailError] = useState<string | null>(null);
  const templateFetchStateRef = useRef<FetchState>("idle");
  const sendsFetchStateRef = useRef<FetchState>("idle");
  const manualRecipientsFetchStateRef = useRef<FetchState>("idle");
  const pendingTemplateLoadRef = useRef<Promise<void> | null>(null);
  const pendingSendsLoadRef = useRef<Promise<void> | null>(null);
  const pendingManualRecipientsLoadRef = useRef<Promise<void> | null>(null);
  const templateVersionsByIdRef = useRef<EmailTemplateVersionsById>({});
  const pendingTemplateVersionLoadsRef = useRef<
    Map<string, Promise<EmailTemplateVersionDocument | null>>
  >(new Map());

  const mergeTemplateVersions = useCallback(
    (nextVersions: EmailTemplateVersionsById) => {
      if (Object.keys(nextVersions).length === 0) return;
      const merged = {
        ...templateVersionsByIdRef.current,
        ...nextVersions,
      };
      templateVersionsByIdRef.current = merged;
      setTemplateVersionsById(merged);
    },
    [],
  );

  const loadEmailTemplates = useCallback(
    (options?: LoadOptions & { force?: boolean }) => {
      if (templateFetchStateRef.current === "loading") {
        return pendingTemplateLoadRef.current ?? Promise.resolve();
      }
      if (!options?.force && templateFetchStateRef.current === "done") {
        return Promise.resolve();
      }

      templateFetchStateRef.current = "loading";
      const startedAt = startAdminTiming();
      let status = "ok";
      let templatesCount = 0;

      const pendingLoad = (async () => {
        try {
          const data = await loadEmailTemplatesAction();
          templatesCount = data.templates.length;
          mergeTemplateVersions(data.templateVersionsById);
          setEmailTemplates(data.templates);
          setEmailError(null);
          templateFetchStateRef.current = "done";
        } catch (error) {
          status = "error";
          const message =
            error instanceof Error ? error.message : "Failed to load email data.";
          templateFetchStateRef.current = "idle";
          setEmailError(message);
          if (!options?.quiet) {
            toast.error(message);
          }
        } finally {
          pendingTemplateLoadRef.current = null;
          logAdminTiming("admin.email.templates.client", startedAt, {
            status,
            templates: templatesCount,
          });
        }
      })();

      pendingTemplateLoadRef.current = pendingLoad;
      return pendingLoad;
    },
    [mergeTemplateVersions],
  );

  const ensureEmailTemplates = useCallback(
    (options?: LoadOptions) => loadEmailTemplates(options),
    [loadEmailTemplates],
  );

  const refreshEmailTemplates = useCallback(
    (options?: LoadOptions) =>
      loadEmailTemplates({
        ...options,
        force: true,
      }),
    [loadEmailTemplates],
  );

  const loadEmailSends = useCallback(
    (options?: LoadOptions & { force?: boolean }) => {
      if (sendsFetchStateRef.current === "loading") {
        return pendingSendsLoadRef.current ?? Promise.resolve();
      }
      if (!options?.force && sendsFetchStateRef.current === "done") {
        return Promise.resolve();
      }

      sendsFetchStateRef.current = "loading";
      const startedAt = startAdminTiming();
      let sendsCount = 0;
      let status = "ok";

      const pendingLoad = (async () => {
        try {
          const data = await loadEmailSendsAction();
          sendsCount = data.sends.length;
          setEmailSends(data.sends);
          setEmailError(null);
          sendsFetchStateRef.current = "done";
        } catch (error) {
          status = "error";
          const message =
            error instanceof Error ? error.message : "Failed to load sent emails.";
          sendsFetchStateRef.current = "idle";
          setEmailError(message);
          if (!options?.quiet) {
            toast.error(message);
          }
        } finally {
          pendingSendsLoadRef.current = null;
          logAdminTiming("admin.email.sends.client", startedAt, {
            sends: sendsCount,
            status,
          });
        }
      })();

      pendingSendsLoadRef.current = pendingLoad;
      return pendingLoad;
    },
    [],
  );

  const ensureEmailSends = useCallback(
    (options?: LoadOptions) => loadEmailSends(options),
    [loadEmailSends],
  );

  const refreshEmailSends = useCallback(
    (options?: LoadOptions) =>
      loadEmailSends({
        ...options,
        force: true,
      }),
    [loadEmailSends],
  );

  const loadManualRecipients = useCallback(
    (options?: LoadOptions & { force?: boolean }) => {
      if (manualRecipientsFetchStateRef.current === "loading") {
        return pendingManualRecipientsLoadRef.current ?? Promise.resolve();
      }
      if (!options?.force && manualRecipientsFetchStateRef.current === "done") {
        return Promise.resolve();
      }

      manualRecipientsFetchStateRef.current = "loading";
      const startedAt = startAdminTiming();
      let manualRecipientsCount = 0;
      let status = "ok";

      const pendingLoad = (async () => {
        try {
          const data = await loadEmailManualRecipientsAction();
          manualRecipientsCount = data.manualRecipients.length;
          setManualRecipients(data.manualRecipients);
          setEmailError(null);
          manualRecipientsFetchStateRef.current = "done";
        } catch (error) {
          status = "error";
          const message =
            error instanceof Error
              ? error.message
              : "Failed to load saved recipients.";
          manualRecipientsFetchStateRef.current = "idle";
          setEmailError(message);
          if (!options?.quiet) {
            toast.error(message);
          }
        } finally {
          pendingManualRecipientsLoadRef.current = null;
          logAdminTiming("admin.email.manual-recipients.client", startedAt, {
            manualRecipients: manualRecipientsCount,
            status,
          });
        }
      })();

      pendingManualRecipientsLoadRef.current = pendingLoad;
      return pendingLoad;
    },
    [],
  );

  const ensureManualRecipients = useCallback(
    (options?: LoadOptions) => loadManualRecipients(options),
    [loadManualRecipients],
  );

  const refreshManualRecipients = useCallback(
    (options?: LoadOptions) =>
      loadManualRecipients({
        ...options,
        force: true,
      }),
    [loadManualRecipients],
  );

  // Audience resources. Each loader is stable (no deps) so the resulting
  // ensure/refresh handlers are stable too — safe to use in section effects.
  const loadLists = useCallback(
    async () => (await loadEmailListsAction()).lists,
    [],
  );
  const listsResource = useEnsuredResource<EmailListSummary[]>(
    loadLists,
    "Failed to load lists.",
  );

  const loadSegments = useCallback(
    async () => (await loadEmailSegmentsAction()).segments,
    [],
  );
  const segmentsResource = useEnsuredResource<EmailSegmentSummary[]>(
    loadSegments,
    "Failed to load segments.",
  );

  const loadAudienceTags = useCallback(async () => {
    const { categories, tags } = await loadAudienceTagsAction();
    return { categories, tags };
  }, []);
  const audienceTagsResource = useEnsuredResource<AudienceTags>(
    loadAudienceTags,
    "Failed to load tags.",
  );

  const loadExclusions = useCallback(
    async () => (await loadEmailExclusionsAction()).exclusions,
    [],
  );
  const exclusionsResource = useEnsuredResource<EmailExclusionRow[]>(
    loadExclusions,
    "Failed to load exclusions.",
  );

  const loadAudienceContacts = useCallback(
    async () => (await loadAudienceContactsAction()).contacts,
    [],
  );
  const audienceContactsResource = useEnsuredResource<AudienceContact[]>(
    loadAudienceContacts,
    "Failed to load contacts.",
  );

  const ensureTemplateVersion = useCallback(
    (versionId: string, options?: LoadOptions) => {
      const cached = templateVersionsByIdRef.current[versionId];
      if (cached) return Promise.resolve(cached);

      const pending = pendingTemplateVersionLoadsRef.current.get(versionId);
      if (pending) return pending;

      const pendingLoad = (async () => {
        try {
          const version = await getTemplateVersionForEditorAction(versionId);
          if (version) {
            mergeTemplateVersions({ [versionId]: version });
          }
          setEmailError(null);
          return version;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to load template.";
          setEmailError(message);
          if (!options?.quiet) {
            toast.error(message);
          }
          throw error;
        } finally {
          pendingTemplateVersionLoadsRef.current.delete(versionId);
        }
      })();

      pendingTemplateVersionLoadsRef.current.set(versionId, pendingLoad);
      return pendingLoad;
    },
    [mergeTemplateVersions],
  );

  const value = useMemo(
    () => ({
      templates,
      sends,
      manualRecipients,
      templateVersionsById,
      emailError,
      ensureEmailTemplates,
      refreshEmailTemplates,
      ensureEmailSends,
      refreshEmailSends,
      ensureManualRecipients,
      refreshManualRecipients,
      ensureTemplateVersion,
      setEmailTemplates,
      setEmailSends,
      setManualRecipients,
      lists: listsResource.data,
      listsError: listsResource.error,
      ensureLists: listsResource.ensure,
      refreshLists: listsResource.refresh,
      setLists: listsResource.setData,
      segments: segmentsResource.data,
      segmentsError: segmentsResource.error,
      ensureSegments: segmentsResource.ensure,
      refreshSegments: segmentsResource.refresh,
      setSegments: segmentsResource.setData,
      audienceTags: audienceTagsResource.data,
      audienceTagsError: audienceTagsResource.error,
      ensureAudienceTags: audienceTagsResource.ensure,
      refreshAudienceTags: audienceTagsResource.refresh,
      exclusions: exclusionsResource.data,
      exclusionsError: exclusionsResource.error,
      ensureExclusions: exclusionsResource.ensure,
      refreshExclusions: exclusionsResource.refresh,
      setExclusions: exclusionsResource.setData,
      audienceContacts: audienceContactsResource.data,
      audienceContactsError: audienceContactsResource.error,
      ensureAudienceContacts: audienceContactsResource.ensure,
      refreshAudienceContacts: audienceContactsResource.refresh,
    }),
    [
      templates,
      sends,
      manualRecipients,
      templateVersionsById,
      emailError,
      ensureEmailTemplates,
      refreshEmailTemplates,
      ensureEmailSends,
      refreshEmailSends,
      ensureManualRecipients,
      refreshManualRecipients,
      ensureTemplateVersion,
      setEmailTemplates,
      setEmailSends,
      setManualRecipients,
      listsResource.data,
      listsResource.error,
      listsResource.ensure,
      listsResource.refresh,
      listsResource.setData,
      segmentsResource.data,
      segmentsResource.error,
      segmentsResource.ensure,
      segmentsResource.refresh,
      segmentsResource.setData,
      audienceTagsResource.data,
      audienceTagsResource.error,
      audienceTagsResource.ensure,
      audienceTagsResource.refresh,
      exclusionsResource.data,
      exclusionsResource.error,
      exclusionsResource.ensure,
      exclusionsResource.refresh,
      exclusionsResource.setData,
      audienceContactsResource.data,
      audienceContactsResource.error,
      audienceContactsResource.ensure,
      audienceContactsResource.refresh,
    ],
  );

  return (
    <AdminEmailDataContext.Provider value={value}>
      {children}
    </AdminEmailDataContext.Provider>
  );
}
