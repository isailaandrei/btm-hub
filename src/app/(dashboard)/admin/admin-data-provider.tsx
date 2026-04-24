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
import type { Application, Profile, Contact, TagCategory, Tag, ContactTag, ContactEvent } from "@/types/database";
import type { ContactEventSummary } from "@/lib/data/contact-events";
import type { RealtimeChannel } from "@supabase/supabase-js";

type FetchState = "idle" | "loading" | "done";

interface AdminApplicationsContextValue {
  applications: Application[] | null;
  appsError: string | null;
  ensureApplications: () => void;
}

interface AdminProfilesContextValue {
  profiles: Profile[] | null;
  profilesError: string | null;
  ensureProfiles: () => void;
}

interface AdminContactsContextValue {
  contacts: Contact[] | null;
  tagCategories: TagCategory[] | null;
  tags: Tag[] | null;
  contactTags: ContactTag[] | null;
  contactEventSummaries: ContactEventSummary[] | null;
  contactsError: string | null;
  ensureContacts: () => void;
}

interface AdminPreferencesContextValue {
  preferences: Record<string, unknown>;
  setPreferences: Dispatch<SetStateAction<Record<string, unknown>>>;
  ensurePreferences: () => void;
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
const APPLICATION_SELECT =
  "id, user_id, contact_id, program, status, answers, tags, admin_notes, submitted_at, updated_at";
const CONTACT_SELECT =
  "id, email, name, phone, profile_id, created_at, updated_at";
const TAG_CATEGORY_SELECT =
  "id, name, color, sort_order, created_at, updated_at";
const TAG_SELECT =
  "id, category_id, name, sort_order, updated_at";
const CONTACT_EVENT_SUMMARY_SELECT =
  "id, contact_id, type, custom_label, happened_at, resolved_at";
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

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [profilesError, setProfilesError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [tagCategories, setTagCategories] = useState<TagCategory[] | null>(null);
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [contactTags, setContactTags] = useState<ContactTag[] | null>(null);
  const [contactEventSummaries, setContactEventSummaries] =
    useState<ContactEventSummary[] | null>(null);
  const [contactsError, setContactsError] = useState<string | null>(null);

  const [preferences, setPreferences] = useState<Record<string, unknown>>({});

  const appsFetchState = useRef<FetchState>("idle");
  const profilesFetchState = useRef<FetchState>("idle");
  const contactsFetchState = useRef<FetchState>("idle");
  const preferencesFetchState = useRef<FetchState>("idle");
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const tagCategoriesRefetchTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagsRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const applicationsTruncatedNoticeShownRef = useRef(false);

  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const ensureApplications = useCallback(() => {
    if (appsFetchState.current !== "idle") return;
    appsFetchState.current = "loading";

    const supabase = getSupabase();

    async function fetchApplications() {
      const { data, error, count } = await supabase
        .from("applications")
        .select(APPLICATION_SELECT, { count: "exact" })
        .order("submitted_at", { ascending: false })
        .range(0, MAX_ADMIN_APPLICATIONS - 1);

      if (error) {
        // Reset to idle so the next ensure call retries the fetch.
        appsFetchState.current = "idle";
        setAppsError("Failed to load applications.");
        toast.error("Failed to load applications. Please try again.");
        return;
      }

      setAppsError(null);
      setApplications(data ?? []);
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
      const channel = supabase
        .channel("admin-applications")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "applications" },
          (payload) => {
            setApplications((prev) => [payload.new as Application, ...(prev ?? [])]);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "applications" },
          (payload) => {
            setApplications((prev) =>
              (prev ?? []).map((a) =>
                a.id === (payload.new as Application).id ? (payload.new as Application) : a
              )
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "applications" },
          (payload) => {
            setApplications((prev) =>
              (prev ?? []).filter((a) => a.id !== (payload.old as Application).id)
            );
          },
        )
        .subscribe();

      channelsRef.current.push(channel);
    }

    fetchApplications();
  }, []);

  const ensureProfiles = useCallback(() => {
    if (profilesFetchState.current !== "idle") return;
    profilesFetchState.current = "loading";

    const supabase = getSupabase();

    async function fetchProfiles() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, role, display_name, bio, avatar_url, preferences, created_at, updated_at")
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
            setProfiles((prev) => [payload.new as Profile, ...(prev ?? [])]);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles" },
          (payload) => {
            setProfiles((prev) =>
              (prev ?? []).map((p) =>
                p.id === (payload.new as Profile).id ? (payload.new as Profile) : p
              )
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "profiles" },
          (payload) => {
            setProfiles((prev) =>
              (prev ?? []).filter((p) => p.id !== (payload.old as Profile).id)
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
        { data: contactEventSummariesData, error: contactEventSummariesErr },
      ] = await Promise.all([
        supabase.from("contacts").select(CONTACT_SELECT).order("name"),
        supabase
          .from("tag_categories")
          .select(TAG_CATEGORY_SELECT)
          .order("sort_order"),
        supabase.from("tags").select(TAG_SELECT).order("sort_order"),
        supabase.from("contact_tags").select("*"),
        supabase.from("contact_events").select(CONTACT_EVENT_SUMMARY_SELECT),
      ]);

      const fetchError =
        contactsErr ?? tagCategoriesErr ?? tagsErr ?? contactTagsErr ?? contactEventSummariesErr;
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
      setContactEventSummaries(contactEventSummariesData ?? []);
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
            setContacts((prev) =>
              upsertSortedContact(prev, payload.new as Contact),
            );
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
            const row = payload.new as ContactEvent;
            const summary: ContactEventSummary = {
              id: row.id,
              contact_id: row.contact_id,
              type: row.type,
              custom_label: row.custom_label,
              happened_at: row.happened_at,
              resolved_at: row.resolved_at,
            };
            setContactEventSummaries((prev) => [...(prev ?? []), summary]);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "contact_events" },
          (payload) => {
            const row = payload.new as ContactEvent;
            setContactEventSummaries((prev) =>
              (prev ?? []).map((s) =>
                s.id === row.id
                  ? {
                      id: row.id,
                      contact_id: row.contact_id,
                      type: row.type,
                      custom_label: row.custom_label,
                      happened_at: row.happened_at,
                      resolved_at: row.resolved_at,
                    }
                  : s,
              ),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "contact_events" },
          (payload) => {
            const row = payload.old as ContactEvent;
            setContactEventSummaries((prev) =>
              (prev ?? []).filter((s) => s.id !== row.id),
            );
          },
        )
        .subscribe();

      channelsRef.current.push(contactsChannel, contactTagsChannel, tagCategoriesChannel, tagsChannel, contactEventsChannel);
    }

    fetchContacts();
  }, []);

  const ensurePreferences = useCallback(() => {
    if (preferencesFetchState.current !== "idle") return;
    preferencesFetchState.current = "loading";

    const supabase = getSupabase();

    async function fetchPreferences() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        preferencesFetchState.current = "done";
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("preferences")
        .eq("id", user.id)
        .single();

      if (error) {
        preferencesFetchState.current = "idle";
        toast.error("Failed to load preferences.");
        return;
      }

      setPreferences((data?.preferences as Record<string, unknown>) ?? {});
      preferencesFetchState.current = "done";
    }

    fetchPreferences();
  }, []);

  // Cleanup only the channels that were actually created
  useEffect(() => {
    return () => {
      const supabase = supabaseRef.current;
      if (!supabase) return;
      clearTimeout(tagCategoriesRefetchTimeoutRef.current ?? undefined);
      clearTimeout(tagsRefetchTimeoutRef.current ?? undefined);
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
    }),
    [applications, appsError, ensureApplications],
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
      contactEventSummaries,
      contactsError,
      ensureContacts,
    }),
    [
      contacts,
      tagCategories,
      tags,
      contactTags,
      contactEventSummaries,
      contactsError,
      ensureContacts,
    ],
  );

  const preferencesValue = useMemo(
    () => ({
      preferences,
      setPreferences,
      ensurePreferences,
    }),
    [
      preferences,
      setPreferences,
      ensurePreferences,
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
