"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import type { Contact } from "@/types/database";
import type { ContactDetailBootstrapData } from "@/lib/data/contact-detail";
import { createSoftNavClickHandler } from "../../admin-soft-nav";
import { useAdminContactsData } from "../../admin-data-provider";
import { contactDetailCacheStore } from "../contact-detail-cache";
import { warmContactDetail } from "./contact-detail-loader";
import { ApplicationCard } from "./application-card";
import { ContactDetailRealtime } from "./contact-detail-realtime";
import {
  ContactDetailApplicationsSkeleton,
  ContactDetailSkeleton,
  ContactDetailTimelineSkeleton,
} from "./contact-detail-skeleton";
import { ContactTagsSection } from "./contact-tags-section";
import { ContactEmailSection } from "./contact-email-section";
import { ContactWhatsAppSection } from "./contact-whatsapp-section";
import { PortfolioSectionClient } from "./portfolio-section-client";
import { Timeline } from "./timeline";

const backToContacts = createSoftNavClickHandler("/admin");

/**
 * Client-rendered contact detail, shown inside the persistent admin workspace.
 * Reads bootstrap data from the session cache (`useSyncExternalStore`) so a
 * warm contact renders instantly with no server round-trip. On a cache miss it
 * paints the header/tags from `AdminDataProvider` immediately and loads the
 * timeline/applications in the background. The cache survives the whole session
 * and is unaffected by `revalidatePath`.
 */
export function ContactDetailPanel({
  contactId,
  authorName,
}: {
  contactId: string;
  authorName: string;
}) {
  const subscribe = useCallback(
    (listener: () => void) =>
      contactDetailCacheStore.subscribe(contactId, listener),
    [contactId],
  );
  const entry = useSyncExternalStore(
    subscribe,
    () => contactDetailCacheStore.getSnapshot(contactId),
    () => undefined,
  );

  const { contacts } = useAdminContactsData();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      try {
        setLoadError(null);
        const data = await warmContactDetail(contactId);
        setNotFound(data === null);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load contact.",
        );
      }
    });
  }, [contactId]);

  // Load when there is no fresh cache entry (cache miss or stale-while-
  // revalidate). Mirrors the lazy-load pattern in sibling detail components;
  // all successful data lands in the external store, not component state.
  useEffect(() => {
    if (entry && entry.status === "fresh") return;
    if (notFound || loadError || isPending) return;
    load();
  }, [entry, isPending, load, loadError, notFound]);

  const data = entry?.data ?? null;
  const providerContact = useMemo(
    () => contacts?.find((contact) => contact.id === contactId) ?? null,
    [contacts, contactId],
  );
  const contact = data?.contact ?? providerContact;
  const displayPhone = contact ? displayPhoneFor(data, contact) : null;

  const header = (
    <div className="mb-8">
      <Link
        href="/admin"
        onClick={backToContacts}
        className="mb-2 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        &larr; Back to contacts
      </Link>
      {contact ? (
        <>
          <h1 className="text-[length:var(--font-size-h2)] font-medium text-foreground">
            {contact.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="mr-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                Email
              </span>
              <a
                href={`mailto:${contact.email}`}
                className="text-foreground transition-colors hover:text-primary"
              >
                {contact.email}
              </a>
            </span>
            {displayPhone && (
              <span>
                <span className="mr-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                  Phone
                </span>
                <a
                  href={`tel:${displayPhone}`}
                  className="text-foreground transition-colors hover:text-primary"
                >
                  {displayPhone}
                </a>
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="h-9 w-64 animate-pulse rounded bg-card" />
      )}
    </div>
  );

  // Nothing known yet (deep-link with a cold provider) — full skeleton.
  if (!contact && !data) {
    return (
      <div className="mx-auto max-w-5xl">
        <ContactDetailRealtime contactId={contactId} />
        {loadError ? (
          <ErrorState message={loadError} onRetry={load} pending={isPending} />
        ) : notFound ? (
          <NotFoundState />
        ) : (
          <ContactDetailSkeleton />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <ContactDetailRealtime contactId={contactId} />
      {header}

      {loadError && !data && (
        <ErrorState message={loadError} onRetry={load} pending={isPending} />
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          {data ? (
            data.applications.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No applications yet.
              </p>
            ) : (
              data.applications.map((application) => (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  defaultOpen={false}
                />
              ))
            )
          ) : (
            <ContactDetailApplicationsSkeleton />
          )}

          {data ? (
            <Timeline
              key={`${contactId}:${data.events
                .map((event) => event.id)
                .join(",")}:${data.nextCursor ?? "end"}`}
              contactId={contactId}
              events={data.events}
              hasMore={data.hasMore}
              nextCursor={data.nextCursor}
              authorName={authorName}
            />
          ) : (
            <ContactDetailTimelineSkeleton />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <ContactTagsSection contactId={contactId} />
          <ContactEmailSection contactId={contactId} />
          <ContactWhatsAppSection contactId={contactId} />
          <PortfolioSectionClient profileId={contact?.profile_id ?? null} />
        </div>
      </div>
    </div>
  );
}

function displayPhoneFor(
  data: ContactDetailBootstrapData | null,
  contact: Contact,
): string | null {
  const latestApplication = data?.applications[0] ?? null;
  const latestApplicationPhone =
    latestApplication && typeof latestApplication.answers.phone === "string"
      ? latestApplication.answers.phone
      : null;
  return latestApplicationPhone || contact.phone || null;
}

function ErrorState({
  message,
  onRetry,
  pending,
}: {
  message: string;
  onRetry: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <p className="text-sm text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={pending}
        className="w-fit rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
      >
        {pending ? "Retrying..." : "Retry"}
      </button>
    </div>
  );
}

function NotFoundState() {
  return (
    <p className="text-sm text-muted-foreground">
      This contact could not be found.
    </p>
  );
}
