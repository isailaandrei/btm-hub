import { redirect } from "next/navigation";
import { AdminDashboard } from "./admin-dashboard";
import { AdminDataProvider } from "./admin-data-provider";
import { getProfile } from "@/lib/data/profiles";
import { getAdminContactsInitialData } from "@/lib/data/admin-contact-list";

export default async function AdminPage() {
  const profile = await getProfile();

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const initialContactsData = getAdminContactsInitialData(
    profile.preferences,
  );

  return (
    <AdminDataProvider initialPreferences={profile.preferences}>
      <AdminDashboard initialContactsData={initialContactsData} />
    </AdminDataProvider>
  );
}
