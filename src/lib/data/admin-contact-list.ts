import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  Contact,
  ContactTag,
  Tag,
  TagCategory,
} from "@/types/database";
import type { ContactActivitySummary } from "@/lib/data/contact-activity-summary";
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
  "id, email, name, phone, profile_id, created_at, updated_at";
const CONTACT_TAG_SELECT = "contact_id, tag_id, assigned_at";
const TAG_CATEGORY_SELECT =
  "id, name, color, sort_order, created_at, updated_at";
const TAG_SELECT = "id, category_id, name, sort_order, updated_at";
const CONTACT_ACTIVITY_SUMMARY_SELECT =
  "contact_id, last_event_type, last_event_custom_label, last_event_at, awaiting_applicant, awaiting_btm, latest_app_submitted_at";

type NativeContactSortKey = "name" | "email" | "phone";

export interface AdminContactsInitialQuery {
  pageSize: ContactsTablePageSize;
  nativeSort: {
    key: NativeContactSortKey;
    ascending: boolean;
  };
  isSortApproximateUntilHydration: boolean;
  answerKeys: string[];
}

export interface AdminContactsInitialData {
  applications: ContactListApplication[];
  contactActivitySummaries: ContactActivitySummary[];
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
  const sortBy = contactsTable.sort_by;
  const nativeSortKeys = new Set(["name", "email", "phone"]);
  const hasNativeSort = sortBy ? nativeSortKeys.has(sortBy.key) : false;

  return {
    pageSize,
    nativeSort: hasNativeSort
      ? {
          key: sortBy?.key as NativeContactSortKey,
          ascending: sortBy?.direction !== "desc",
        }
      : { key: "name", ascending: true },
    isSortApproximateUntilHydration: Boolean(sortBy && !hasNativeSort),
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
    const supabase = await createClient();
    const initialQuery = getAdminContactsInitialQuery(preferences);

    const {
      data: contactsData,
      error: contactsError,
      count,
    } = await supabase
      .from("contacts")
      .select(CONTACT_SELECT, { count: "exact" })
      .order(initialQuery.nativeSort.key, {
        ascending: initialQuery.nativeSort.ascending,
      })
      .range(0, initialQuery.pageSize - 1);

    if (contactsError) {
      throw new Error(`Failed to load initial contacts: ${contactsError.message}`);
    }

    const contacts = (contactsData ?? []) as unknown as Contact[];
    const contactIds = contacts.map((contact) => contact.id);
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

    const activitySummariesPromise =
      contactIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("contact_activity_summary")
            .select(CONTACT_ACTIVITY_SUMMARY_SELECT)
            .in("contact_id", contactIds);

    const [
      { data: applicationsData, error: applicationsError },
      { data: contactTagsData, error: contactTagsError },
      { data: activitySummariesData, error: activitySummariesError },
      { data: tagCategoriesData, error: tagCategoriesError },
      { data: tagsData, error: tagsError },
    ] = await Promise.all([
      applicationsPromise,
      contactTagsPromise,
      activitySummariesPromise,
      supabase
        .from("tag_categories")
        .select(TAG_CATEGORY_SELECT)
        .order("sort_order"),
      supabase.from("tags").select(TAG_SELECT).order("sort_order"),
    ]);

    const fetchError =
      applicationsError ??
      contactTagsError ??
      activitySummariesError ??
      tagCategoriesError ??
      tagsError;
    if (fetchError) {
      throw new Error(`Failed to load initial contact rows: ${fetchError.message}`);
    }

    return {
      applications: reassembleProjectedApplications(
        (applicationsData ?? []) as unknown as Array<Record<string, unknown>>,
        applicationProjection.answerKeys,
      ),
      contactActivitySummaries:
        (activitySummariesData ?? []) as unknown as ContactActivitySummary[],
      contactTags: (contactTagsData ?? []) as unknown as ContactTag[],
      contacts,
      isSortApproximateUntilHydration:
        initialQuery.isSortApproximateUntilHydration,
      pageSize: initialQuery.pageSize,
      tagCategories: (tagCategoriesData ?? []) as unknown as TagCategory[],
      tags: (tagsData ?? []) as unknown as Tag[],
      totalCount: count ?? contacts.length,
    };
  },
);
