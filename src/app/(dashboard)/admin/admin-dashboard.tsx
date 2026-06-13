"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { isLocalAdminAiEnabled } from "./admin-ai/visibility";
import { ContactsPanel } from "./contacts/contacts-panel";
import type { AdminContactsInitialData } from "@/lib/data/admin-contact-list";

const showLocalAdminAi = isLocalAdminAiEnabled();

const TagsPanel = dynamic(
  () => import("./tags/tags-panel").then((module) => module.TagsPanel),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading tags...
      </div>
    ),
  },
);

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

const AdminAiDashboardPanel = showLocalAdminAi
  ? dynamic(
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
    )
  : null;

type Tab = "contacts" | "tags" | "tasks" | "email";

type AdminTab = Tab | "ai";

const TABS: { key: AdminTab; label: string }[] = [
  { key: "contacts", label: "Contacts" },
  ...(showLocalAdminAi
    ? ([{ key: "ai", label: "AI Agent" }] satisfies {
        key: AdminTab;
        label: string;
      }[])
    : []),
  { key: "tags", label: "Tags" },
  { key: "tasks", label: "Tasks" },
  { key: "email", label: "Email" },
];

export function AdminDashboard({
  initialContactsData,
}: {
  initialContactsData?: AdminContactsInitialData;
}) {
  const [activeTab, setActiveTab] = useState<AdminTab>("contacts");
  const [hasVisitedAi, setHasVisitedAi] = useState(false);
  const [hasVisitedEmail, setHasVisitedEmail] = useState(false);
  const [hasVisitedTasks, setHasVisitedTasks] = useState(false);
  const [emailContactIds, setEmailContactIds] = useState<string[]>([]);

  function handleSendEmail(contactIds: string[]) {
    setEmailContactIds(contactIds);
    setHasVisitedEmail(true);
    setActiveTab("email");
  }

  function handleSelectTab(tab: AdminTab) {
    if (tab === "ai") {
      setHasVisitedAi(true);
    }
    if (tab === "tasks") {
      setHasVisitedTasks(true);
    }
    if (tab === "email") {
      if (activeTab !== "email") {
        setEmailContactIds([]);
      }
      setHasVisitedEmail(true);
    }
    setActiveTab(tab);
  }

  return (
    <div>
      <nav className="mb-8 flex gap-1 border-b border-border pb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleSelectTab(tab.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "contacts" && (
        <ContactsPanel
          initialData={initialContactsData}
          onSendEmail={handleSendEmail}
        />
      )}

      {activeTab === "tags" && <TagsPanel />}

      {AdminAiDashboardPanel && (activeTab === "ai" || hasVisitedAi) && (
        <div hidden={activeTab !== "ai"}>
          <AdminAiDashboardPanel isVisible={activeTab === "ai"} />
        </div>
      )}

      {(activeTab === "tasks" || hasVisitedTasks) && (
        <div hidden={activeTab !== "tasks"}>
          <TasksPanel />
        </div>
      )}

      {(activeTab === "email" || hasVisitedEmail) && (
        <div hidden={activeTab !== "email"}>
          <EmailStudio
            isVisible={activeTab === "email"}
            selectedContactIds={emailContactIds}
          />
        </div>
      )}
    </div>
  );
}
