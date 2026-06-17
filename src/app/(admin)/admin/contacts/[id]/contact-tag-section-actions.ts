"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminTiming, startAdminTiming } from "@/lib/admin/timing";
import {
  getContactTags,
  getTagCategories,
  getTags,
} from "@/lib/data/contacts";
import { validateUUID } from "@/lib/validation-helpers";

export async function loadContactTagSectionData(contactId: string) {
  validateUUID(contactId, "contact");
  await requireAdmin();
  const startedAt = startAdminTiming();

  const [contactTagRows, categories, allTags] = await Promise.all([
    getContactTags(contactId),
    getTagCategories(),
    getTags(),
  ]);

  logAdminTiming("admin.contact.tags.section.server", startedAt, {
    categories: categories.length,
    contactId,
    contactTags: contactTagRows.length,
    tags: allTags.length,
  });

  return { allTags, categories, contactTagRows };
}
