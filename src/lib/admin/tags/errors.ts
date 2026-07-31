// Plain module (NOT "use server") so both the tags and contacts action files
// can share it — "use server" files may only export async functions.

export const DUPLICATE_TAG_MESSAGE =
  "A tag with that name already exists in this category.";

export const DUPLICATE_CATEGORY_MESSAGE =
  "A category with that name already exists.";

/** Postgres unique-violation shapes surfaced through the data layer. */
export function isDuplicateTagError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /duplicate|already exists|unique/i.test(error.message)
  );
}
