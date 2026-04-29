"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { EmailAsset, EmailCampaign, EmailTemplate } from "@/types/database";
import { AssetPicker } from "./assets/asset-picker";
import { CampaignComposer } from "./campaign-composer";
import { CampaignHistory } from "./campaign-history";
import { TemplateEditor } from "./templates/template-editor";
import { TemplateList } from "./templates/template-list";

type EmailStudioTab = "campaigns" | "templates" | "assets";

interface EmailStudioProps {
  templates: EmailTemplate[];
  campaigns: EmailCampaign[];
  assets: EmailAsset[];
}

const EMAIL_TABS: { key: EmailStudioTab; label: string }[] = [
  { key: "campaigns", label: "Campaigns" },
  { key: "templates", label: "Templates" },
  { key: "assets", label: "Assets" },
];

export function EmailStudio({ templates, campaigns, assets }: EmailStudioProps) {
  const [activeTab, setActiveTab] = useState<EmailStudioTab>("campaigns");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    templates[0]?.id ?? null,
  );
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  function toggleAsset(assetId: string) {
    setSelectedAssetIds((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId],
    );
  }

  return (
    <Card className="mx-auto max-w-7xl">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-foreground">Email Studio</h2>
            <p className="text-xs text-muted-foreground">
              Templates, campaign drafts, and CRM email reporting.
            </p>
          </div>
          <nav className="flex gap-1 rounded-md border border-border p-1">
            {EMAIL_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded px-3 py-1.5 text-xs font-medium ${
                  activeTab === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </CardHeader>
      <CardContent>
        {activeTab === "campaigns" && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <CampaignComposer templates={templates} />
            <div className="rounded-md border border-border">
              <div className="border-b border-border px-3 py-2 text-sm font-medium">
                Recent campaigns
              </div>
              <div className="p-3">
                <CampaignHistory campaigns={campaigns.slice(0, 8)} />
              </div>
            </div>
          </div>
        )}

        {activeTab === "templates" && (
          <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <TemplateList
              templates={templates}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={setSelectedTemplateId}
            />
            <TemplateEditor
              templateId={selectedTemplateId}
              assetIds={selectedAssetIds}
            />
          </div>
        )}

        {activeTab === "assets" && (
          <AssetPicker
            assets={assets}
            selectedAssetIds={selectedAssetIds}
            onToggleAsset={toggleAsset}
          />
        )}
      </CardContent>
    </Card>
  );
}
