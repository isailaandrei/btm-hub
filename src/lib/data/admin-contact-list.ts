import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  Contact,
  ContactTag,
  Tag,
  TagCategory,
} from "@/types/database";
import { logAdminTiming, startAdminTiming } from "@/lib/admin/timing";
import {
  buildApplicationProjectionSelect,
  getContactsTableApplicationAnswerKeys,
  reassembleProjectedApplications,
  type ContactListApplication,
} from "@/lib/admin/contacts/application-projection";
import {
  readContactsTablePreferences,
  type ContactsTablePageSize,
} from "@/lib/admin/contacts/preferences";

const DEFAULT_PAGE_SIZE: ContactsTablePageSize = 25;
const CONTACT_SELECT =
  "id, email, name, phone, profile_id, created_at, updated_at, last_application_at";
const CONTACT_TAG_SELECT = "contact_id, tag_id, assigned_at";
const TAG_CATEGORY_SELECT =
  "id, name, color, sort_order, created_at, updated_at";
const TAG_SELECT = "id, category_id, name, sort_order, updated_at";

type NativeContactSortKey = "name" | "email" | "phone" | "last_application_at";

const DEFAULT_CONTACTS_SORT = {
  key: "submitted_at",
  direction: "desc",
} as const;

export interface AdminContactsInitialQuery {
  pageSize: ContactsTablePageSize;
  serverSort: {
    source: "contacts";
    key: NativeContactSortKey;
    ascending: boolean;
  };
  isSortApproximateUntilHydration: boolean;
  answerKeys: string[];
}

export interface AdminContactsInitialData {
  applications: ContactListApplication[];
  contactTags: ContactTag[];
  contacts: Contact[];
  isSortApproximateUntilHydration: boolean;
  pageSize: ContactsTablePageSize;
  tagCategories: TagCategory[];
  tags: Tag[];
  totalCount: number;
}

export function getAdminContactsInitialQuery(
  preferences: Record<string, unknown>,
): AdminContactsInitialQuery {
  const contactsTable = readContactsTablePreferences(preferences);
  const pageSize = contactsTable.page_size ?? DEFAULT_PAGE_SIZE;
  const sortBy = contactsTable.sort_by ?? DEFAULT_CONTACTS_SORT;
  const nativeSortKeys = new Set(["name", "email", "phone"]);
  const hasNativeSort = nativeSortKeys.has(sortBy.key);
  // "submitted_at" is the UI's default sort (most recently submitted first).
  // It isn't a native contacts column, but contacts.last_application_at
  // denormalizes the same value, so it can be served without falling back to
  // an approximate name sort.
  const isSubmittedAtSort = sortBy.key === "submitted_at";

  return {
    pageSize,
    serverSort: hasNativeSort
      ? {
          source: "contacts",
          key: sortBy?.key as NativeContactSortKey,
          ascending: sortBy?.direction !== "desc",
        }
      : isSubmittedAtSort
        ? {
            source: "contacts",
            key: "last_application_at",
            ascending: sortBy?.direction !== "desc",
          }
        : { source: "contacts", key: "name", ascending: true },
    isSortApproximateUntilHydration: !hasNativeSort && !isSubmittedAtSort,
    answerKeys: getContactsTableApplicationAnswerKeys({
      columnFilters: {},
      sortBy: sortBy ?? null,
      visibleColumns: contactsTable.visible_columns ?? [],
    }),
  };
}

export const getAdminContactsInitialData = cache(
  async function getAdminContactsInitialData(
    preferences: Record<string, unknown>,
  ): Promise<AdminContactsInitialData> {
    const startedAt = startAdminTiming();
    const supabase = await createClient();
    const initialQuery = getAdminContactsInitialQuery(preferences);

    const {
      data: contactsData,
      error: contactsError,
      count,
    } = await supabase
      .from("contacts")
      .select(CONTACT_SELECT, { count: "exact" })
      .order(initialQuery.serverSort.key, {
        ascending: initialQuery.serverSort.ascending,
        // No-application contacts have a null last_application_at — always
        // sort those last, matching the client-side "nulls last" ordering.
        ...(initialQuery.serverSort.key === "last_application_at"
          ? { nullsFirst: false }
          : {}),
      })
      .range(0, initialQuery.pageSize - 1);

    if (contactsError) {
      throw new Error(
        `Failed to load initial contacts: ${contactsError.message}`,
      );
    }

    const contacts = (contactsData ?? []) as unknown as Contact[];
    const contactIds = contacts.map((contact) => contact.id);
    const totalCount = count ?? contacts.length;

    const applicationProjection = buildApplicationProjectionSelect(
      initialQuery.answerKeys,
    );

    const applicationsPromise =
      contactIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("applications")
            .select(applicationProjection.select)
            .in("contact_id", contactIds)
            .order("submitted_at", { ascending: false });

    const contactTagsPromise =
      contactIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("contact_tags")
            .select(CONTACT_TAG_SELECT)
            .in("contact_id", contactIds);

    const [
      { data: applicationsData, error: applicationsError },
      { data: contactTagsData, error: contactTagsError },
      { data: tagCategoriesData, error: tagCategoriesError },
      { data: tagsData, error: tagsError },
    ] = await Promise.all([
      applicationsPromise,
      contactTagsPromise,
      supabase
        .from("tag_categories")
        .select(TAG_CATEGORY_SELECT)
        .order("sort_order"),
      supabase.from("tags").select(TAG_SELECT).order("sort_order"),
    ]);

    const fetchError =
      applicationsError ?? contactTagsError ?? tagCategoriesError ?? tagsError;
    if (fetchError) {
      throw new Error(`Failed to load initial contact rows: ${fetchError.message}`);
    }

    const result = {
      applications: reassembleProjectedApplications(
        (applicationsData ?? []) as unknown as Array<Record<string, unknown>>,
        applicationProjection.answerKeys,
      ),
      contactTags: (contactTagsData ?? []) as unknown as ContactTag[],
      contacts,
      isSortApproximateUntilHydration:
        initialQuery.isSortApproximateUntilHydration,
      pageSize: initialQuery.pageSize,
      tagCategories: (tagCategoriesData ?? []) as unknown as TagCategory[],
      tags: (tagsData ?? []) as unknown as Tag[],
      totalCount,
    };

    logAdminTiming("admin.contacts.initial.server", startedAt, {
      applications: result.applications.length,
      contacts: result.contacts.length,
      pageSize: result.pageSize,
      sortSource: initialQuery.serverSort.source,
      totalCount,
    });

    return result;
  },
);
