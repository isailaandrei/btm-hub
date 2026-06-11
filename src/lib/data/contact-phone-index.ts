import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Application, Contact } from "@/types/database";
import type { ContactCardRecord } from "./contact-cards";

function groupApplicationsByContactId(
  applications: Application[],
): Map<string, Application[]> {
  const grouped = new Map<string, Application[]>();
  for (const application of applications) {
    if (!application.contact_id) continue;
    const bucket = grouped.get(application.contact_id);
    if (bucket) bucket.push(application);
    else grouped.set(application.contact_id, [application]);
  }
  return grouped;
}

export const loadContactPhoneIndexRecords = cache(
  async function loadContactPhoneIndexRecords(): Promise<ContactCardRecord[]> {
    const supabase = await createAdminClient();
    const [
      { data: contactData, error: contactError },
      { data: applicationData, error: applicationError },
    ] = await Promise.all([
      supabase.from("contacts").select("*").order("name", { ascending: true }),
      supabase
        .from("applications")
        .select("*")
        .not("contact_id", "is", null)
        .order("submitted_at", { ascending: false }),
    ]);

    if (contactError) {
      throw new Error(
        `Failed to load contacts for phone matching: ${contactError.message}`,
      );
    }
    if (applicationError) {
      throw new Error(
        `Failed to load applications for phone matching: ${applicationError.message}`,
      );
    }

    const contacts = (contactData ?? []) as Contact[];
    const applicationsByContact = groupApplicationsByContactId(
      (applicationData ?? []) as Application[],
    );

    return contacts.map((contact) => ({
      contact,
      applications: applicationsByContact.get(contact.id) ?? [],
      contactNotes: [],
      contactTags: [],
    }));
  },
);
