import { listAdminAiThreadSummaries } from "@/lib/data/admin-ai";
import { getAdminAiProviderAvailability } from "@/lib/admin-ai/provider";
import { AdminDashboard } from "./admin-dashboard";

export default async function AdminPage() {
  const [initialGlobalThreads, adminAiAvailability] = await Promise.all([
    listAdminAiThreadSummaries({
      scope: "global",
    }),
    getAdminAiProviderAvailability(),
  ]);

  return (
    <AdminDashboard
      initialGlobalThreads={initialGlobalThreads}
      adminAiAvailability={adminAiAvailability}
    />
  );
}
