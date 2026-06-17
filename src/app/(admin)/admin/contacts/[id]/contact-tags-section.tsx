"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminContactsData } from "../../admin-data-provider";
import { ContactTagManager, type ContactTagRow } from "./contact-tag-manager";
import { loadContactTagSectionData } from "./contact-tag-section-actions";

type ContactTagSectionData = Awaited<
  ReturnType<typeof loadContactTagSectionData>
>;

function buildRowsFromAdminCache({
  allTags,
  categories,
  contactId,
  contactTagRows,
}: {
  allTags: NonNullable<ReturnType<typeof useAdminContactsData>["tags"]>;
  categories: NonNullable<
    ReturnType<typeof useAdminContactsData>["tagCategories"]
  >;
  contactId: string;
  contactTagRows: NonNullable<
    ReturnType<typeof useAdminContactsData>["contactTags"]
  >;
}): ContactTagRow[] {
  const tagsById = new Map(allTags.map((tag) => [tag.id, tag]));
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );

  return contactTagRows
    .filter((row) => row.contact_id === contactId)
    .flatMap((row) => {
      const tag = tagsById.get(row.tag_id);
      const category = tag ? categoriesById.get(tag.category_id) : null;
      if (!tag || !category) return [];

      return [{
        assigned_at: row.assigned_at,
        tag_id: row.tag_id,
        tags: {
          category_id: tag.category_id,
          id: tag.id,
          name: tag.name,
          sort_order: tag.sort_order,
          tag_categories: {
            color: category.color,
            created_at: category.created_at,
            id: category.id,
            name: category.name,
            sort_order: category.sort_order,
          },
        },
      } satisfies ContactTagRow];
    });
}

export function ContactTagsSection({ contactId }: { contactId: string }) {
  const { contactTags, tagCategories, tags } = useAdminContactsData();
  const [serverData, setServerData] = useState<ContactTagSectionData | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const cachedData = useMemo(() => {
    if (!contactTags || !tagCategories || !tags) return null;

    return {
      allTags: tags,
      categories: tagCategories,
      contactTagRows: buildRowsFromAdminCache({
        allTags: tags,
        categories: tagCategories,
        contactId,
        contactTagRows: contactTags,
      }),
    };
  }, [contactId, contactTags, tagCategories, tags]);

  const data = cachedData ?? serverData;

  const loadData = useCallback(() => {
    startTransition(async () => {
      try {
        setLoadError(null);
        setServerData(await loadContactTagSectionData(contactId));
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load tags.",
        );
      }
    });
  }, [contactId]);

  useEffect(() => {
    if (cachedData || serverData || isPending || loadError) return;
    loadData();
  }, [cachedData, isPending, loadData, loadError, serverData]);

  return (
    <Card className="overflow-visible">
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">Tags</CardTitle>
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
          <ContactTagManager
            contactId={contactId}
            contactTagRows={data.contactTagRows}
            categories={data.categories}
            allTags={data.allTags}
            onDataMayHaveChanged={cachedData ? undefined : loadData}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
            <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
