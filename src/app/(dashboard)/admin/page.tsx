"use client";

import { useEffect, useState } from "react";
import { useAdminData } from "./admin-data-provider";
import { ApplicationsPanel } from "./applications/applications-panel";
import { UsersPanel } from "./users/users-panel";

type Tab = "applications" | "users";

const TABS: { key: Tab; label: string }[] = [
  { key: "applications", label: "Applications" },
  { key: "users", label: "Users" },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("applications");
  const { ensureApplications, ensureProfiles } = useAdminData();

  useEffect(() => {
    if (activeTab === "applications") {
      ensureApplications();
    } else {
      ensureProfiles();
    }
  }, [activeTab, ensureApplications, ensureProfiles]);

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

      {activeTab === "applications" ? <ApplicationsPanel /> : <UsersPanel />}
    </div>
  );
}
