import type { ContactDetailBootstrapData } from "@/lib/data/contact-detail";

/**
 * Session-persistent client cache for contact detail bootstrap data.
 *
 * Lives as a module-level singleton so it survives tab switches, contact
 * switches, and Next's framework Router Cache invalidation (`revalidatePath`).
 * Subscribers read it via `useSyncExternalStore`, so a cache hit renders
 * synchronously with no flash. Pure JS — no browser APIs — so it is SSR-safe;
 * subscribers must supply a `getServerSnapshot` returning `undefined`.
 */

export type ContactDetailCacheStatus = "fresh" | "stale";

export interface ContactDetailCacheEntry {
  data: ContactDetailBootstrapData;
  status: ContactDetailCacheStatus;
  /** Monotonic-ish write stamp (ms epoch). Newer or equal writes win. */
  loadedAt: number;
}

type Listener = () => void;

export interface ContactDetailCacheStore {
  /** Synchronous read — safe to call during render. */
  get(contactId: string): ContactDetailCacheEntry | undefined;
  /** Alias of `get`, named for `useSyncExternalStore` ergonomics. */
  getSnapshot(contactId: string): ContactDetailCacheEntry | undefined;
  has(contactId: string): boolean;
  /** Store fresh data. Ignored if an entry with a newer `loadedAt` exists. */
  set(
    contactId: string,
    data: ContactDetailBootstrapData,
    loadedAt?: number,
  ): void;
  /** Keep cached data but flag it for stale-while-revalidate on next open. */
  markStale(contactId: string): void;
  /** Subscribe to changes for a single contact id. Returns an unsubscribe fn. */
  subscribe(contactId: string, listener: Listener): () => void;
  /** Drop all cached entries (listeners are preserved). */
  clear(): void;
}

export function createContactDetailCacheStore(): ContactDetailCacheStore {
  const entries = new Map<string, ContactDetailCacheEntry>();
  const listeners = new Map<string, Set<Listener>>();

  function notify(contactId: string): void {
    const set = listeners.get(contactId);
    if (!set) return;
    for (const listener of set) listener();
  }

  return {
    get(contactId) {
      return entries.get(contactId);
    },
    getSnapshot(contactId) {
      return entries.get(contactId);
    },
    has(contactId) {
      return entries.has(contactId);
    },
    set(contactId, data, loadedAt) {
      const stamp = loadedAt ?? Date.now();
      const existing = entries.get(contactId);
      // Last-write-wins by `loadedAt`: a stale realtime reload that resolves
      // after a newer write must not clobber it.
      if (existing && existing.loadedAt > stamp) return;
      entries.set(contactId, { data, loadedAt: stamp, status: "fresh" });
      notify(contactId);
    },
    markStale(contactId) {
      const existing = entries.get(contactId);
      if (!existing || existing.status === "stale") return;
      entries.set(contactId, { ...existing, status: "stale" });
      notify(contactId);
    },
    subscribe(contactId, listener) {
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
    },
    clear() {
      entries.clear();
    },
  };
}

/** Process-wide singleton for the admin dashboard session. */
export const contactDetailCacheStore = createContactDetailCacheStore();
