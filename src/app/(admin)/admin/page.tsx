import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminDashboard } from "./admin-dashboard";
import { getProfile } from "@/lib/data/profiles";
import { getAdminContactsInitialData } from "@/lib/data/admin-contact-list";

export default async function AdminPage() {
  const profile = await getProfile();

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const initialContactsData = await getAdminContactsInitialData(
    profile.preferences,
  );

  return (
    <Suspense
      fallback={
        <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading admin dashboard...
        </div>
      }
    >
      <AdminDashboard initialContactsData={initialContactsData} />
    </Suspense>
  );
}
