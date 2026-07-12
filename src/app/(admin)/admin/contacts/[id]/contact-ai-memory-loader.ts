/**
 * Client-side dedupe for `loadContactAiMemory`: the WhatsApp badges and the
 * AI-memory section both need the same data and mount together on the contact
 * page — without this they'd fire two identical POSTs per view (the
 * mount-time-chain regression the deep-link batching work exists to prevent).
 *
 * Short TTL: long enough to collapse the simultaneous mounts (and quick tab
 * flips), short enough that a revisit still sees fresh digests. Failed loads
 * are evicted immediately so retry buttons hit the server again.
 */
import { loadContactAiMemory, type ContactAiMemoryData } from "../actions";

const TTL_MS = 30_000;

const cache = new Map<
  string,
  { promise: Promise<ContactAiMemoryData>; at: number }
>();

// Per-contact listeners: sections mounted on the same contact page (the
// WhatsApp thread badges and the AI-memory card) subscribe here so a correction
// made in one live-refreshes the other, instead of leaving it stale until a
// full page reload. A correction can now originate from EITHER surface (the
// thread popover or the memory card), so both directions need to sync.
const listeners = new Map<string, Set<() => void>>();

export function loadContactAiMemoryShared(
  contactId: string,
): Promise<ContactAiMemoryData> {
  const entry = cache.get(contactId);
  if (entry && Date.now() - entry.at < TTL_MS) return entry.promise;

  const promise = loadContactAiMemory(contactId).catch((error) => {
    cache.delete(contactId);
    throw error;
  });
  cache.set(contactId, { promise, at: Date.now() });
  return promise;
}

/**
 * Subscribes to correction events for one contact. The listener fires AFTER the
 * shared cache is evicted, so a re-fetch inside it hits the server for fresh
 * data. Returns an unsubscribe; call it on unmount so a later notify is a no-op.
 */
export function subscribeContactAiMemory(
  contactId: string,
  listener: () => void,
): () => void {
  let set = listeners.get(contactId);
  if (!set) {
    set = new Set();
    listeners.set(contactId, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(contactId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(contactId);
  };
}

/**
 * Evicts the cached entry so the next call re-fetches, THEN notifies every
 * mounted subscriber for this contact. Called after a successful digest
 * correction (from either surface): the correcting section already patched its
 * own state optimistically, and the notify live-refreshes the sibling section
 * (and lands server truth in the correcting one too). Listeners are copied
 * before iterating so one unsubscribing during notify can't disturb the loop.
 */
export function invalidateContactAiMemoryShared(contactId: string): void {
  cache.delete(contactId);
  const set = listeners.get(contactId);
  if (!set) return;
  for (const listener of [...set]) listener();
}
