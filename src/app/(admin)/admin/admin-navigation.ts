export type AdminPanelTab = "contacts" | "email" | "tasks" | "tags" | "ai";

export type AdminNavigationItem = AdminPanelTab | "users";

export const ADMIN_PANEL_TABS: readonly AdminPanelTab[] = [
  "contacts",
  "email",
  "tasks",
  "tags",
  "ai",
] as const;

const PANEL_TAB_SET = new Set<AdminPanelTab>(ADMIN_PANEL_TABS);

export function resolveAdminPanelTab(
  rawTab: string | null,
  { aiEnabled }: { aiEnabled: boolean },
): { tab: AdminPanelTab; invalidValue: string | null } {
  if (!rawTab) {
    return { tab: "contacts", invalidValue: null };
  }

  if (!PANEL_TAB_SET.has(rawTab as AdminPanelTab)) {
    return { tab: "contacts", invalidValue: rawTab };
  }

  const tab = rawTab as AdminPanelTab;
  if (tab === "ai" && !aiEnabled) {
    return { tab: "contacts", invalidValue: rawTab };
  }

  return { tab, invalidValue: null };
}

export function getAdminPanelHref(tab: AdminPanelTab) {
  return tab === "contacts" ? "/admin" : `/admin?tab=${tab}`;
}

export function getAdminItemActiveState({
  item,
  pathname,
  tab,
}: {
  item: AdminNavigationItem;
  pathname: string;
  tab: AdminPanelTab;
}) {
  if (item === "users") {
    return pathname === "/admin/users";
  }

  if (item === "contacts" && pathname.startsWith("/admin/contacts/")) {
    return true;
  }

  if (pathname !== "/admin") {
    return false;
  }

  return item === tab;
}
