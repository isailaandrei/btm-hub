"use client";

import { use } from "react";
import {
  useAdminApplicationsData,
  useAdminContactsData,
} from "../admin-data-provider";
import { ContactsPanel } from "./contacts-panel";
import type { AdminContactsInitialData } from "@/lib/data/admin-contact-list";

export function DeferredContactsPanel({
  initialContactsData,
  onSendEmail,
}: {
  // Resolves to undefined when the server bootstrap failed (layout catches the
  // rejection) — the panel then falls back to the provider's client fetch.
  initialContactsData?: Promise<AdminContactsInitialData | undefined>;
  onSendEmail?: (contactIds: string[]) => void;
}) {
  const {
    contacts,
    tagCategories,
    tags,
    contactTags,
    contactActivitySummaries,
    hasLoadedFullContacts,
  } = useAdminContactsData();
  const { applications, hasLoadedFullApplications } =
    useAdminApplicationsData();
  const hasCachedFullData =
    hasLoadedFullContacts &&
    hasLoadedFullApplications &&
    contacts !== null &&
    applications !== null &&
    contactTags !== null &&
    contactActivitySummaries !== null &&
    tagCategories !== null &&
    tags !== null;
  const initialData =
    initialContactsData && !hasCachedFullData
      ? use(initialContactsData)
      : undefined;

  return <ContactsPanel initialData={initialData} onSendEmail={onSendEmail} />;
}
