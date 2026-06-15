/**
 * Reconcile UI selection against the latest backing dataset.
 *
 * In the admin table, realtime updates can remove contacts while an admin still
 * has them selected for bulk actions. We prune those stale IDs so bulk writes
 * only operate on rows that still exist.
 */
export function pruneSelectedIds(
  selectedIds: Set<string>,
  validContactIds: Set<string>,
): Set<string> {
  let changed = false;
  const next = new Set<string>();

  for (const id of selectedIds) {
    if (validContactIds.has(id)) {
      next.add(id);
    } else {
      changed = true;
    }
  }

  return changed ? next : selectedIds;
}
