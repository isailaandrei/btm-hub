"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { resolveAdminPanelTab } from "./admin-navigation";
import { isLocalAdminAiEnabled } from "./admin-ai/visibility";

const tabLabels = {
  contacts: "Contacts",
  email: "Email",
  tasks: "Tasks",
  tags: "Tags",
  ai: "AI Agent",
} as const;

function getPageLabel(pathname: string, tabLabel: string) {
  if (pathname === "/admin/users") return "Users";
  if (pathname.startsWith("/admin/contacts/")) return "Contact detail";
  return tabLabel;
}

export function AdminShellHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { tab } = resolveAdminPanelTab(searchParams.get("tab"), {
    aiEnabled: isLocalAdminAiEnabled(),
  });
  const pageLabel = getPageLabel(pathname, tabLabels[tab]);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4 md:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5" />
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Admin</span>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium text-foreground">{pageLabel}</span>
      </nav>
    </header>
  );
}
