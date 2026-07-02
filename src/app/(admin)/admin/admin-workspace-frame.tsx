"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdminDashboard } from "./admin-dashboard";
import { contactIdFromPathname } from "./contacts/contact-detail-route";
import { ContactDetailSkeleton } from "./contacts/[id]/contact-detail-skeleton";
import type { AdminContactsInitialData } from "@/lib/data/admin-contact-list";

// Lazy-loaded so the heavy contact detail bundle (portfolio gallery, form
// definitions, timeline) stays out of the contacts-first-paint and only loads
// when a contact is opened.
const ContactDetailPanel = dynamic(
  () =>
    import("./contacts/[id]/contact-detail-panel").then(
      (module) => module.ContactDetailPanel,
    ),
  { ssr: false, loading: () => <ContactDetailSkeleton /> },
);

/**
 * Persistent admin workspace shell. Keeps `AdminDashboard` mounted across all
 * admin navigation, and renders contact detail as a client panel (soft nav)
 * driven purely by the pathname — so in-app navigation never tears down the
 * workspace. Other admin subroutes (e.g. `/admin/users`) render `children`.
 */
export function AdminWorkspaceFrame({
  children,
  authorName,
  initialContactsData,
}: {
  children: ReactNode;
  authorName: string;
  initialContactsData?: Promise<AdminContactsInitialData>;
}) {
  const pathname = usePathname();
  const isDashboardRoute = pathname === "/admin";
  const contactId = contactIdFromPathname(pathname);

  return (
    <>
      <div hidden={!isDashboardRoute}>
        <AdminDashboard initialContactsData={initialContactsData} />
      </div>
      {contactId && (
        <div>
          <ContactDetailPanel
            key={contactId}
            contactId={contactId}
            authorName={authorName}
          />
        </div>
      )}
      <div hidden={isDashboardRoute || contactId != null}>{children}</div>
    </>
  );
}
