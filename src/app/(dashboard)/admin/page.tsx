import { redirect } from "next/navigation";
import { AdminDashboard } from "./admin-dashboard";
import { getProfile } from "@/lib/data/profiles";
import { getAdminContactsInitialData } from "@/lib/data/admin-contact-list";
import { AdminDataProvider } from "./admin-data-provider";

export default async function AdminPage() {
  const profile = await getProfile();

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const initialContactsData = await getAdminContactsInitialData(
    profile.preferences,
  );

  return (
    <AdminDataProvider
      initialContactsData={initialContactsData}
      initialPreferences={profile.preferences}
    >
      <AdminDashboard initialContactsData={initialContactsData} />
    </AdminDataProvider>
  );
}
