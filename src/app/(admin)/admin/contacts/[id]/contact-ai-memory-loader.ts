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
