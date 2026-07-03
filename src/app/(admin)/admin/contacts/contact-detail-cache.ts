import type {
  ContactDetailBootstrapData,
  ContactDetailSectionsData,
} from "@/lib/data/contact-detail";

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

/**
 * Where an entry's `data.sections` came from:
 * - `"seed"` — this page load's server bootstrap; fresh by construction, so a
 *   mounting panel can render it WITHOUT background revalidation.
 * - `"cached"` — carried over from an earlier visit or written back by a
 *   section's client load; sections without full realtime coverage (email
 *   status has none while unmounted) may have changed since, so a mounting
 *   panel renders it instantly but ALWAYS revalidates in the background
 *   (stale-while-revalidate — same guarantee class as the core bootstrap).
 */
export type ContactDetailSectionsSource = "seed" | "cached";

export interface ContactDetailCacheEntry {
  data: ContactDetailBootstrapData;
  status: ContactDetailCacheStatus;
  /** Monotonic-ish write stamp (ms epoch). Newer or equal writes win. */
  loadedAt: number;
  /** Present iff `data.sections` is — see ContactDetailSectionsSource. */
  sectionsSource?: ContactDetailSectionsSource;
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
  /**
   * Like `set`, but SAFE TO CALL DURING RENDER: the entry is written
   * synchronously (so a subscriber's `getSnapshot` reads it immediately) while
   * the subscriber notification is deferred to a microtask, past the render
   * commit. The server-route seeder runs during render, and a synchronous
   * notify there would `setState` a subscribed panel mid-render (a React
   * "update while rendering a different component" violation).
   */
  seed(
    contactId: string,
    data: ContactDetailBootstrapData,
    loadedAt?: number,
  ): void;
  /** Keep cached data but flag it for stale-while-revalidate on next open. */
  markStale(contactId: string): void;
  /**
   * Write back one or more section slices from a client-side load, so a
   * revisit in the same session renders them instantly (then revalidates —
   * merged sections are always `"cached"`). If the core bootstrap hasn't
   * landed yet (React serializes Server Actions, so a section's load can
   * resolve before the panel's core load), the slices are buffered and folded
   * into the next `set`/`seed` for this contact.
   */
  mergeSections(
    contactId: string,
    sections: Partial<ContactDetailSectionsData>,
  ): void;
  /** Subscribe to changes for a single contact id. Returns an unsubscribe fn. */
  subscribe(contactId: string, listener: Listener): () => void;
  /** Drop all cached entries (listeners are preserved). */
  clear(): void;
}

/** Cap on cached contact-detail entries. Bounds memory over a long session
 *  where many contacts are opened/hovered; the on-screen contact (which has an
 *  active listener) is never evicted. */
const MAX_CACHE_ENTRIES = 50;

const EMPTY_SECTIONS: ContactDetailSectionsData = {
  emailStatus: null,
  tagSection: null,
  whatsappMessages: null,
};

export function createContactDetailCacheStore(): ContactDetailCacheStore {
  const entries = new Map<string, ContactDetailCacheEntry>();
  const listeners = new Map<string, Set<Listener>>();
  /** Section write-backs that arrived before the core bootstrap (see mergeSections). */
  const pendingSections = new Map<string, Partial<ContactDetailSectionsData>>();

  /**
   * Fold section data into an incoming core write. A payload that brings its
   * own sections is a fresh server seed and wins outright; a core-only payload
   * (client loaders, realtime refreshes) must NOT drop sections the session
   * already has — they're carried over as `"cached"`, together with any
   * buffered write-backs.
   */
  function foldSections(
    contactId: string,
    data: ContactDetailBootstrapData,
    existing: ContactDetailCacheEntry | undefined,
  ): { data: ContactDetailBootstrapData; sectionsSource?: ContactDetailSectionsSource } {
    const pending = pendingSections.get(contactId);
    pendingSections.delete(contactId);

    if (data.sections) return { data, sectionsSource: "seed" };

    const carried = existing?.data.sections;
    if (!carried && !pending) return { data };

    return {
      data: {
        ...data,
        sections: { ...EMPTY_SECTIONS, ...carried, ...pending },
      },
      sectionsSource: "cached",
    };
  }

  function notify(contactId: string): void {
    const set = listeners.get(contactId);
    if (!set) return;
    for (const listener of set) listener();
  }

  // FIFO eviction (Map iterates in insertion order) that skips any entry with an
  // active subscriber, so the currently-displayed contact is never dropped.
  function evictIfNeeded(): void {
    if (entries.size <= MAX_CACHE_ENTRIES) return;
    for (const key of entries.keys()) {
      if (entries.size <= MAX_CACHE_ENTRIES) break;
      if ((listeners.get(key)?.size ?? 0) > 0) continue;
      entries.delete(key);
    }
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
      const folded = foldSections(contactId, data, existing);
      entries.set(contactId, {
        data: folded.data,
        loadedAt: stamp,
        sectionsSource: folded.sectionsSource,
        status: "fresh",
      });
      evictIfNeeded();
      notify(contactId);
    },
    seed(contactId, data, loadedAt) {
      const stamp = loadedAt ?? Date.now();
      const existing = entries.get(contactId);
      if (existing && existing.loadedAt > stamp) return;
      const folded = foldSections(contactId, data, existing);
      entries.set(contactId, {
        data: folded.data,
        loadedAt: stamp,
        sectionsSource: folded.sectionsSource,
        status: "fresh",
      });
      evictIfNeeded();
      // Write synchronously above (getSnapshot sees it), but defer the notify to
      // a microtask so it lands AFTER the render commit — the seeder calls this
      // during render, where a synchronous notify would setState a subscribed
      // panel mid-render.
      queueMicrotask(() => notify(contactId));
    },
    markStale(contactId) {
      const existing = entries.get(contactId);
      if (!existing || existing.status === "stale") return;
      entries.set(contactId, { ...existing, status: "stale" });
      notify(contactId);
    },
    mergeSections(contactId, sections) {
      const existing = entries.get(contactId);
      if (!existing) {
        pendingSections.set(contactId, {
          ...pendingSections.get(contactId),
          ...sections,
        });
        // Same FIFO bound as the entry map: a buffer only outlives a moment if
        // the core load failed, so don't let those orphans accumulate.
        if (pendingSections.size > MAX_CACHE_ENTRIES) {
          const oldest = pendingSections.keys().next().value;
          if (oldest !== undefined) pendingSections.delete(oldest);
        }
        return;
      }
      entries.set(contactId, {
        ...existing,
        data: {
          ...existing.data,
          sections: {
            ...EMPTY_SECTIONS,
            ...existing.data.sections,
            ...sections,
          },
        },
        sectionsSource: "cached",
      });
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
      pendingSections.clear();
    },
  };
}

/** Process-wide singleton for the admin dashboard session. */
export const contactDetailCacheStore = createContactDetailCacheStore();
