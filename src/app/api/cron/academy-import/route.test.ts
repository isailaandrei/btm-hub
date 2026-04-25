import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/academy/import-runner", () => ({
  executeAcademyImportRun: vi.fn(),
}));

describe("GET /api/cron/academy-import", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    vi.resetModules();
  });

  it("rejects requests with an invalid cron secret", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/cron/academy-import", {
        headers: {
          authorization: "Bearer wrong-secret",
        },
      }),
    );

    expect(response.status).toBe(401);
  });

  it("runs the import, revalidates admin routes, and refreshes AI facts", async () => {
    const { executeAcademyImportRun } = await import("@/lib/academy/import-runner");

    vi.mocked(executeAcademyImportRun).mockResolvedValue({
      summary: {
        dryRun: false,
        scanned: 2,
        inserted: 2,
        backfilled: 1,
        duplicates: 0,
        drifted: 0,
        ambiguous: 0,
        invalid: 0,
        failedRows: 0,
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

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/academy-import", {
        headers: {
          authorization: "Bearer test-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(executeAcademyImportRun).toHaveBeenCalledWith({
      dryRun: false,
    });
  });
});
