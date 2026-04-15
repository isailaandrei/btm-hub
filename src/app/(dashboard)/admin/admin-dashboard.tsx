"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminAiProviderAvailability } from "@/lib/admin-ai/provider";
import type { AdminAiThreadSummary } from "@/types/admin-ai";
import { ContactsPanel } from "./contacts/contacts-panel";
import { TagsPanel } from "./tags/tags-panel";
import { AdminAiPanel } from "./admin-ai/panel";

type Tab = "contacts" | "tags" | "ai";

const TABS: { key: Tab; label: string }[] = [
  { key: "contacts", label: "Contacts" },
  { key: "tags", label: "Tags" },
  { key: "ai", label: "AI" },
];

export function AdminDashboard({
  initialGlobalThreads,
  adminAiAvailability,
}: {
  initialGlobalThreads: AdminAiThreadSummary[];
  adminAiAvailability: AdminAiProviderAvailability;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("contacts");

  return (
    <div>
      <nav className="mb-8 flex gap-1 border-b border-border pb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
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

      {activeTab === "contacts" && <ContactsPanel />}

      {activeTab === "tags" && <TagsPanel />}

      {activeTab === "ai" && (
        <Card className="max-w-5xl">
          <CardHeader>
            <CardTitle>AI Analyst</CardTitle>
            <p className="text-sm text-muted-foreground">
              Ask grounded questions about contacts, applications, and notes.
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
