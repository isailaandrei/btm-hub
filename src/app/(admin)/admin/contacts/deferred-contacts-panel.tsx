"use client";

import { use } from "react";
import { ContactsPanel } from "./contacts-panel";
import type { AdminContactsInitialData } from "@/lib/data/admin-contact-list";

export function DeferredContactsPanel({
  initialContactsData,
  onSendEmail,
}: {
  initialContactsData?: Promise<AdminContactsInitialData>;
  onSendEmail?: (contactIds: string[]) => void;
}) {
  const initialData = initialContactsData ? use(initialContactsData) : undefined;

  return <ContactsPanel initialData={initialData} onSendEmail={onSendEmail} />;
}
