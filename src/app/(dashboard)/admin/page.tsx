import { listAdminAiThreadSummaries } from "@/lib/data/admin-ai";
import { getAdminAiProviderAvailability } from "@/lib/admin-ai/provider";
import { listEmailSends } from "@/lib/data/email-sends";
import { listEmailTemplates } from "@/lib/data/email-templates";
import { AdminDashboard } from "./admin-dashboard";

export default async function AdminPage() {
  const [
    initialGlobalThreads,
    adminAiAvailability,
    emailTemplates,
    emailSends,
  ] = await Promise.all([
    listAdminAiThreadSummaries({
      scope: "global",
    }),
    getAdminAiProviderAvailability(),
    listEmailTemplates(),
    listEmailSends(),
  ]);

  return (
    <AdminDashboard
      initialGlobalThreads={initialGlobalThreads}
      adminAiAvailability={adminAiAvailability}
      emailTemplates={emailTemplates}
      emailSends={emailSends}
    />
  );
}
