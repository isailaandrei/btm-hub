"use client";

// This context provider serves two purposes:
// 1. Cross-tab caching — data fetched on one tab persists when switching tabs
// 2. Realtime subscription lifecycle — subscriptions stay alive across tab switches
//
// Each dataset is fetched lazily on first tab visit via ensure*() functions.
// Supabase Realtime subscriptions are set up per-table only after the initial
// fetch completes, so Realtime events never race with the first load.

// TODO: The applications fetch uses select("*") with no server-side pagination.
// This will degrade as the applications table grows. Consider adding server-side
// pagination or cursor-based fetching once the table exceeds ~500 rows.

// TODO: Filter/search state for the applications tab (program, status, search)
// lives inside the ApplicationsPanel component and resets when switching tabs.
// If preserving filter state across tab switches is desired, lift it into this
// context.

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Application, Profile, Contact, TagCategory, Tag, ContactTag } from "@/types/database";
import type { RealtimeChannel } from "@supabase/supabase-js";

type FetchState = "idle" | "loading" | "done";

interface AdminDataContextValue {
  applications: Application[] | null;
  profiles: Profile[] | null;
  appsError: string | null;
  profilesError: string | null;
  ensureApplications: () => void;
  ensureProfiles: () => void;
  contacts: Contact[] | null;
  tagCategories: TagCategory[] | null;
  tags: Tag[] | null;
  contactTags: ContactTag[] | null;
  contactsError: string | null;
  ensureContacts: () => void;
}

const AdminDataContext = createContext<AdminDataContextValue | null>(null);

export function useAdminData() {
  const ctx = useContext(AdminDataContext);
  if (!ctx) throw new Error("useAdminData must be used within AdminDataProvider");
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
  const [contactsError, setContactsError] = useState<string | null>(null);

  const appsFetchState = useRef<FetchState>("idle");
  const profilesFetchState = useRef<FetchState>("idle");
  const contactsFetchState = useRef<FetchState>("idle");
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const ensureApplications = useCallback(() => {
    if (appsFetchState.current !== "idle") return;
    appsFetchState.current = "loading";

    const supabase = getSupabase();

    async function fetchApplications() {
      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .order("submitted_at", { ascending: false });

      if (error) {
        // Reset to idle so the next ensure call retries the fetch.
        appsFetchState.current = "idle";
        setAppsError("Failed to load applications.");
        toast.error("Failed to load applications. Please try again.");
        return;
      }

      setAppsError(null);
      setApplications(data ?? []);
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
        .select("id, email, role, display_name, bio, avatar_url, created_at, updated_at")
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
      ] = await Promise.all([
        supabase.from("contacts").select("*").order("name"),
        supabase.from("tag_categories").select("*").order("sort_order"),
        supabase.from("tags").select("*").order("sort_order"),
        supabase.from("contact_tags").select("*"),
      ]);

      const fetchError = contactsErr ?? tagCategoriesErr ?? tagsErr ?? contactTagsErr;
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
      contactsFetchState.current = "done";

      // Subscribe to Realtime only after the initial fetch succeeds
      const contactsChannel = supabase
        .channel("admin-contacts")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "contacts" },
          (payload) => {
            setContacts((prev) => [payload.new as Contact, ...(prev ?? [])]);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "contacts" },
          (payload) => {
            setContacts((prev) =>
              (prev ?? []).map((c) =>
                c.id === (payload.new as Contact).id ? (payload.new as Contact) : c
              )
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
            const { data } = await supabase.from("tag_categories").select("*").order("sort_order");
            if (data) setTagCategories(data);
          },
        )
        .subscribe();

      const tagsChannel = supabase
        .channel("admin-tags")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tags" },
          async () => {
            const { data } = await supabase.from("tags").select("*").order("sort_order");
            if (data) setTags(data);
          },
        )
        .subscribe();

      channelsRef.current.push(contactsChannel, contactTagsChannel, tagCategoriesChannel, tagsChannel);
    }

    fetchContacts();
  }, []);

  // Cleanup only the channels that were actually created
  useEffect(() => {
    return () => {
      const supabase = supabaseRef.current;
      if (!supabase) return;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- channelsRef is intentionally read at cleanup time to get the latest channels
      for (const channel of channelsRef.current) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  return (
    <AdminDataContext.Provider
      value={{
          applications,
          profiles,
          appsError,
          profilesError,
          ensureApplications,
          ensureProfiles,
          contacts,
          tagCategories,
          tags,
          contactTags,
          contactsError,
          ensureContacts,
        }}
    >
      {children}
    </AdminDataContext.Provider>
  );
}
