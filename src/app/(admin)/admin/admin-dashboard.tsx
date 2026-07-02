"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ContactsPanelSkeleton } from "./contacts/contacts-panel-skeleton";
import { DeferredContactsPanel } from "./contacts/deferred-contacts-panel";
import { TagsPanel } from "./tags/tags-panel";
import {
  getAdminPanelHref,
  resolveAdminPanelTab,
  type AdminPanelTab,
} from "./admin-navigation";
import { isLocalAdminAiEnabled } from "./admin-ai/visibility";
import type { AdminContactsInitialData } from "@/lib/data/admin-contact-list";

const EmailStudio = dynamic(
  () => import("./email/email-studio").then((module) => module.EmailStudio),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading email studio...
      </div>
    ),
  },
);

const TasksPanel = dynamic(
  () => import("./tasks/tasks-panel").then((module) => module.TasksPanel),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading tasks...
      </div>
    ),
  },
);

const AdminAiDashboardPanel = dynamic(
  () =>
    import("./admin-ai/dashboard-panel").then(
      (module) => module.AdminAiDashboardPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading AI agent...
      </div>
    ),
  },
);

type VisitedTabs = Partial<Record<AdminPanelTab, true>>;
type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const IDLE_PREWARM_TABS: AdminPanelTab[] = ["email", "tasks", "tags"];

export function AdminDashboard({
  initialContactsData,
}: {
  initialContactsData?: Promise<AdminContactsInitialData>;
}) {
  const searchParams = useSearchParams();
  const aiEnabled = isLocalAdminAiEnabled();
  const { tab: activeTab, invalidValue } = resolveAdminPanelTab(
    searchParams.get("tab"),
    { aiEnabled },
  );
  const [visitedTabs, setVisitedTabs] = useState<VisitedTabs>(() => ({
    [activeTab]: true,
  }));
  const [emailContactIds, setEmailContactIds] = useState<string[]>([]);
  const previousActiveTabRef = useRef<AdminPanelTab>(activeTab);
  const prewarmedTabsRef = useRef(false);
  const warnedInvalidTabsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (visitedTabs[activeTab]) return;

    let canceled = false;
    queueMicrotask(() => {
      if (canceled) return;
      setVisitedTabs((current) =>
        current[activeTab] ? current : { ...current, [activeTab]: true },
      );
    });

    return () => {
      canceled = true;
    };
  }, [activeTab, visitedTabs]);

  useEffect(() => {
    const previousTab = previousActiveTabRef.current;
    previousActiveTabRef.current = activeTab;

    if (
      previousTab !== "email" ||
      activeTab === "email" ||
      emailContactIds.length === 0
    ) {
      return;
    }

    let canceled = false;
    queueMicrotask(() => {
      if (!canceled) {
        setEmailContactIds([]);
      }
    });

    return () => {
      canceled = true;
    };
  }, [activeTab, emailContactIds.length]);

  useEffect(() => {
    if (!invalidValue || warnedInvalidTabsRef.current.has(invalidValue)) return;
    warnedInvalidTabsRef.current.add(invalidValue);
    console.warn(`Invalid admin dashboard tab: ${invalidValue}`);
  }, [invalidValue]);

  useEffect(() => {
    if (prewarmedTabsRef.current) return;
    prewarmedTabsRef.current = true;

    let canceled = false;
    let timeoutId: number | null = null;
    let idleId: number | null = null;
    const idleWindow = window as WindowWithIdleCallback;

    function prewarmTabs() {
      if (canceled) return;
      setVisitedTabs((current) => {
        const next = { ...current };
        let changed = false;
        for (const tab of IDLE_PREWARM_TABS) {
          if (!next[tab]) {
            next[tab] = true;
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }

    if (typeof idleWindow.requestIdleCallback === "function") {
      idleId = idleWindow.requestIdleCallback(prewarmTabs, { timeout: 5000 });
    } else {
      timeoutId = window.setTimeout(prewarmTabs, 2500);
    }

    return () => {
      canceled = true;
      if (idleId !== null && typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  function handleSendEmail(contactIds: string[]) {
    setEmailContactIds(contactIds);
    window.history.pushState(null, "", getAdminPanelHref("email"));
  }

  return (
    <div>
      {(activeTab === "contacts" || visitedTabs.contacts) && (
        <div hidden={activeTab !== "contacts"}>
          <Suspense fallback={<ContactsPanelSkeleton />}>
            <DeferredContactsPanel
              initialContactsData={initialContactsData}
              onSendEmail={handleSendEmail}
            />
          </Suspense>
        </div>
      )}

      {(activeTab === "tags" || visitedTabs.tags) && (
        <div hidden={activeTab !== "tags"}>
          <TagsPanel />
        </div>
      )}

      {(activeTab === "tasks" || visitedTabs.tasks) && (
        <div hidden={activeTab !== "tasks"}>
          <TasksPanel isVisible={activeTab === "tasks"} />
        </div>
      )}

      {(activeTab === "email" || visitedTabs.email) && (
        <div hidden={activeTab !== "email"}>
          <EmailStudio
            isVisible={activeTab === "email"}
            selectedContactIds={emailContactIds}
          />
        </div>
      )}

      {aiEnabled && (activeTab === "ai" || visitedTabs.ai) && (
        <div hidden={activeTab !== "ai"}>
          <AdminAiDashboardPanel isVisible={activeTab === "ai"} />
        </div>
      )}
    </div>
  );
}
