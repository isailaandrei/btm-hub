import { executeAcademyImportRun } from "@/lib/academy/import-runner";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json(
      { error: "Missing CRON_SECRET" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun =
    url.searchParams.get("dryRun") === "1" ||
    url.searchParams.get("dryRun") === "true";

  try {
    const { summary, memorySync } = await executeAcademyImportRun({
      dryRun,
    });

    // A run that completed but had whole-source failures or per-row throws
    // should NOT report 200 OK to the cron monitor — otherwise a broken
    // sheet schema or fetch failure silently leaves a category unsynced
    // while monitoring shows green.
    const hadFailures =
      summary.failedSources > 0 ||
      summary.failedRows > 0 ||
      summary.invalid > 0 ||
      summary.ambiguous > 0;

    return Response.json(
      {
        ok: !hadFailures,
        summary,
        memorySync,
      },
      { status: hadFailures ? 502 : 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
