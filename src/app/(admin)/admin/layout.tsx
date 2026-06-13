import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getProfile } from "@/lib/data/profiles";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AdminShellHeader } from "./admin-shell-header";
import { AdminSidebar } from "./admin-sidebar";

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
    <div className="theme-admin min-h-svh bg-sidebar text-foreground">
      <SidebarProvider>
        <Suspense fallback={null}>
          <AdminSidebar
            user={{
              avatarUrl: profile.avatar_url,
              displayName: profile.display_name,
              email: profile.email,
            }}
          />
        </Suspense>
        <SidebarInset className="min-w-0">
          <Suspense
            fallback={
              <header className="h-14 shrink-0 border-b border-border/60" />
            }
          >
            <AdminShellHeader />
          </Suspense>
          <div className="min-w-0 flex-1 overflow-auto p-3 md:p-5 lg:p-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
