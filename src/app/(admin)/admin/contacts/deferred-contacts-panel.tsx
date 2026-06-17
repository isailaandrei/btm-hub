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
  initialContactsData?: Promise<AdminContactsInitialData>;
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
