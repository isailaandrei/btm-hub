import type { ContactTag, Tag, TagCategory } from "@/types/database";

export type RollbackHandle = { rollback: () => void };

type ContactTagPair = Pick<ContactTag, "contact_id" | "tag_id">;

function contactTagKey(pair: ContactTagPair): string {
  return `${pair.contact_id}:${pair.tag_id}`;
}

function sameContactTagPair(left: ContactTagPair, right: ContactTagPair) {
  return left.contact_id === right.contact_id && left.tag_id === right.tag_id;
}

export function upsertContactTagByPair(
  items: ContactTag[] | null,
  incoming: ContactTag,
): ContactTag[] {
  const rest = (items ?? []).filter(
    (item) => !sameContactTagPair(item, incoming),
  );
  return [...rest, incoming];
}

export function addMissingContactTags(
  items: ContactTag[] | null,
  contactIds: string[],
  tagId: string,
  assignedAt: string,
): { next: ContactTag[]; addedRows: ContactTag[] } {
  const current = items ?? [];
  const seen = new Set(current.map(contactTagKey));
  const addedRows: ContactTag[] = [];

  for (const contactId of contactIds) {
    const row = { contact_id: contactId, tag_id: tagId, assigned_at: assignedAt };
    const key = contactTagKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    addedRows.push(row);
  }

  return { next: [...current, ...addedRows], addedRows };
}

export function removeExistingContactTags(
  items: ContactTag[] | null,
  contactIds: string[],
  tagId: string,
): { next: ContactTag[]; removedRows: ContactTag[] } {
  const targets = new Set(
    contactIds.map((contactId) => contactTagKey({ contact_id: contactId, tag_id: tagId })),
  );
  const current = items ?? [];
  const removedRows = current.filter((item) => targets.has(contactTagKey(item)));
  return {
    next: current.filter((item) => !targets.has(contactTagKey(item))),
    removedRows,
  };
}

export function removeContactTagPairs(
  items: ContactTag[] | null,
  pairs: ContactTagPair[],
): ContactTag[] {
  const pairKeys = new Set(pairs.map(contactTagKey));
  return (items ?? []).filter((item) => !pairKeys.has(contactTagKey(item)));
}

export function restoreContactTags(
  items: ContactTag[] | null,
  rows: ContactTag[],
): ContactTag[] {
  return rows.reduce<ContactTag[]>(
    (next, row) => upsertContactTagByPair(next, row),
    items ?? [],
  );
}

function bySortOrderThenName<T extends { sort_order: number; name: string }>(
  left: T,
  right: T,
) {
  return (
    left.sort_order - right.sort_order ||
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );
}

export function upsertTagById(items: Tag[] | null, incoming: Tag): Tag[] {
  const rest = (items ?? []).filter((item) => item.id !== incoming.id);
  return [...rest, incoming].sort(bySortOrderThenName);
}

export function patchTagById(
  items: Tag[] | null,
  id: string,
  fields: Partial<Tag>,
): Tag[] {
  return (items ?? [])
    .map((item) => (item.id === id ? { ...item, ...fields } : item))
    .sort(bySortOrderThenName);
}

export function removeTagById(items: Tag[] | null, id: string): Tag[] {
  return (items ?? []).filter((item) => item.id !== id);
}

export function upsertCategoryById(
  items: TagCategory[] | null,
  incoming: TagCategory,
): TagCategory[] {
  const rest = (items ?? []).filter((item) => item.id !== incoming.id);
  return [...rest, incoming].sort(bySortOrderThenName);
}

export function patchCategoryById(
  items: TagCategory[] | null,
  id: string,
  fields: Partial<TagCategory>,
): TagCategory[] {
  return (items ?? [])
    .map((item) => (item.id === id ? { ...item, ...fields } : item))
    .sort(bySortOrderThenName);
}

export function removeCategoryById(
  items: TagCategory[] | null,
  id: string,
): TagCategory[] {
  return (items ?? []).filter((item) => item.id !== id);
}

export function pickPreviousFields<T extends object>(
  item: T,
  fields: Partial<T>,
): Partial<T> {
  const previous: Partial<T> = {};
  for (const key of Object.keys(fields) as Array<keyof T>) {
    previous[key] = item[key];
  }
  return previous;
}
