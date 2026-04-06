"use client";

import { useEffect, useState } from "react";
import { useAdminData } from "./admin-data-provider";
import { ContactsPanel } from "./contacts/contacts-panel";
import { TagsPanel } from "./tags/tags-panel";

type Tab = "contacts" | "tags";

const TABS: { key: Tab; label: string }[] = [
  { key: "contacts", label: "Contacts" },
  { key: "tags", label: "Tags" },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("contacts");
  const { ensureContacts, ensureApplications } = useAdminData();

  useEffect(() => {
    // Contacts tab needs both contacts and applications data
    if (activeTab === "contacts") {
      ensureContacts();
      ensureApplications();
    } else {
      ensureContacts(); // Tags tab also needs tag data from ensureContacts
    }
  }, [activeTab, ensureContacts, ensureApplications]);

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

      {activeTab === "contacts" ? <ContactsPanel /> : <TagsPanel />}
    </div>
  );
}
