import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRunAcademySheetsImport = vi.fn();
const mockSyncContactMemoryBulk = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("./import-service", () => ({
  runAcademySheetsImport: mockRunAcademySheetsImport,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/admin-ai-memory/server-action-sync", () => ({
  syncContactMemoryBulk: mockSyncContactMemoryBulk,
}));

describe("executeAcademyImportRun", () => {
  beforeEach(() => {
    mockRunAcademySheetsImport.mockReset();
    mockSyncContactMemoryBulk.mockReset();
    mockRevalidatePath.mockReset();
  });

  it("revalidates admin views and refreshes contact memory after real inserts", async () => {
    mockRunAcademySheetsImport.mockResolvedValue({
      dryRun: false,
      scanned: 2,
      inserted: 2,
      backfilled: 1,
      duplicates: 0,
      drifted: 0,
      ambiguous: 0,
      invalid: 0,
      failedSources: 0,
      insertedContactIds: ["contact-1", "contact-2"],
      sources: [],
    });
    mockSyncContactMemoryBulk.mockResolvedValue({
      succeeded: 2,
      failed: 0,
      failures: [],
    });

    const { executeAcademyImportRun } = await import("./import-runner");
    const result = await executeAcademyImportRun({ dryRun: false });

    expect(result.summary.inserted).toBe(2);
    expect(result.memorySync).toEqual({
      succeeded: 2,
      failed: 0,
      failures: [],
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/contacts/contact-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/contacts/contact-2");
    expect(mockSyncContactMemoryBulk).toHaveBeenCalledWith(
      ["contact-1", "contact-2"],
      { concurrency: 8 },
    );
  });

  it("skips revalidation and memory refresh on dry runs", async () => {
    mockRunAcademySheetsImport.mockResolvedValue({
      dryRun: true,
      scanned: 2,
      inserted: 1,
      backfilled: 1,
      duplicates: 0,
      drifted: 0,
      ambiguous: 0,
      invalid: 0,
      failedSources: 0,
      insertedContactIds: ["contact-1"],
      sources: [],
    });

    const { executeAcademyImportRun } = await import("./import-runner");
    const result = await executeAcademyImportRun({ dryRun: true });

    expect(result.summary.dryRun).toBe(true);
    expect(result.memorySync).toBeNull();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
    expect(mockSyncContactMemoryBulk).not.toHaveBeenCalled();
  });
});
