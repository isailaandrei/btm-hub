/**
 * Thin wrappers for calling `refreshContactMemoryFacts` from admin
 * server actions. Single-contact writes block on the refresh so the
 * admin's next read sees consistent memory. Bulk writes run
 * concurrency-limited and return per-contact success/failure counts.
 *
 * Never calls OpenAI. Pure projection of source data into the
 * structural slice of the dossier + ranking card.
 */

import { refreshContactMemoryFacts } from "./facts-refresh";

/**
 * Synchronous single-contact refresh. Propagates errors to the caller
 * — the admin sees them as server action failures.
 */
export async function syncContactMemory(contactId: string): Promise<void> {
  await refreshContactMemoryFacts({ contactId });
}

export type BulkMemorySyncResult = {
  succeeded: number;
  failed: number;
  failures: Array<{ contactId: string; error: string }>;
};

/**
 * Bulk refresh with concurrency cap. Per-contact failures are logged
 * but do NOT fail the whole batch — admin gets a structured result so
 * the UI can surface "X of Y dossiers refreshed" in a toast.
 */
export async function syncContactMemoryBulk(
  contactIds: string[],
  options: { concurrency?: number } = {},
): Promise<BulkMemorySyncResult> {
  const concurrency = options.concurrency ?? 8;
  const result: BulkMemorySyncResult = {
    succeeded: 0,
    failed: 0,
    failures: [],
  };
  if (contactIds.length === 0) return result;

  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, contactIds.length) },
    async () => {
      while (true) {
        const index = cursor++;
        if (index >= contactIds.length) return;
        const contactId = contactIds[index]!;
        try {
          await refreshContactMemoryFacts({ contactId });
          result.succeeded += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          result.failed += 1;
          result.failures.push({ contactId, error: message });
          console.warn(
            "[admin-ai-memory] bulk facts refresh failed",
            { contactId, error: message },
          );
        }
      }
    },
  );
  await Promise.all(workers);
  return result;
}
