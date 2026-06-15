"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentType } from "react";
import {
  Bot,
  CheckSquare,
  ContactRound,
  Home,
  LogOut,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  Tags,
  Users,
} from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { getAdminItemActiveState, getAdminPanelHref } from "./admin-navigation";
import type { AdminPanelTab, AdminNavigationItem } from "./admin-navigation";
import { isLocalAdminAiEnabled } from "./admin-ai/visibility";

type AdminSidebarUser = {
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
};

const workspaceItems: Array<{
  item: AdminPanelTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { item: "contacts", label: "Contacts", icon: ContactRound },
  { item: "email", label: "Email", icon: Mail },
  { item: "tasks", label: "Tasks", icon: CheckSquare },
  { item: "tags", label: "Tags", icon: Tags },
  { item: "ai", label: "AI Agent", icon: Bot },
];

function AdminSidebarCollapseButton() {
  const { isMobile, state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const label = isMobile
    ? "Close sidebar"
    : isCollapsed
      ? "Expand sidebar"
      : "Collapse sidebar";
  const Icon = isCollapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <SidebarMenuButton
      type="button"
      aria-label={label}
      tooltip={label}
      onClick={toggleSidebar}
    >
      <Icon className="size-4" />
      <span>{isMobile ? "Close" : isCollapsed ? "Expand" : "Collapse"}</span>
    </SidebarMenuButton>
  );
}

export function AdminSidebar({ user }: { user: AdminSidebarUser }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const aiEnabled = isLocalAdminAiEnabled();
  const rawTab = searchParams.get("tab");
  const tab =
    rawTab === "email" ||
    rawTab === "tasks" ||
    rawTab === "tags" ||
    (rawTab === "ai" && aiEnabled)
      ? rawTab
      : "contacts";
  const displayName = user.displayName || user.email;
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  function isActive(item: AdminNavigationItem) {
    return getAdminItemActiveState({ item, pathname, tab });
  }

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link href="/" aria-label="Back to site">
                <span className="flex aspect-square size-8 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <Home className="size-4" />
                </span>
                <span className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">BTM Admin</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Behind the Mask
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <AdminSidebarCollapseButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceItems
                .filter((entry) => entry.item !== "ai" || aiEnabled)
                .map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <SidebarMenuItem key={entry.item}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(entry.item)}
                        tooltip={entry.label}
                      >
                        <Link href={getAdminPanelHref(entry.item)}>
                          <Icon className="size-4" />
                          <span>{entry.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>People</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("users")}
                  tooltip="Users"
                >
                  <Link href="/admin/users">
                    <Users className="size-4" />
                    <span>Users</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-3 rounded-2xl px-2 py-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
                {initials || "A"}
              </span>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <form action={logout}>
              <SidebarMenuButton asChild tooltip="Log out">
                <button type="submit" className="w-full">
                  <LogOut className="size-4" />
                  <span>Log out</span>
                </button>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
