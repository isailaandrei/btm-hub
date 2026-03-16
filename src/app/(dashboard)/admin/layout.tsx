import { redirect } from "next/navigation";
import { getProfile } from "@/lib/data/profiles";
import { AdminDataProvider } from "./admin-data-provider";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  return (
    <div>
      <AdminDataProvider>
        {children}
      </AdminDataProvider>
    </div>
  );
}
