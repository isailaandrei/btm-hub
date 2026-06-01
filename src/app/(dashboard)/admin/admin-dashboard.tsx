"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ContactsPanel } from "./contacts/contacts-panel";
import { TagsPanel } from "./tags/tags-panel";

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

const ShopAdmin = dynamic(
  () => import("./shop/shop-admin").then((module) => module.ShopAdmin),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading shop admin...
      </div>
    ),
  },
);

type Tab = "contacts" | "tags" | "email" | "shop";

const TABS: { key: Tab; label: string }[] = [
  { key: "contacts", label: "Contacts" },
  { key: "tags", label: "Tags" },
  { key: "email", label: "Email" },
  { key: "shop", label: "Shop" },
];

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("contacts");
  const [hasVisitedEmail, setHasVisitedEmail] = useState(false);
  const [hasVisitedShop, setHasVisitedShop] = useState(false);
  const [emailContactIds, setEmailContactIds] = useState<string[]>([]);

  function handleSendEmail(contactIds: string[]) {
    setEmailContactIds(contactIds);
    setHasVisitedEmail(true);
    setActiveTab("email");
  }

  function handleSelectTab(tab: Tab) {
    if (tab === "email") {
      if (activeTab !== "email") {
        setEmailContactIds([]);
      }
      setHasVisitedEmail(true);
    }
    if (tab === "shop") {
      setHasVisitedShop(true);
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

      {(activeTab === "email" || hasVisitedEmail) && (
        <div hidden={activeTab !== "email"}>
          <EmailStudio
            isVisible={activeTab === "email"}
            selectedContactIds={emailContactIds}
          />
        </div>
      )}

      {(activeTab === "shop" || hasVisitedShop) && (
        <div hidden={activeTab !== "shop"}>
          <ShopAdmin isVisible={activeTab === "shop"} />
        </div>
      )}
    </div>
  );
}
