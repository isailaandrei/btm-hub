import { listAdminAiThreadSummaries } from "@/lib/data/admin-ai";
import { getAdminAiProviderAvailability } from "@/lib/admin-ai/provider";
import { listEmailAssets } from "@/lib/data/email-assets";
import { listEmailCampaigns } from "@/lib/data/email-campaigns";
import { listEmailTemplates } from "@/lib/data/email-templates";
import { AdminDashboard } from "./admin-dashboard";

export default async function AdminPage() {
  const [
    initialGlobalThreads,
    adminAiAvailability,
    emailTemplates,
    emailCampaigns,
    emailAssets,
  ] = await Promise.all([
    listAdminAiThreadSummaries({
      scope: "global",
    }),
    getAdminAiProviderAvailability(),
    listEmailTemplates(),
    listEmailCampaigns(),
    listEmailAssets(),
  ]);

  return (
    <AdminDashboard
      initialGlobalThreads={initialGlobalThreads}
      adminAiAvailability={adminAiAvailability}
      emailTemplates={emailTemplates}
      emailCampaigns={emailCampaigns}
      emailAssets={emailAssets}
    />
  );
}
