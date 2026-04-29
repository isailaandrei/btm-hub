"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { AdminAiProviderAvailability } from "@/lib/admin-ai/provider";
import type { EmailAsset, EmailCampaign, EmailTemplate } from "@/types/database";
import type { AdminAiThreadSummary } from "@/types/admin-ai";
import { ContactsPanel } from "./contacts/contacts-panel";
import { TagsPanel } from "./tags/tags-panel";
import { AdminAiPanel } from "./admin-ai/panel";
import { EmailStudio } from "./email/email-studio";

type Tab = "contacts" | "tags" | "ai" | "email";

const TABS: { key: Tab; label: string }[] = [
  { key: "contacts", label: "Contacts" },
  { key: "tags", label: "Tags" },
  { key: "ai", label: "AI Analyst" },
  { key: "email", label: "Email" },
];

function parseAdminTab(value: string | null): Tab {
  return TABS.some((tab) => tab.key === value) ? (value as Tab) : "contacts";
}

function parseContactIds(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((contactId) => contactId.trim())
    .filter(Boolean);
}

function tabFromSearchParams(searchParams: { get(name: string): string | null }): Tab {
  const contactIds = parseContactIds(searchParams.get("contacts"));
  if (contactIds.length > 0) return "email";
  return parseAdminTab(searchParams.get("tab"));
}

export function AdminDashboard({
  initialGlobalThreads,
  adminAiAvailability,
  emailTemplates,
  emailCampaigns,
  emailAssets,
}: {
  initialGlobalThreads: AdminAiThreadSummary[];
  adminAiAvailability: AdminAiProviderAvailability;
  emailTemplates: EmailTemplate[];
  emailCampaigns: EmailCampaign[];
  emailAssets: EmailAsset[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = tabFromSearchParams(searchParams);
  const urlSelectedEmailContactIds = parseContactIds(searchParams.get("contacts"));
  const [localSelectedEmailContactIds, setLocalSelectedEmailContactIds] = useState<
    string[]
  >([]);
  const selectedEmailContactIds =
    urlSelectedEmailContactIds.length > 0
      ? urlSelectedEmailContactIds
      : localSelectedEmailContactIds;

  function replaceAdminQuery(params: URLSearchParams) {
    const query = params.toString();
    router.replace(query ? `/admin?${query}` : "/admin", { scroll: false });
  }

  function handleTabChange(tab: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    if (tab !== "email") params.delete("contacts");
    replaceAdminQuery(params);
  }

  function handleSendEmailToContacts(contactIds: string[]) {
    setLocalSelectedEmailContactIds(contactIds);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "email");
    params.delete("contacts");
    replaceAdminQuery(params);
  }

  function handleClearSelectedEmailContacts() {
    setLocalSelectedEmailContactIds([]);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("contacts");
    if (activeTab === "email") params.set("tab", "email");
    replaceAdminQuery(params);
  }

  return (
    <div>
      <nav className="mb-8 flex gap-1 border-b border-border pb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleTabChange(tab.key)}
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
        <ContactsPanel onSendEmailToContacts={handleSendEmailToContacts} />
      )}

      {activeTab === "tags" && <TagsPanel />}

      {activeTab === "email" && (
        <EmailStudio
          templates={emailTemplates}
          campaigns={emailCampaigns}
          assets={emailAssets}
          selectedContactIds={selectedEmailContactIds}
          onClearSelectedContacts={handleClearSelectedEmailContacts}
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
