import { redirect } from "next/navigation";
import { AdminDashboard } from "./admin-dashboard";
import { resolveAdminPanelTab } from "./admin-navigation";
import { isLocalAdminAiEnabled } from "./admin-ai/visibility";
import { getProfile } from "@/lib/data/profiles";
import { getAdminContactsInitialData } from "@/lib/data/admin-contact-list";

type AdminPageProps = {
  searchParams: Promise<{ tab?: string | string[] }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const profile = await getProfile();

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const params = await searchParams;
  const rawTab = Array.isArray(params?.tab) ? params.tab[0] : params?.tab;
  const { tab } = resolveAdminPanelTab(rawTab ?? null, {
    aiEnabled: isLocalAdminAiEnabled(),
  });
  const initialContactsData =
    tab === "contacts"
      ? getAdminContactsInitialData(profile.preferences)
      : undefined;

  return (
    <AdminDashboard initialContactsData={initialContactsData} />
  );
}
