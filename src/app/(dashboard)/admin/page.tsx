import { listAdminAiThreadSummaries } from "@/lib/data/admin-ai";
import { AdminDashboard } from "./admin-dashboard";

export default async function AdminPage() {
  const initialGlobalThreads = await listAdminAiThreadSummaries({
    scope: "global",
  });

  return <AdminDashboard initialGlobalThreads={initialGlobalThreads} />;
}
