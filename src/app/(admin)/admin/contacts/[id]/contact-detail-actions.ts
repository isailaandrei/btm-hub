"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getContactDetailBootstrap,
  type ContactDetailBootstrapData,
} from "@/lib/data/contact-detail";
import { getPortfolioItemsByContactProfileId } from "@/lib/data/profile-portfolio";
import type { ProfilePortfolioItemWithUrl } from "@/types/database";
import { validateUUID } from "@/lib/validation-helpers";

/**
 * Load the contact detail bootstrap for the session cache. Used for cache
 * misses, hover/focus prefetch warming, and realtime-triggered refreshes.
 */
export async function loadContactDetailAction(
  contactId: string,
): Promise<ContactDetailBootstrapData | null> {
  validateUUID(contactId, "contact");
  await requireAdmin();

  return getContactDetailBootstrap(contactId);
}

/** Lazy-load a contact's portfolio for the client detail panel. */
export async function loadContactPortfolioAction(
  profileId: string | null,
): Promise<ProfilePortfolioItemWithUrl[]> {
  await requireAdmin();
  if (!profileId) return [];
  validateUUID(profileId, "profile");

  return getPortfolioItemsByContactProfileId({ profileId });
}
