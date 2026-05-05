"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { AdminAiProviderAvailability } from "@/lib/admin-ai/provider";
import type { AdminAiThreadSummary } from "@/types/admin-ai";
import type { EmailSend, EmailTemplate } from "@/types/database";
import { ContactsPanel } from "./contacts/contacts-panel";
import { TagsPanel } from "./tags/tags-panel";
import { AdminAiPanel } from "./admin-ai/panel";
import { EmailStudio } from "./email/email-studio";

type Tab = "contacts" | "tags" | "email" | "ai";

const TABS: { key: Tab; label: string }[] = [
  { key: "contacts", label: "Contacts" },
  { key: "tags", label: "Tags" },
  { key: "email", label: "Email" },
  { key: "ai", label: "AI Analyst" },
];

export function AdminDashboard({
  initialGlobalThreads,
  adminAiAvailability,
  emailTemplates,
  emailSends,
}: {
  initialGlobalThreads: AdminAiThreadSummary[];
  adminAiAvailability: AdminAiProviderAvailability;
  emailTemplates: EmailTemplate[];
  emailSends: EmailSend[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("contacts");
  const [emailContactIds, setEmailContactIds] = useState<string[]>([]);

  function handleSendEmail(contactIds: string[]) {
    setEmailContactIds(contactIds);
    setActiveTab("email");
  }

  function handleSelectTab(tab: Tab) {
    if (tab === "email" && activeTab !== "email") {
      setEmailContactIds([]);
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
        <ContactsPanel onSendEmail={handleSendEmail} />
      )}

      {activeTab === "tags" && <TagsPanel />}

      {activeTab === "email" && (
        <EmailStudio
          templates={emailTemplates}
          sends={emailSends}
          selectedContactIds={emailContactIds}
        />
      )}

      {activeTab === "ai" && (
        <Card className="mx-auto max-w-7xl">
          <CardHeader>
            <h2 className="text-base font-medium text-foreground">AI Analyst</h2>
            <p className="text-xs text-muted-foreground">
              Each question runs a fresh grounded search. Past questions below
              are a log — they are not used as context.
            </p>
          </CardHeader>
          <CardContent>
            <AdminAiPanel
              scope="global"
              initialThreads={initialGlobalThreads}
              providerAvailability={adminAiAvailability}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
