"use client";

import { useMemo } from "react";
import type {
  Application,
  Contact,
  ContactTag,
  ProgramSlug,
  Tag,
  TagCategory,
} from "@/types/database";
import {
  getFieldEntry,
  type FieldRegistryEntry,
} from "./field-registry";
import {
  compareContacts,
  type SortState,
} from "./sort-helpers";

const EMPTY_TAG_ID_SET = new Set<string>();
const EMPTY_CONTACT_TAGS: ContactTag[] = [];
const EMPTY_APPLICATIONS: Application[] = [];

interface UseContactsPanelViewModelArgs {
  applications: Application[] | null;
  contacts: Contact[] | null;
  contactTags: ContactTag[] | null;
  tags: Tag[] | null;
  tagCategories: TagCategory[] | null;
  visibleColumns: string[];
  search: string;
  selectedProgram: ProgramSlug | undefined;
  selectedTagIds: string[];
  columnFilters: Record<string, string[]>;
  sortBy: SortState | null;
  page: number;
  pageSize: number;
}

export function useContactsPanelViewModel({
  applications,
  contacts,
  contactTags,
  tags,
  tagCategories,
  visibleColumns,
  search,
  selectedProgram,
  selectedTagIds,
  columnFilters,
  sortBy,
  page,
  pageSize,
}: UseContactsPanelViewModelArgs) {
  const appsByContact = useMemo(() => {
    const map = new Map<string, Application[]>();
    for (const application of applications ?? []) {
      if (!application.contact_id) continue;
      const existing = map.get(application.contact_id);
      if (existing) existing.push(application);
      else map.set(application.contact_id, [application]);
    }
    return map;
  }, [applications]);

  const contactTagsByContactId = useMemo(() => {
    const map = new Map<string, ContactTag[]>();
    for (const contactTag of contactTags ?? []) {
      const existing = map.get(contactTag.contact_id);
      if (existing) existing.push(contactTag);
      else map.set(contactTag.contact_id, [contactTag]);
    }
    return map;
  }, [contactTags]);

  const tagIdsByContactId = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const contactTag of contactTags ?? []) {
      const existing = map.get(contactTag.contact_id);
      if (existing) existing.add(contactTag.tag_id);
      else map.set(contactTag.contact_id, new Set([contactTag.tag_id]));
    }
    return map;
  }, [contactTags]);

  const tagsById = useMemo(
    () => new Map((tags ?? []).map((tag) => [tag.id, tag])),
    [tags],
  );

  const categoriesById = useMemo(
    () => new Map((tagCategories ?? []).map((category) => [category.id, category])),
    [tagCategories],
  );

  const activeFields = useMemo(
    () =>
      visibleColumns
        .map(getFieldEntry)
        .filter((field): field is FieldRegistryEntry => field !== undefined),
    [visibleColumns],
  );

  const filtered = useMemo(() => {
    let result = contacts ?? [];

    if (search) {
      const query = search.toLowerCase();
      result = result.filter(
        (contact) =>
          contact.name.toLowerCase().includes(query) ||
          contact.email.toLowerCase().includes(query),
      );
    }

    if (selectedProgram) {
      result = result.filter((contact) =>
        (appsByContact.get(contact.id) ?? EMPTY_APPLICATIONS).some(
          (application) => application.program === selectedProgram,
        ),
      );
    }

    if (selectedTagIds.length > 0) {
      const selectedSet = new Set(selectedTagIds);
      const tagIdsByCategory = new Map<string, Set<string>>();

      for (const tag of tags ?? []) {
        if (!selectedSet.has(tag.id)) continue;
        const existing = tagIdsByCategory.get(tag.category_id);
        if (existing) existing.add(tag.id);
        else tagIdsByCategory.set(tag.category_id, new Set([tag.id]));
      }

      result = result.filter((contact) => {
        const contactTagSet =
          tagIdsByContactId.get(contact.id) ?? EMPTY_TAG_ID_SET;

        for (const categoryTagIds of tagIdsByCategory.values()) {
          let matchedCategory = false;
          for (const tagId of categoryTagIds) {
            if (contactTagSet.has(tagId)) {
              matchedCategory = true;
              break;
            }
          }
          if (!matchedCategory) return false;
        }

        return true;
      });
    }

    const activeColumnFilters = Object.entries(columnFilters);
    if (activeColumnFilters.length > 0) {
      const precomputed = activeColumnFilters.map(([fieldKey, values]) => {
        const field = getFieldEntry(fieldKey);
        const canonicalOptions = new Set<string>(
          (field?.canonical?.options ??
            (field?.options as readonly string[] | undefined) ??
            []) as readonly string[],
        );

        return {
          fieldKey,
          fieldType: field?.type,
          normalize: field?.canonical?.normalize,
          canonicalOptions,
          otherSelected: values.includes("Other"),
          canonicalSelected: values.filter((value) => value !== "Other"),
        };
      });

      result = result.filter((contact) => {
        const contactApplications =
          appsByContact.get(contact.id) ?? EMPTY_APPLICATIONS;

        return precomputed.every(
          ({
            fieldKey,
            fieldType,
            normalize,
            canonicalOptions,
            otherSelected,
            canonicalSelected,
          }) =>
            contactApplications.some((application) => {
              const raw = application.answers?.[fieldKey];
              if (raw == null || raw === "") {
                return otherSelected;
              }

              const rawValues = Array.isArray(raw)
                ? raw.map(String)
                : fieldType === "multiselect"
                  ? String(raw)
                      .split(", ")
                      .map((value) => value.trim())
                      .filter(Boolean)
                  : [String(raw)];

              const matchedValues = rawValues.map((value) =>
                normalize ? normalize(value) ?? value : value,
              );

              if (
                canonicalSelected.some((value) =>
                  matchedValues.includes(value),
                )
              ) {
                return true;
              }

              if (
                otherSelected &&
                matchedValues.some((value) => !canonicalOptions.has(value))
              ) {
                return true;
              }

              return false;
            }),
        );
      });
    }

    if (sortBy) {
      const field = getFieldEntry(sortBy.key);
      result = [...result].sort((left, right) =>
        compareContacts(left, right, sortBy, appsByContact, field),
      );
    }

    return result;
  }, [
    appsByContact,
    columnFilters,
    contacts,
    search,
    selectedProgram,
    selectedTagIds,
    sortBy,
    tagIdsByContactId,
    tags,
  ]);

  const hasAnyFilter =
    Boolean(search) ||
    Boolean(selectedProgram) ||
    selectedTagIds.length > 0 ||
    Object.keys(columnFilters).length > 0;

  const { currentPage, paginated, totalPages } = useMemo(() => {
    const nextTotalPages = Math.ceil(filtered.length / pageSize);
    const nextCurrentPage = Math.min(page, Math.max(nextTotalPages, 1));
    const nextPaginated = filtered.slice(
      (nextCurrentPage - 1) * pageSize,
      nextCurrentPage * pageSize,
    );

    return {
      currentPage: nextCurrentPage,
      paginated: nextPaginated,
      totalPages: nextTotalPages,
    };
  }, [filtered, page, pageSize]);

  const paginatedRows = useMemo(
    () =>
      paginated.map((contact) => {
        const contactApplications =
          appsByContact.get(contact.id) ?? EMPTY_APPLICATIONS;

        return {
          contact,
          contactApplications,
          uniquePrograms: [...new Set(contactApplications.map((app) => app.program))],
          contactTagEntries:
            contactTagsByContactId.get(contact.id) ?? EMPTY_CONTACT_TAGS,
        };
      }),
    [appsByContact, contactTagsByContactId, paginated],
  );

  return {
    activeFields,
    appsByContact,
    categoriesById,
    contactTagsByContactId,
    currentPage,
    filtered,
    hasAnyFilter,
    paginated,
    paginatedRows,
    tagsById,
    totalPages,
  };
}
