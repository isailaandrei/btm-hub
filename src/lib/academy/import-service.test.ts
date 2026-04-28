import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/application-imports", () => ({
  createImportedApplication: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockResolvedValue({ admin: true }),
}));

const INTERNSHIP_HEADER =
  "Zeitstempel,First Name,Last Name,Nickname,Email,Phone,Age,Gender,Nationality,Country of residence,Languages,\"If you have an online presence, please share your links.\",\"Do you already have accommodation, connections, or other ties to Faial, Azores?\",Current occupation,What is the highest level of education or training you have completed so far?,\"What is your field of study, training or profession?\",\"Which activities (like jobs, studies, school, time-intensive interests) have primarily occupied your time over the past few years?\",Experience with underwater filmmaking so far,List your filming equipment,What type of content have you created so far? ,What inspired you to apply to BTM Academy? ,Please describe your ultimate vision for your underwater filming journey ,What do you hope to gain from this internship?,Why do you think you are a good candidate for the internship?,Physical Fitness & Health,Do you have any specific health conditions that might affect diving?,What type of diving do you practice?,Current diving certification level,Number of dives,Last diving activity date,Diving environments experience,How would you describe your buoyancy skill level,How did you hear about BTM Academy? ,Do you have any specific questions or concerns?,Is there anything else you'd like to share with us?";

function buildInternshipRow(email: string, firstName = "Max") {
  return `21.01.2026 21:03:43,${firstName},Schneider,,${email},+491234,29,Male,German,Germany,"English, German",https://instagram.com/max,"No, I haven't.",Event manager,Bachelor's degree,Event management,"Work, diving, photography","I have started filming on dives.","Sony a7 III","Personal vacation videos, Social media content","I have followed BTM for years.","I want to tell stronger ocean stories.","Learn production","I work hard and learn fast.","Excellent - Regular exercise, no health concerns",No health conditions affecting diving,"Recreational Scuba diving, Freediving","Advanced Open Water, Rescue Diver",250+,15.01.2026,"Tropical Reefs, Open water",8,"Social Media (Instagram, Facebook, etc.), Word of mouth",,`;
}

describe("importAcademySheetSource", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("fails closed when a sheet exposes unknown headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        [
          "Zeitstempel,First Name,Last Name,Email,Unexpected column",
          "21.01.2026 21:03:43,Max,Schneider,max@example.com,test",
        ].join("\n"),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createImportedApplication } = await import("@/lib/data/application-imports");
    const { importAcademySheetSource } = await import("./import-service");

    const result = await importAcademySheetSource(
      {
        program: "internship",
        label: "Internship",
        sourceId: "google_forms:internship",
        spreadsheetId: "sheet-1",
        gid: "gid-1",
      },
      { dryRun: false },
    );

    expect(result.failed).toBe(true);
    expect(result.errors).toContain("Unknown headers: unexpected column");
    expect(result.errors.some((error) => error.startsWith("Missing headers:"))).toBe(true);
    expect(createImportedApplication).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://docs.google.com/spreadsheets/d/sheet-1/export?format=csv&gid=gid-1",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("imports a valid row and reports inserted counts", async () => {
    const csv = [
      INTERNSHIP_HEADER,
      buildInternshipRow("max@example.com"),
    ].join("\n");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(csv, { status: 200 })),
    );

    const { createImportedApplication } = await import("@/lib/data/application-imports");
    vi.mocked(createImportedApplication).mockResolvedValue({
      status: "inserted",
      applicationId: "app-1",
      contactId: "contact-1",
    });

    const { importAcademySheetSource } = await import("./import-service");
    const result = await importAcademySheetSource(
      {
        program: "internship",
        label: "Internship",
        sourceId: "google_forms:internship",
        spreadsheetId: "sheet-1",
        gid: "gid-1",
      },
      { dryRun: false },
    );

    expect(result.failed).toBe(false);
    expect(result.scanned).toBe(1);
    expect(result.inserted).toBe(1);
    expect(result.backfilled).toBe(0);
    expect(result.ambiguous).toBe(0);
    expect(result.insertedContactIds).toEqual(["contact-1"]);
    expect(createImportedApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        program: "internship",
        importSource: "google_forms:internship",
        importSubmissionId: expect.any(String),
        importContentHash: expect.any(String),
      }),
      { admin: true },
    );
  });

  it("counts legacy backfills separately from new inserts", async () => {
    const csv = [
      INTERNSHIP_HEADER,
      buildInternshipRow("max@example.com"),
    ].join("\n");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(csv, { status: 200 })),
    );

    const { createImportedApplication } = await import("@/lib/data/application-imports");
    vi.mocked(createImportedApplication).mockResolvedValue({
      status: "backfilled",
      applicationId: "legacy-app",
      contactId: "contact-1",
    });

    const { importAcademySheetSource } = await import("./import-service");
    const result = await importAcademySheetSource(
      {
        program: "internship",
        label: "Internship",
        sourceId: "google_forms:internship",
        spreadsheetId: "sheet-1",
        gid: "gid-1",
      },
      { dryRun: false },
    );

    expect(result.failed).toBe(false);
    expect(result.scanned).toBe(1);
    expect(result.inserted).toBe(0);
    expect(result.backfilled).toBe(1);
    expect(result.ambiguous).toBe(0);
    expect(result.insertedContactIds).toEqual([]);
  });

  it("processes rows concurrently with one admin client per sheet", async () => {
    const csv = [
      INTERNSHIP_HEADER,
      buildInternshipRow("max-1@example.com", "Max1"),
      buildInternshipRow("max-2@example.com", "Max2"),
      buildInternshipRow("max-3@example.com", "Max3"),
    ].join("\n");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(csv, { status: 200 })),
    );

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { createImportedApplication } = await import("@/lib/data/application-imports");
    let active = 0;
    let maxActive = 0;
    vi.mocked(createImportedApplication).mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return {
        status: "inserted",
        applicationId: "app-1",
        contactId: "contact-1",
      };
    });

    const { importAcademySheetSource } = await import("./import-service");
    const result = await importAcademySheetSource(
      {
        program: "internship",
        label: "Internship",
        sourceId: "google_forms:internship",
        spreadsheetId: "sheet-1",
        gid: "gid-1",
      },
      { dryRun: false },
    );

    expect(result.scanned).toBe(3);
    expect(result.inserted).toBe(3);
    expect(maxActive).toBeGreaterThan(1);
    expect(createAdminClient).toHaveBeenCalledTimes(1);
    expect(createImportedApplication).toHaveBeenCalledTimes(3);
    expect(createImportedApplication).toHaveBeenCalledWith(
      expect.any(Object),
      { admin: true },
    );
  });
});

describe("runAcademySheetsImport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("isolates per-source fetch failures instead of aborting the full run", async () => {
    const csv = [
      INTERNSHIP_HEADER,
      buildInternshipRow("max@example.com"),
    ].join("\n");

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("bad-sheet")) {
          return Promise.reject(new Error("network down"));
        }
        return Promise.resolve(new Response(csv, { status: 200 }));
      }),
    );

    const { createImportedApplication } = await import("@/lib/data/application-imports");
    vi.mocked(createImportedApplication).mockResolvedValue({
      status: "inserted",
      applicationId: "app-1",
      contactId: "contact-1",
    });

    const { runAcademySheetsImport } = await import("./import-service");
    const summary = await runAcademySheetsImport([
      {
        program: "internship",
        label: "Broken",
        sourceId: "google_forms:internship",
        spreadsheetId: "bad-sheet",
        gid: "gid-1",
      },
      {
        program: "internship",
        label: "Working",
        sourceId: "google_forms:internship",
        spreadsheetId: "good-sheet",
        gid: "gid-2",
      },
    ]);

    expect(summary.failedSources).toBe(1);
    expect(summary.inserted).toBe(1);
    expect(summary.backfilled).toBe(0);
    expect(summary.ambiguous).toBe(0);
    expect(summary.sources[0]?.failed).toBe(true);
    expect(summary.sources[1]?.failed).toBe(false);
  });
});
