import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAdmin = vi.fn();
const mockExecuteAcademyImportRun = vi.fn();

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/academy/import-runner", () => ({
  executeAcademyImportRun: mockExecuteAcademyImportRun,
}));

const { runAcademyImportAction } = await import("./actions");

describe("runAcademyImportAction", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockExecuteAcademyImportRun.mockReset();
    mockRequireAdmin.mockResolvedValue({
      id: "admin-1",
      role: "admin",
    });
  });

  it("returns a field error when the mode is invalid", async () => {
    const formData = new FormData();
    formData.set("mode", "bad-mode");

    await expect(
      runAcademyImportAction(
        {
          errors: null,
          message: null,
          success: false,
          mode: "dry-run",
          summary: null,
          memorySync: null,
        },
        formData,
      ),
    ).resolves.toEqual({
      errors: {
        mode: ["Invalid option: expected one of \"dry-run\"|\"sync\""],
      },
      message: null,
      success: false,
      mode: "dry-run",
      summary: null,
      memorySync: null,
    });
    expect(mockRequireAdmin).not.toHaveBeenCalled();
    expect(mockExecuteAcademyImportRun).not.toHaveBeenCalled();
  });

  it("runs a dry run and returns the structured summary", async () => {
    mockExecuteAcademyImportRun.mockResolvedValue({
      summary: {
        dryRun: true,
        scanned: 4,
        inserted: 1,
        backfilled: 2,
        duplicates: 1,
        drifted: 0,
        ambiguous: 0,
        invalid: 0,
        failedSources: 0,
        insertedContactIds: ["contact-1"],
        sources: [],
      },
      memorySync: null,
    });

    const formData = new FormData();
    formData.set("mode", "dry-run");

    const result = await runAcademyImportAction(
      {
        errors: null,
        message: null,
        success: false,
        mode: "dry-run",
        summary: null,
        memorySync: null,
      },
      formData,
    );

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(mockExecuteAcademyImportRun).toHaveBeenCalledWith({
      dryRun: true,
      deferMemorySync: false,
    });
    expect(result).toMatchObject({
      errors: null,
      success: true,
      mode: "dry-run",
      summary: {
        dryRun: true,
        inserted: 1,
        backfilled: 2,
      },
      memorySync: null,
    });
    expect(result.message).toContain("Preview ready");
  });

  it("runs a real sync and reports memory refresh results", async () => {
    mockExecuteAcademyImportRun.mockResolvedValue({
      summary: {
        dryRun: false,
        scanned: 4,
        inserted: 2,
        backfilled: 1,
        duplicates: 0,
        drifted: 1,
        ambiguous: 0,
        invalid: 0,
        failedSources: 0,
        insertedContactIds: ["contact-1", "contact-2"],
        sources: [],
      },
      memorySync: {
        succeeded: 2,
        failed: 0,
        failures: [],
      },
    });

    const formData = new FormData();
    formData.set("mode", "sync");

    const result = await runAcademyImportAction(
      {
        errors: null,
        message: null,
        success: false,
        mode: "dry-run",
        summary: null,
        memorySync: null,
      },
      formData,
    );

    expect(mockExecuteAcademyImportRun).toHaveBeenCalledWith({
      dryRun: false,
      deferMemorySync: true,
    });
    expect(result).toMatchObject({
      errors: null,
      success: true,
      mode: "sync",
      summary: {
        dryRun: false,
        inserted: 2,
        backfilled: 1,
        drifted: 1,
      },
      memorySync: {
        succeeded: 2,
        failed: 0,
        failures: [],
      },
    });
    expect(result.message).toContain("Success");
  });
});
