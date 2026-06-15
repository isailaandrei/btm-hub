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
import type {
  EmailManualRecipient,
  EmailSend,
  EmailTemplate,
} from "@/types/database";
import {
  loadEmailManualRecipientsAction,
  loadEmailSendsAction,
  loadEmailTemplatesAction,
  type EmailTemplateVersionDocument,
  type EmailTemplateVersionsById,
} from "./actions";
import { getTemplateVersionForEditorAction } from "./templates/actions";

type FetchState = "idle" | "loading" | "done";
type LoadOptions = { quiet?: boolean };

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

      const pendingLoad = (async () => {
        try {
          const data = await loadEmailTemplatesAction();
          mergeTemplateVersions(data.templateVersionsById);
          setEmailTemplates(data.templates);
          setEmailError(null);
          templateFetchStateRef.current = "done";
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to load email data.";
          templateFetchStateRef.current = "idle";
          setEmailError(message);
          if (!options?.quiet) {
            toast.error(message);
          }
        } finally {
          pendingTemplateLoadRef.current = null;
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

      const pendingLoad = (async () => {
        try {
          const data = await loadEmailSendsAction();
          setEmailSends(data.sends);
          setEmailError(null);
          sendsFetchStateRef.current = "done";
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to load sent emails.";
          sendsFetchStateRef.current = "idle";
          setEmailError(message);
          if (!options?.quiet) {
            toast.error(message);
          }
        } finally {
          pendingSendsLoadRef.current = null;
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

      const pendingLoad = (async () => {
        try {
          const data = await loadEmailManualRecipientsAction();
          setManualRecipients(data.manualRecipients);
          setEmailError(null);
          manualRecipientsFetchStateRef.current = "done";
        } catch (error) {
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
    ],
  );

  return (
    <AdminEmailDataContext.Provider value={value}>
      {children}
    </AdminEmailDataContext.Provider>
  );
}
