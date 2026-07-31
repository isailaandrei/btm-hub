interface CategoryLike {
  id: string;
  name: string;
  sort_order: number;
}

interface TagLike {
  category_id: string;
  name: string;
  sort_order: number;
}

export interface TagSearchGroup<C extends CategoryLike, T extends TagLike> {
  category: C;
  tags: T[];
}

/**
 * True when every whitespace-separated query word is a case-insensitive
 * substring of the category name alone. Used by the contact-page picker to
 * keep a name-matched category (and its quick-create row) visible even when
 * none of its tags survive the tag-level filter. Empty queries don't match —
 * they mean "browse", not "everything".
 */
export function categoryNameMatches(name: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const haystack = name.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/**
 * Filter tags for the searchable pickers, grouped by category.
 *
 * A (category, tag) pair matches when every whitespace-separated query word
 * is a case-insensitive substring of `"<category name> <tag name>"` — so a
 * category-name hit ("azores") includes the whole group, while
 * "azores joining" narrows to that category's "Joining" tag. An empty or
 * whitespace-only query matches every pair. Categories with no matching
 * tags are omitted; both levels come back ordered by `sort_order`.
 */
export function searchTags<C extends CategoryLike, T extends TagLike>(
  categories: C[],
  tags: T[],
  query: string,
): TagSearchGroup<C, T>[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const tagsByCategoryId = new Map<string, T[]>();
  for (const tag of tags) {
    const bucket = tagsByCategoryId.get(tag.category_id);
    if (bucket) bucket.push(tag);
    else tagsByCategoryId.set(tag.category_id, [tag]);
  }

  // Tie-break equal sort_orders by name so the provider-cache path (which
  // sorts by sort_order, name) and the DB path (sort_order only) render
  // identically.
  const groups: TagSearchGroup<C, T>[] = [];
  for (const category of [...categories].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  )) {
    const categoryTags = (tagsByCategoryId.get(category.id) ?? []).sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
    );
    const categoryName = category.name.toLowerCase();
    const matching =
      words.length === 0
        ? categoryTags
        : categoryTags.filter((tag) => {
            const haystack = `${categoryName} ${tag.name.toLowerCase()}`;
            return words.every((word) => haystack.includes(word));
          });
    if (matching.length > 0) groups.push({ category, tags: matching });
  }
  return groups;
}
