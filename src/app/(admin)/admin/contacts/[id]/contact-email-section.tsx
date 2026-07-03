"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import type { EmailSuppressionReason } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import type { RollbackHandle } from "../../admin-optimistic-mutations";
import { ContactEmailExclusion } from "./contact-email-exclusion";
import { loadContactEmailSection } from "../actions";

type ContactEmailSectionData = Awaited<
  ReturnType<typeof loadContactEmailSection>
>;

const REALTIME_DEBOUNCE_MS = 150;

/**
 * Email (do-not-email) section of the contact detail panel. Renders
 * server-seeded data when the deep-link bootstrap provides it (`initialData`),
 * otherwise lazy-loads its own status via a server action with a
 * skeleton/error+retry. Cached (non-seed) data renders instantly and is
 * revalidated in the background (`revalidateInitialData`) — suppressions can
 * change while this contact isn't on screen. While mounted, a Supabase
 * Realtime channel on `email_suppressions` keeps the status live across
 * admins: rows are matched by contact_id OR email (pipeline
 * bounces/unsubscribes may be keyed by email only), so the channel binds both
 * filters. Successful loads are written back to the session cache via
 * `onDataLoaded` so a revisit paints instantly.
 */
export function ContactEmailSection({
  contactId,
  contactEmail = null,
  initialData = null,
  revalidateInitialData = false,
  onDataLoaded,
}: {
  contactId: string;
  /** Needed for the email-keyed realtime binding; null skips that binding. */
  contactEmail?: string | null;
  initialData?: ContactEmailSectionData | null;
  /** True when `initialData` is session-cached rather than a fresh server seed. */
  revalidateInitialData?: boolean;
  /** Session-cache write-back — called with every successfully loaded status. */
  onDataLoaded?: (data: ContactEmailSectionData) => void;
}) {
  const [data, setData] = useState<ContactEmailSectionData | null>(initialData);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const applyData = useCallback(
    (next: ContactEmailSectionData) => {
      setData(next);
      onDataLoaded?.(next);
    },
    [onDataLoaded],
  );

  const loadData = useCallback(() => {
    startTransition(async () => {
      try {
        setLoadError(null);
        applyData(await loadContactEmailSection(contactId));
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load email status.",
        );
      }
    });
  }, [applyData, contactId]);

  // Optimistic toggle for the exclusion control: flip the rendered status
  // immediately and return a targeted rollback (restore the exact prior value)
  // for the child to call if the server write fails. A successful write
  // reconciles via the child's `onChanged` re-read (and realtime while mounted).
  const applyOptimisticExclusion = useCallback(
    (
      excluded: boolean,
      reason: EmailSuppressionReason | null,
    ): RollbackHandle => {
      let previous: ContactEmailSectionData | null = null;
      setData((current) => {
        previous = current;
        return { excluded, reason };
      });
      return { rollback: () => setData(previous) };
    },
    [],
  );

  useEffect(() => {
    if (data || isPending || loadError) return;
    loadData();
  }, [data, isPending, loadData, loadError]);

  // Stale-while-revalidate for cached initial data: it renders immediately
  // above, and one background re-read reconciles anything that changed while
  // this contact wasn't on screen (there is no unmounted realtime coverage).
  const revalidatedRef = useRef(false);
  useEffect(() => {
    if (!revalidateInitialData || !initialData || revalidatedRef.current) {
      return;
    }
    revalidatedRef.current = true;
    loadData();
  }, [initialData, loadData, revalidateInitialData]);

  // Live cross-admin updates while mounted: another admin's toggle (or a
  // pipeline bounce/unsubscribe) re-reads the status. Debounced like the
  // sibling WhatsApp section; reloads bypass the transition so the current
  // status stays rendered while the fresh one is fetched.
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    let active = true;
    const supabase = createClient();

    function scheduleReload() {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(() => {
        void loadContactEmailSection(contactId)
          .then((next) => {
            if (active) applyData(next);
          })
          .catch((error) => {
            console.error(
              `Failed to refresh email status for contact ${contactId} from realtime change`,
              error,
            );
          });
      }, REALTIME_DEBOUNCE_MS);
    }

    const channel = supabase
      .channel(`contact-email-suppressions-${contactId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "email_suppressions",
          filter: `contact_id=eq.${contactId}`,
        },
        scheduleReload,
      );
    if (contactEmail) {
      // Same normalization as the suppression writes (normalizeEmail).
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "email_suppressions",
          filter: `email=eq.${contactEmail.trim().toLowerCase()}`,
        },
        scheduleReload,
      );
    }
    channel.subscribe();

    return () => {
      active = false;
      clearTimeout(refreshTimeoutRef.current);
      void supabase.removeChannel(channel);
    };
  }, [applyData, contactId, contactEmail]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">Email</CardTitle>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-destructive">{loadError}</p>
            <button
              type="button"
              onClick={loadData}
              disabled={isPending}
              className="w-fit rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
            >
              {isPending ? "Retrying..." : "Retry"}
            </button>
          </div>
        ) : data ? (
          <ContactEmailExclusion
            contactId={contactId}
            excluded={data.excluded}
            reason={data.reason}
            onChanged={loadData}
            onOptimisticChange={applyOptimisticExclusion}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-7 w-36 animate-pulse rounded bg-muted" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
