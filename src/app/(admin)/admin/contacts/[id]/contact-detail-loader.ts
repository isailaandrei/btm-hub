import type { ContactDetailBootstrapData } from "@/lib/data/contact-detail";
import { contactDetailCacheStore } from "../contact-detail-cache";
import { loadContactDetailAction } from "./contact-detail-actions";

/**
 * Load a contact's detail bootstrap into the session cache, deduplicating
 * concurrent requests for the same id. Used by hover/focus prefetch, the soft
 * navigation click handler, and the panel's own cache-miss / stale loader.
 *
 * Resolves with the bootstrap (or `null` when the contact does not exist).
 * A fresh cache entry short-circuits with the cached data — a `stale` entry is
 * refreshed (stale-while-revalidate). Errors propagate to the caller so the
 * panel can surface them; best-effort callers (prefetch) should `.catch()`.
 */
const inFlight = new Map<string, Promise<ContactDetailBootstrapData | null>>();

export function warmContactDetail(
  contactId: string,
): Promise<ContactDetailBootstrapData | null> {
  const existing = inFlight.get(contactId);
  if (existing) return existing;

  const entry = contactDetailCacheStore.get(contactId);
  if (entry && entry.status === "fresh") {
    return Promise.resolve(entry.data);
  }

  const request = loadContactDetailAction(contactId)
    .then((data) => {
      if (data) contactDetailCacheStore.set(contactId, data);
      return data;
    })
    .finally(() => {
      inFlight.delete(contactId);
    });

  inFlight.set(contactId, request);
  return request;
}
