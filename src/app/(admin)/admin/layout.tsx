import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getProfile } from "@/lib/data/profiles";
import { getAdminContactsInitialData } from "@/lib/data/admin-contact-list";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AdminShellHeader } from "./admin-shell-header";
import { AdminDataProvider } from "./admin-data-provider";
import { AdminSidebar } from "./admin-sidebar";
import { AdminWorkspaceFrame } from "./admin-workspace-frame";
import { AdminEmailDataProvider } from "./email/admin-email-data-provider";
import { TaskDataProvider } from "./tasks/task-data-provider";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const authorName = profile.display_name ?? profile.email ?? "You";

  // Kick off the contacts first-page bootstrap WITHOUT awaiting it: the promise
  // streams to the client contacts panel (via <Suspense> + use()), so the
  // default tab's first paint comes from the server instead of a cold client
  // round-trip after hydration. Awaiting here would block the whole shell.
  // cache()-wrapped, so this is deduped within the request.
  const initialContactsData = getAdminContactsInitialData(profile.preferences);

  return (
    <div className="theme-admin min-h-svh bg-sidebar text-foreground">
      <AdminDataProvider initialPreferences={profile.preferences}>
        <AdminEmailDataProvider>
          <TaskDataProvider>
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
                  <AdminWorkspaceFrame
                    authorName={authorName}
                    initialContactsData={initialContactsData}
                  >
                    {children}
                  </AdminWorkspaceFrame>
                </div>
              </SidebarInset>
            </SidebarProvider>
          </TaskDataProvider>
        </AdminEmailDataProvider>
      </AdminDataProvider>
    </div>
  );
}
