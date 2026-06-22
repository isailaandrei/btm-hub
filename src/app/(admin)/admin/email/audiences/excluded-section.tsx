"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Plus, Search, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import {
  formatSuppressionReason,
  formatSuppressionSource,
} from "@/lib/email/suppression-reason";
import type { EmailExclusionRow } from "@/lib/data/email-suppressions";
import {
  excludeContactFromEmailAction,
  liftEmailExclusionAction,
} from "../actions";
import { useAdminEmailData } from "../admin-email-data-provider";

interface PickerContact {
  id: string;
  name: string;
  email: string;
}

function formatExcludedOn(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function ExcludedSection() {
  // Exclusions + the contacts picker are cached in the provider, so they
  // survive tab switches and admin navigation — same as Compose/Sent.
  const {
    exclusions,
    exclusionsError: loadError,
    ensureExclusions,
    refreshExclusions,
    setExclusions,
    audienceContacts: contacts,
    audienceContactsError: contactsError,
    ensureAudienceContacts,
  } = useAdminEmailData();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isLoading, startLoadTransition] = useTransition();
  const [isRemoving, startRemoveTransition] = useTransition();

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [excludingId, setExcludingId] = useState<string | null>(null);
  const [isExcluding, startExcludeTransition] = useTransition();

  function reload() {
    startLoadTransition(async () => {
      await refreshExclusions();
    });
  }

  useEffect(() => {
    void ensureExclusions({ quiet: true });
  }, [ensureExclusions]);

  function openPicker() {
    setIsPickerOpen(true);
    setContactQuery("");
    void ensureAudienceContacts();
  }

  // Contacts already excluded (by id or email) are filtered out of the picker.
  const excludedKeys = useMemo(() => {
    const ids = new Set<string>();
    const emails = new Set<string>();
    for (const row of exclusions ?? []) {
      if (row.contactId) ids.add(row.contactId);
      emails.add(row.email.toLowerCase());
    }
    return { ids, emails };
  }, [exclusions]);

  const results = useMemo(() => {
    if (!contacts) return [];
    const query = contactQuery.trim().toLowerCase();
    if (!query) return [];
    return contacts
      .filter(
        (contact) =>
          !excludedKeys.ids.has(contact.id) &&
          !excludedKeys.emails.has(contact.email.toLowerCase()),
      )
      .filter(
        (contact) =>
          contact.name.toLowerCase().includes(query) ||
          contact.email.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [contacts, contactQuery, excludedKeys]);

  function handleExclude(contact: PickerContact) {
    setExcludingId(contact.id);
    startExcludeTransition(async () => {
      try {
        await excludeContactFromEmailAction(contact.id);
        await refreshExclusions();
        toast.success(`${contact.name} excluded from all email.`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to exclude contact.",
        );
      } finally {
        setExcludingId(null);
      }
    });
  }

  function handleRemove(row: EmailExclusionRow) {
    setRemovingId(row.id);
    startRemoveTransition(async () => {
      try {
        await liftEmailExclusionAction(row.id);
        setExclusions((current) =>
          (current ?? []).filter((item) => item.id !== row.id),
        );
        toast.success(`${row.contactName ?? row.email} can receive email again.`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to remove exclusion.",
        );
      } finally {
        setRemovingId(null);
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-foreground">
              Excluded recipients
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              People here receive no email of any kind, even when they belong to
              a list or match a segment. Unsubscribes and provider
              bounces/complaints land here automatically.
            </p>
          </div>
          {!isPickerOpen && (
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              Exclude a contact
            </button>
          )}
        </div>

        {isPickerOpen && (
          <div className="relative mt-3 max-w-md">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={contactQuery}
                onChange={(event) => setContactQuery(event.target.value)}
                placeholder="Search a contact to exclude..."
                className="h-9 flex-1 bg-transparent text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="shrink-0 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Done
              </button>
            </div>
            {contactQuery.trim() && (
              <div className="absolute z-10 mt-1 max-h-[240px] w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
                {contactsError ? (
                  <p className="px-3 py-2 text-sm text-destructive">
                    {contactsError}
                  </p>
                ) : contacts === null ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    Loading contacts...
                  </p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    No matching contacts (or all matches are already excluded).
                  </p>
                ) : (
                  results.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => handleExclude(contact)}
                      disabled={isExcluding && excludingId === contact.id}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {contact.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {contact.email}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-destructive">
                        {isExcluding && excludingId === contact.id
                          ? "Excluding…"
                          : "Exclude"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {loadError ? (
        <div className="flex flex-col gap-3 px-4 py-6">
          <p className="text-sm text-destructive">{loadError}</p>
          <button
            type="button"
            onClick={reload}
            disabled={isLoading}
            className="w-fit rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
          >
            {isLoading ? "Retrying..." : "Retry"}
          </button>
        </div>
      ) : exclusions === null ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading excluded recipients...
        </div>
      ) : exclusions.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <ShieldOff className="h-4 w-4" />
          No one is excluded yet.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {exclusions.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(220px,1.4fr)_minmax(140px,auto)_minmax(120px,auto)_minmax(120px,auto)_auto] md:items-center"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {row.contactName ?? row.email}
                </p>
                {row.contactName && (
                  <p className="truncate text-xs text-muted-foreground">
                    {row.email}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {formatSuppressionReason(row.reason)}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatExcludedOn(row.createdAt)}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatSuppressionSource({
                  reason: row.reason,
                  provider: row.provider,
                })}
              </span>
              <div className="flex md:justify-end">
                <button
                  type="button"
                  onClick={() => handleRemove(row)}
                  disabled={isRemoving && removingId === row.id}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  {isRemoving && removingId === row.id ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
