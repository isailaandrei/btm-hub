"use client";

import { useState } from "react";
import type { ContactDetailBootstrapData } from "@/lib/data/contact-detail";
import { contactDetailCacheStore } from "../contact-detail-cache";

/**
 * Invisible bridge rendered by the server route. Seeds the session cache with
 * server-fetched bootstrap data (embedded in the RSC payload) so a hard load /
 * refresh of `/admin/contacts/:id` populates the same cache the client panel
 * reads — making later in-app navigation to this contact instant.
 *
 * Uses a lazy `useState` initializer (runs once, synchronously, during the
 * first render) rather than an effect, so the store is warm before paint.
 */
export function ContactDetailCacheSeeder({
  data,
}: {
  data: ContactDetailBootstrapData;
}) {
  // Lazy initializer runs once, synchronously, before paint. Guard to the
  // client: this component is SSR'd too, and the store is a module singleton —
  // writing during server render would pollute a process-wide cache shared
  // across requests.
  useState(() => {
    if (typeof window !== "undefined") {
      contactDetailCacheStore.set(data.contact.id, data);
    }
    return null;
  });

  return null;
}
