"use client";

// This context provider serves two purposes:
// 1. Cross-tab caching — data fetched on one tab persists when switching tabs
// 2. Realtime subscription lifecycle — subscriptions stay alive across tab switches
//
// Each dataset is fetched lazily on first tab visit via ensure*() functions.
// Supabase Realtime subscriptions are set up per-table only after the initial
// fetch completes, so Realtime events never race with the first load.

// The applications fetch is bounded and uses an explicit column list, but the
// admin dashboard still keeps the most recent slice client-side. If the table
// grows far beyond the current limit, move this to server-driven pagination.

// TODO: Filter/search state for the contacts tab (name, email, tag filters)
// lives inside the ContactsPanel component and resets when switching tabs.
// If preserving filter state across tab switches is desired, lift it into this
// context.

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type {
  AdminAssigneeProfile,
  Application,
  Contact,
  TagCategory,
  Tag,
  ContactTag,
  ContactEvent,
} from "@/types/database";
import type { ContactActivitySummary } from "@/lib/data/contact-activity-summary";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  buildApplicationProjectionSelect,
  getApplicationProjectionAnswerKeys,
  mergeProjectedApplicationAnswers,
  reassembleProjectedApplications,
  type ContactListApplication,
} from "@/lib/admin/contacts/application-projection";

type FetchState = "idle" | "loading" | "done";

interface AdminApplicationsContextValue {
  applications: ContactListApplication[] | null;
  appsError: string | null;
  ensureApplications: (answerKeys?: Iterable<string>) => void;
  ensureAnswerKeys: (answerKeys: Iterable<string>) => void;
}

interface AdminProfilesContextValue {
  profiles: AdminAssigneeProfile[] | null;
  profilesError: string | null;
  ensureProfiles: () => void;
}

interface AdminContactsContextValue {
  contacts: Contact[] | null;
  tagCategories: TagCategory[] | null;
  tags: Tag[] | null;
  contactTags: ContactTag[] | null;
  contactActivitySummaries: ContactActivitySummary[] | null;
  contactsError: string | null;
  ensureContacts: () => void;
}

interface AdminPreferencesContextValue {
  preferences: Record<string, unknown>;
  setPreferences: Dispatch<SetStateAction<Record<string, unknown>>>;
}

const AdminApplicationsContext =
  createContext<AdminApplicationsContextValue | null>(null);
const AdminProfilesContext =
  createContext<AdminProfilesContextValue | null>(null);
const AdminContactsContext =
  createContext<AdminContactsContextValue | null>(null);
const AdminPreferencesContext =
  createContext<AdminPreferencesContextValue | null>(null);

const MAX_ADMIN_APPLICATIONS = 1000;
const CONTACT_SELECT =
  "id, email, name, phone, profile_id, created_at, updated_at";
const TAG_CATEGORY_SELECT =
  "id, name, color, sort_order, created_at, updated_at";
const TAG_SELECT =
  "id, category_id, name, sort_order, updated_at";
const CONTACT_ACTIVITY_SUMMARY_SELECT =
  "contact_id, last_event_type, last_event_custom_label, last_event_at, awaiting_applicant, awaiting_btm, latest_app_submitted_at";
const TAGS_REFETCH_DEBOUNCE_MS = 200;

function sortContactsByName(items: Contact[]): Contact[] {
  return [...items].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
    }),
  );
}

function upsertSortedContact(
  items: Contact[] | null,
  nextContact: Contact,
): Contact[] {
  const withoutCurrent = (items ?? []).filter(
    (contact) => contact.id !== nextContact.id,
  );
  return sortContactsByName([...withoutCurrent, nextContact]);
}

export function useAdminApplicationsData() {
  const ctx = useContext(AdminApplicationsContext);
  if (!ctx) {
    throw new Error(
      "useAdminApplicationsData must be used within AdminDataProvider",
    );
  }
  return ctx;
}

export function useAdminProfilesData() {
  const ctx = useContext(AdminProfilesContext);
  if (!ctx) {
    throw new Error(
      "useAdminProfilesData must be used within AdminDataProvider",
    );
  }
  return ctx;
}

export function useAdminContactsData() {
  const ctx = useContext(AdminContactsContext);
  if (!ctx) {
    throw new Error(
      "useAdminContactsData must be used within AdminDataProvider",
    );
  }
  return ctx;
}

export function useAdminPreferencesData() {
  const ctx = useContext(AdminPreferencesContext);
  if (!ctx) {
    throw new Error(
      "useAdminPreferencesData must be used within AdminDataProvider",
    );
  }
  return ctx;
}

export function AdminDataProvider({
  children,
  initialPreferences = {},
}: {
  children: ReactNode;
  initialPreferences?: Record<string, unknown>;
}) {
  const [applications, setApplications] = useState<
    ContactListApplication[] | null
  >(null);
  const [profiles, setProfiles] = useState<AdminAssigneeProfile[] | null>(null);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [profilesError, setProfilesError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [tagCategories, setTagCategories] = useState<TagCategory[] | null>(null);
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [contactTags, setContactTags] = useState<ContactTag[] | null>(null);
  const [contactActivitySummaries, setContactActivitySummaries] =
    useState<ContactActivitySummary[] | null>(null);
  const [contactsError, setContactsError] = useState<string | null>(null);

  const [preferences, setPreferences] =
    useState<Record<string, unknown>>(initialPreferences);

  const appsFetchState = useRef<FetchState>("idle");
  const profilesFetchState = useRef<FetchState>("idle");
  const contactsFetchState = useRef<FetchState>("idle");
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const tagCategoriesRefetchTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagsRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const activitySummaryRefetchTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingActivitySummaryContactIdsRef = useRef<Set<string>>(new Set());
  const applicationsTruncatedNoticeShownRef = useRef(false);
  const requestedApplicationAnswerKeysRef = useRef<Set<string>>(new Set());
  const loadedApplicationAnswerKeysRef = useRef<Set<string>>(new Set());
  const applicationsChannelStartedRef = useRef(false);

  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const scheduleContactActivitySummaryRefetch = useCallback((contactId: string | null | undefined) => {
    if (!contactId) return;
    pendingActivitySummaryContactIdsRef.current.add(contactId);
    clearTimeout(activitySummaryRefetchTimeoutRef.current ?? undefined);

    activitySummaryRefetchTimeoutRef.current = setTimeout(async () => {
      const ids = [...pendingActivitySummaryContactIdsRef.current];
      pendingActivitySummaryContactIdsRef.current.clear();
      if (ids.length === 0) return;

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("contact_activity_summary")
        .select(CONTACT_ACTIVITY_SUMMARY_SELECT)
        .in("contact_id", ids);

      if (error) {
        toast.error("Failed to refresh contact activity.");
        return;
      }

      const nextSummaries =
        (data ?? []) as unknown as ContactActivitySummary[];
      setContactActivitySummaries((previous) => {
        const byContactId = new Map(
          (previous ?? []).map((summary) => [summary.contact_id, summary]),
        );
        for (const summary of nextSummaries) {
          byContactId.set(summary.contact_id, summary);
        }
        return [...byContactId.values()];
      });
    }, TAGS_REFETCH_DEBOUNCE_MS);
  }, []);

  const requestApplicationAnswerKeys = useCallback((keys: Iterable<string>) => {
    for (const key of getApplicationProjectionAnswerKeys(keys)) {
      requestedApplicationAnswerKeysRef.current.add(key);
    }
  }, []);

  const startApplicationsFetch = useCallback((mode: "replace" | "merge") => {
    if (appsFetchState.current === "loading") return;
    appsFetchState.current = "loading";

    const supabase = getSupabase();

    async function fetchApplications() {
      const projection = buildApplicationProjectionSelect(
        requestedApplicationAnswerKeysRef.current,
      );
      const { data, error, count } = await supabase
        .from("applications")
        .select(projection.select, { count: mode === "replace" ? "exact" : undefined })
        .order("submitted_at", { ascending: false })
        .range(0, MAX_ADMIN_APPLICATIONS - 1);

      if (error) {
        // Reset to idle so the next ensure call retries the fetch.
        appsFetchState.current = "idle";
        setAppsError("Failed to load applications.");
        toast.error("Failed to load applications. Please try again.");
        return;
      }

      const projectedApplications = reassembleProjectedApplications(
        (data ?? []) as unknown as Array<Record<string, unknown>>,
        projection.answerKeys,
      );

      setAppsError(null);
      setApplications((previous) =>
        mode === "merge"
          ? mergeProjectedApplicationAnswers(previous, projectedApplications)
          : projectedApplications,
      );
      for (const key of projection.answerKeys) {
        loadedApplicationAnswerKeysRef.current.add(key);
      }
      if (
        (count ?? 0) > MAX_ADMIN_APPLICATIONS &&
        !applicationsTruncatedNoticeShownRef.current
      ) {
        applicationsTruncatedNoticeShownRef.current = true;
        toast.warning(
          `Showing the most recent ${MAX_ADMIN_APPLICATIONS} applications in the admin dashboard.`,
        );
      }
      appsFetchState.current = "done";

      // Subscribe to Realtime only after the initial fetch succeeds
      if (applicationsChannelStartedRef.current) {
        const missingKeys = [...requestedApplicationAnswerKeysRef.current].filter(
          (key) => !loadedApplicationAnswerKeysRef.current.has(key),
        );
        if (missingKeys.length > 0) startApplicationsFetch("merge");
        return;
      }
      applicationsChannelStartedRef.current = true;

      const channel = supabase
        .channel("admin-applications")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "applications" },
          (payload) => {
            const next = payload.new as Application;
            scheduleContactActivitySummaryRefetch(next.contact_id);
            setApplications((prev) => [
              {
                id: next.id,
                contact_id: next.contact_id,
                program: next.program,
                submitted_at: next.submitted_at,
                answers: next.answers,
              },
              ...(prev ?? []),
            ]);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "applications" },
          (payload) => {
            // Merge instead of replace: Supabase Realtime can send a partial
            // `new` payload (only the changed columns + PK) when the table's
            // REPLICA IDENTITY isn't FULL, which would otherwise wipe fields
            // like `answers` from our in-memory copy.
            const next = payload.new as Partial<Application> & { id: string };
            scheduleContactActivitySummaryRefetch(next.contact_id);
            setApplications((prev) =>
              (prev ?? []).map((a) =>
                a.id === next.id
                  ? {
                      ...a,
                      ...next,
                      answers: {
                        ...a.answers,
                        ...(next.answers ?? {}),
                      },
                    }
                  : a,
              ),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "applications" },
          (payload) => {
            scheduleContactActivitySummaryRefetch(
              (payload.old as Partial<Application>).contact_id,
            );
            setApplications((prev) =>
              (prev ?? []).filter((a) => a.id !== (payload.old as Application).id)
            );
          },
        )
        .subscribe();

      channelsRef.current.push(channel);

      const missingKeys = [...requestedApplicationAnswerKeysRef.current].filter(
        (key) => !loadedApplicationAnswerKeysRef.current.has(key),
      );
      if (missingKeys.length > 0) startApplicationsFetch("merge");
    }

    fetchApplications();
  }, []);

  const ensureAnswerKeys = useCallback((answerKeys: Iterable<string>) => {
    requestApplicationAnswerKeys(answerKeys);
    const missingKeys = [...requestedApplicationAnswerKeysRef.current].filter(
      (key) => !loadedApplicationAnswerKeysRef.current.has(key),
    );
    if (missingKeys.length === 0) return;
    if (appsFetchState.current === "idle") {
      startApplicationsFetch("replace");
    } else if (appsFetchState.current === "done") {
      startApplicationsFetch("merge");
    }
  }, [requestApplicationAnswerKeys, startApplicationsFetch]);

  const ensureApplications = useCallback((answerKeys: Iterable<string> = []) => {
    requestApplicationAnswerKeys(answerKeys);
    if (appsFetchState.current === "idle") {
      startApplicationsFetch("replace");
    }
  }, [requestApplicationAnswerKeys, startApplicationsFetch]);

  const ensureProfiles = useCallback(() => {
    if (profilesFetchState.current !== "idle") return;
    profilesFetchState.current = "loading";

    const supabase = getSupabase();

    async function fetchProfiles() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, role, display_name, avatar_url, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (error) {
        profilesFetchState.current = "idle";
        setProfilesError("Failed to load profiles.");
        toast.error("Failed to load profiles. Please try again.");
        return;
      }

      setProfilesError(null);
      setProfiles(data ?? []);
      profilesFetchState.current = "done";

      const channel = supabase
        .channel("admin-profiles")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "profiles" },
          (payload) => {
            setProfiles((prev) => [
              payload.new as AdminAssigneeProfile,
              ...(prev ?? []),
            ]);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles" },
          (payload) => {
            // Merge instead of replace — same partial-payload concern as the
            // applications handler above (Supabase Realtime can omit unchanged
            // columns when REPLICA IDENTITY isn't FULL).
            const next = payload.new as Partial<AdminAssigneeProfile> & {
              id: string;
            };
            setProfiles((prev) =>
              (prev ?? []).map((p) => (p.id === next.id ? { ...p, ...next } : p)),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "profiles" },
          (payload) => {
            setProfiles((prev) =>
              (prev ?? []).filter(
                (p) => p.id !== (payload.old as AdminAssigneeProfile).id,
              )
            );
          },
        )
        .subscribe();

      channelsRef.current.push(channel);
    }

    fetchProfiles();
  }, []);

  const ensureContacts = useCallback(() => {
    if (contactsFetchState.current !== "idle") return;
    contactsFetchState.current = "loading";

    const supabase = getSupabase();

    async function fetchContacts() {
      const [
        { data: contactsData, error: contactsErr },
        { data: tagCategoriesData, error: tagCategoriesErr },
        { data: tagsData, error: tagsErr },
        { data: contactTagsData, error: contactTagsErr },
        { data: contactActivitySummariesData, error: contactActivitySummariesErr },
      ] = await Promise.all([
        supabase.from("contacts").select(CONTACT_SELECT).order("name"),
        supabase
          .from("tag_categories")
          .select(TAG_CATEGORY_SELECT)
          .order("sort_order"),
        supabase.from("tags").select(TAG_SELECT).order("sort_order"),
        supabase.from("contact_tags").select("*"),
        supabase
          .from("contact_activity_summary")
          .select(CONTACT_ACTIVITY_SUMMARY_SELECT),
      ]);

      const fetchError =
        contactsErr ?? tagCategoriesErr ?? tagsErr ?? contactTagsErr ?? contactActivitySummariesErr;
      if (fetchError) {
        contactsFetchState.current = "idle";
        setContactsError("Failed to load contacts.");
        toast.error("Failed to load contacts. Please try again.");
        return;
      }

      setContactsError(null);
      setContacts(contactsData ?? []);
      setTagCategories(tagCategoriesData ?? []);
      setTags(tagsData ?? []);
      setContactTags(contactTagsData ?? []);
      setContactActivitySummaries(
        (contactActivitySummariesData ?? []) as unknown as ContactActivitySummary[],
      );
      contactsFetchState.current = "done";

      // Subscribe to Realtime only after the initial fetch succeeds
      const contactsChannel = supabase
        .channel("admin-contacts")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "contacts" },
          (payload) => {
            setContacts((prev) =>
              upsertSortedContact(prev, payload.new as Contact),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "contacts" },
          (payload) => {
            // Merge into the existing contact rather than overwriting; see
            // applications/profiles handlers above for the rationale.
            const next = payload.new as Partial<Contact> & { id: string };
            setContacts((prev) => {
              const existing = (prev ?? []).find((c) => c.id === next.id);
              const merged = existing ? { ...existing, ...next } : (next as Contact);
              return upsertSortedContact(prev, merged);
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "contacts" },
          (payload) => {
            setContacts((prev) =>
              (prev ?? []).filter((c) => c.id !== (payload.old as Contact).id)
            );
          },
        )
        .subscribe();

      const contactTagsChannel = supabase
        .channel("admin-contact-tags")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "contact_tags" },
          (payload) => {
            setContactTags((prev) => [...(prev ?? []), payload.new as ContactTag]);
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "contact_tags" },
          (payload) => {
            const deleted = payload.old as ContactTag;
            setContactTags((prev) =>
              (prev ?? []).filter(
                (ct) => !(ct.contact_id === deleted.contact_id && ct.tag_id === deleted.tag_id)
              )
            );
          },
        )
        .subscribe();

      const tagCategoriesChannel = supabase
        .channel("admin-tag-categories")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tag_categories" },
          async () => {
            clearTimeout(tagCategoriesRefetchTimeoutRef.current ?? undefined);
            tagCategoriesRefetchTimeoutRef.current = setTimeout(async () => {
              const { data } = await supabase
                .from("tag_categories")
                .select(TAG_CATEGORY_SELECT)
                .order("sort_order");
              if (data) setTagCategories(data);
            }, TAGS_REFETCH_DEBOUNCE_MS);
          },
        )
        .subscribe();

      const tagsChannel = supabase
        .channel("admin-tags")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tags" },
          async () => {
            clearTimeout(tagsRefetchTimeoutRef.current ?? undefined);
            tagsRefetchTimeoutRef.current = setTimeout(async () => {
              const { data } = await supabase
                .from("tags")
                .select(TAG_SELECT)
                .order("sort_order");
              if (data) setTags(data);
            }, TAGS_REFETCH_DEBOUNCE_MS);
          },
        )
        .subscribe();

      const contactEventsChannel = supabase
        .channel("admin-contact-events")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "contact_events" },
          (payload) => {
            scheduleContactActivitySummaryRefetch(
              (payload.new as ContactEvent).contact_id,
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "contact_events" },
          (payload) => {
            scheduleContactActivitySummaryRefetch(
              (payload.new as Partial<ContactEvent>).contact_id,
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "contact_events" },
          (payload) => {
            scheduleContactActivitySummaryRefetch(
              (payload.old as Partial<ContactEvent>).contact_id,
            );
          },
        )
        .subscribe();

      channelsRef.current.push(contactsChannel, contactTagsChannel, tagCategoriesChannel, tagsChannel, contactEventsChannel);
    }

    fetchContacts();
  }, []);

  // Cleanup only the channels that were actually created
  useEffect(() => {
    return () => {
      const supabase = supabaseRef.current;
      if (!supabase) return;
      clearTimeout(tagCategoriesRefetchTimeoutRef.current ?? undefined);
      clearTimeout(tagsRefetchTimeoutRef.current ?? undefined);
      clearTimeout(activitySummaryRefetchTimeoutRef.current ?? undefined);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- channelsRef is intentionally read at cleanup time to get the latest channels
      for (const channel of channelsRef.current) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const applicationsValue = useMemo(
    () => ({
      applications,
      appsError,
      ensureApplications,
      ensureAnswerKeys,
    }),
    [applications, appsError, ensureApplications, ensureAnswerKeys],
  );

  const profilesValue = useMemo(
    () => ({
      profiles,
      profilesError,
      ensureProfiles,
    }),
    [profiles, profilesError, ensureProfiles],
  );

  const contactsValue = useMemo(
    () => ({
      contacts,
      tagCategories,
      tags,
      contactTags,
      contactActivitySummaries,
      contactsError,
      ensureContacts,
    }),
    [
      contacts,
      tagCategories,
      tags,
      contactTags,
      contactActivitySummaries,
      contactsError,
      ensureContacts,
    ],
  );

  const preferencesValue = useMemo(
    () => ({
      preferences,
      setPreferences,
    }),
    [
      preferences,
      setPreferences,
    ],
  );

  return (
    <AdminApplicationsContext.Provider value={applicationsValue}>
      <AdminProfilesContext.Provider value={profilesValue}>
        <AdminContactsContext.Provider value={contactsValue}>
          <AdminPreferencesContext.Provider value={preferencesValue}>
            {children}
          </AdminPreferencesContext.Provider>
        </AdminContactsContext.Provider>
      </AdminProfilesContext.Provider>
    </AdminApplicationsContext.Provider>
  );
}
