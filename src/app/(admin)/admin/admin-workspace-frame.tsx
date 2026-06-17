"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdminDashboard } from "./admin-dashboard";

export function AdminWorkspaceFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isDashboardRoute = pathname === "/admin";

  return (
    <>
      <div hidden={!isDashboardRoute}>
        <AdminDashboard />
      </div>
      <div hidden={isDashboardRoute}>{children}</div>
    </>
  );
}

