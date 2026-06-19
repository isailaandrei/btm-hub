"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactEmailExclusion } from "./contact-email-exclusion";
import { loadContactEmailSection } from "../actions";

type ContactEmailSectionData = Awaited<
  ReturnType<typeof loadContactEmailSection>
>;

/**
 * Email (do-not-email) section of the contact detail panel. Mirrors
 * `ContactTagsSection`: lazy-loads its own status via a server action (the
 * session-cache panel doesn't carry it), shows a skeleton/error+retry, and
 * re-reads after a toggle since `revalidatePath` doesn't refresh the cache.
 */
export function ContactEmailSection({ contactId }: { contactId: string }) {
  const [data, setData] = useState<ContactEmailSectionData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(() => {
    startTransition(async () => {
      try {
        setLoadError(null);
        setData(await loadContactEmailSection(contactId));
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load email status.",
        );
      }
    });
  }, [contactId]);

  useEffect(() => {
    if (data || isPending || loadError) return;
    loadData();
  }, [data, isPending, loadData, loadError]);

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
