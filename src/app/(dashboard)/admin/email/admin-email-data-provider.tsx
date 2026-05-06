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
import type { EmailSend, EmailTemplate } from "@/types/database";
import { loadEmailStudioDataAction } from "./actions";

type FetchState = "idle" | "loading" | "done";
type LoadOptions = { quiet?: boolean };

interface AdminEmailDataContextValue {
  templates: EmailTemplate[] | null;
  sends: EmailSend[] | null;
  emailError: string | null;
  ensureEmailStudioData: (options?: LoadOptions) => Promise<void>;
  refreshEmailStudioData: (options?: LoadOptions) => Promise<void>;
  setEmailTemplates: Dispatch<SetStateAction<EmailTemplate[] | null>>;
  setEmailSends: Dispatch<SetStateAction<EmailSend[] | null>>;
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
  const [emailError, setEmailError] = useState<string | null>(null);
  const fetchStateRef = useRef<FetchState>("idle");
  const pendingLoadRef = useRef<Promise<void> | null>(null);

  const loadEmailStudioData = useCallback(
    (options?: LoadOptions & { force?: boolean }) => {
      if (fetchStateRef.current === "loading") {
        return pendingLoadRef.current ?? Promise.resolve();
      }
      if (!options?.force && fetchStateRef.current === "done") {
        return Promise.resolve();
      }

      fetchStateRef.current = "loading";

      const pendingLoad = (async () => {
        try {
          const data = await loadEmailStudioDataAction();
          setEmailTemplates(data.templates);
          setEmailSends(data.sends);
          setEmailError(null);
          fetchStateRef.current = "done";
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to load email data.";
          fetchStateRef.current = "idle";
          setEmailError(message);
          if (!options?.quiet) {
            toast.error(message);
          }
        } finally {
          pendingLoadRef.current = null;
        }
      })();

      pendingLoadRef.current = pendingLoad;
      return pendingLoad;
    },
    [],
  );

  const ensureEmailStudioData = useCallback(
    (options?: LoadOptions) => loadEmailStudioData(options),
    [loadEmailStudioData],
  );

  const refreshEmailStudioData = useCallback(
    (options?: LoadOptions) =>
      loadEmailStudioData({
        ...options,
        force: true,
      }),
    [loadEmailStudioData],
  );

  const value = useMemo(
    () => ({
      templates,
      sends,
      emailError,
      ensureEmailStudioData,
      refreshEmailStudioData,
      setEmailTemplates,
      setEmailSends,
    }),
    [
      templates,
      sends,
      emailError,
      ensureEmailStudioData,
      refreshEmailStudioData,
      setEmailTemplates,
      setEmailSends,
    ],
  );

  return (
    <AdminEmailDataContext.Provider value={value}>
      {children}
    </AdminEmailDataContext.Provider>
  );
}
