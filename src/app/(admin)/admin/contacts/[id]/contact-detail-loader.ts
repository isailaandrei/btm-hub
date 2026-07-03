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
 *
 * `options.force` skips both the in-flight dedup and the fresh short-circuit and
 * issues a NEW load, superseding any in-flight one. Callers that know data has
 * just changed (a committed mutation, a realtime event) use it so they never
 * coalesce onto a load whose SELECT predates that change.
 */
const inFlight = new Map<string, Promise<ContactDetailBootstrapData | null>>();

export function warmContactDetail(
  contactId: string,
  options?: { force?: boolean },
): Promise<ContactDetailBootstrapData | null> {
  if (!options?.force) {
    const existing = inFlight.get(contactId);
    if (existing) return existing;

    const entry = contactDetailCacheStore.get(contactId);
    if (entry && entry.status === "fresh") {
      return Promise.resolve(entry.data);
    }
  }

  // Stamp at request time, not resolution time, so last-write-wins is real: a
  // load issued earlier that resolves later (network reordering) won't clobber a
  // newer load's data. Without this the cache store's loadedAt guard is inert.
  const requestedAt = Date.now();
  const request = loadContactDetailAction(contactId)
    .then((data) => {
      if (data) contactDetailCacheStore.set(contactId, data, requestedAt);
      return data;
    })
    .finally(() => {
      // Only clear if this load is still the current in-flight one: a forced
      // reload can supersede an older in-flight load, and the older load's
      // settlement must not delete the newer entry.
      if (inFlight.get(contactId) === request) inFlight.delete(contactId);
    });

  inFlight.set(contactId, request);
  return request;
}

/**
 * Refresh the open contact's cache after a mutation whose write has already
 * committed (the caller `await`ed the server action). Marks the entry stale so
 * `warmContactDetail` bypasses its fresh short-circuit and reloads from the
 * server — independent of Supabase Realtime, so a committed write is never left
 * looking undone when the websocket is down (fail loud, never fake).
 *
 * Call this INSIDE the mutation's `startTransition` and `await` it: the awaited
 * reload keeps a `useOptimistic` value pinned until authoritative data lands,
 * so the optimistic row hands off to the real one with no flicker or revert.
 */
export function refreshContactDetailAfterMutation(
  contactId: string,
): Promise<ContactDetailBootstrapData | null> {
  contactDetailCacheStore.markStale(contactId);
  // Force a NEW post-commit load. A plain warmContactDetail could coalesce onto
  // an in-flight load whose SELECT ran BEFORE this (already-committed) mutation
  // and then write that pre-mutation data back as `fresh` — reverting the
  // optimistic value and caching stale state. Forcing supersedes any such
  // in-flight load, and its later request-time stamp wins last-write-wins.
  return warmContactDetail(contactId, { force: true });
}
