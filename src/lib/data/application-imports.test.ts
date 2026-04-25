import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

function buildImportedLookup(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
}

function buildLegacyLookup(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockResolvedValue(result),
  };
}

function buildInsertBase(result: { data: unknown; error: unknown }) {
  const insertQuery = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };

  return {
    insert: vi.fn().mockReturnValue(insertQuery),
    insertQuery,
  };
}

function buildUpdateBase(result: { data: unknown; error: unknown }) {
  const updateQuery = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };

  return {
    update: vi.fn().mockReturnValue(updateQuery),
    updateQuery,
  };
}

describe("createImportedApplication", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("inserts a new reviewing application with semantic import metadata", async () => {
    const importedLookup = buildImportedLookup({
      data: null,
      error: null,
    });
    const legacyLookup = buildLegacyLookup({
      data: [],
      error: null,
    });
    const { insert, insertQuery } = buildInsertBase({
      data: { id: "app-1" },
      error: null,
    });

    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(importedLookup)
        .mockReturnValueOnce(legacyLookup)
        .mockReturnValueOnce({
          insert,
        }),
      rpc: vi.fn().mockResolvedValue({ data: "contact-1", error: null }),
    };

    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { buildAcademyImportContentHash } = await import("@/lib/academy/import");
    const { createImportedApplication } = await import("./application-imports");
    const importContentHash = buildAcademyImportContentHash({
      program: "internship",
      submittedAt: "2026-01-21T21:03:43.000Z",
      answers: {
        first_name: "Max",
        last_name: "Schneider",
        email: "max@example.com",
        phone: "+491234",
      },
    });
    const result = await createImportedApplication({
      program: "internship",
      answers: {
        first_name: "Max",
        last_name: "Schneider",
        email: "max@example.com",
        phone: "+491234",
      },
      submittedAt: "2026-01-21T21:03:43.000Z",
      importSource: "google_forms:internship",
      importSubmissionId: "submission-1",
      importContentHash,
    });

    expect(result).toEqual({
      status: "inserted",
      applicationId: "app-1",
      contactId: "contact-1",
    });
    expect(client.rpc).toHaveBeenCalledWith("find_or_create_contact", {
      p_email: "max@example.com",
      p_name: "Max Schneider",
      p_phone: "+491234",
    });
    expect(insert).toHaveBeenCalledWith({
      program: "internship",
      status: "reviewing",
      contact_id: "contact-1",
      answers: {
        first_name: "Max",
        last_name: "Schneider",
        email: "max@example.com",
        phone: "+491234",
      },
      tags: [],
      admin_notes: [],
      submitted_at: "2026-01-21T21:03:43.000Z",
      import_source: "google_forms:internship",
      import_submission_id: "submission-1",
      import_content_hash: importContentHash,
    });
    expect(insertQuery.select).toHaveBeenCalled();
  });

  it("skips duplicates when the same submission id and content hash already exist", async () => {
    const client = {
      from: vi.fn().mockReturnValue(
        buildImportedLookup({
          data: {
            id: "app-1",
            import_content_hash: "hash-1",
            contact_id: "contact-1",
          },
          error: null,
        }),
      ),
      rpc: vi.fn(),
    };

    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { createImportedApplication } = await import("./application-imports");
    const result = await createImportedApplication({
      program: "internship",
      answers: {
        first_name: "Max",
        last_name: "Schneider",
        email: "max@example.com",
      },
      submittedAt: "2026-01-21T21:03:43.000Z",
      importSource: "google_forms:internship",
      importSubmissionId: "submission-1",
      importContentHash: "hash-1",
    });

    expect(result).toEqual({
      status: "duplicate",
      applicationId: "app-1",
      contactId: "contact-1",
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("downgrades to duplicate when the hash differs but every change is cosmetic only", async () => {
    const client = {
      from: vi.fn().mockReturnValue(
        buildImportedLookup({
          data: {
            id: "app-1",
            import_content_hash: "hash-old",
            contact_id: "contact-1",
            submitted_at: "2026-01-21T21:03:43.000Z",
            answers: {
              first_name: "max",
              last_name: '"Schneider"',
              email: "max@example.com",
              anything_else: "  Hello world  ",
            },
          },
          error: null,
        }),
      ),
      rpc: vi.fn(),
    };

    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { createImportedApplication } = await import("./application-imports");
    const result = await createImportedApplication({
      program: "internship",
      answers: {
        first_name: "Max",
        last_name: "Schneider",
        email: "Max@Example.com",
        anything_else: "Hello   world",
      },
      submittedAt: "2026-01-21T21:03:43.000Z",
      importSource: "google_forms:internship",
      importSubmissionId: "submission-1",
      importContentHash: "hash-new",
    });

    expect(result).toEqual({
      status: "duplicate",
      applicationId: "app-1",
      contactId: "contact-1",
    });
  });

  it("ignores legacy CSV-fragmentation artifacts when comparing multiselect arrays", async () => {
    const importedLookup = buildImportedLookup({ data: null, error: null });
    const legacyLookup = buildLegacyLookup({
      data: [
        {
          id: "legacy-app",
          contact_id: "contact-1",
          submitted_at: "2026-04-12T05:14:00.000Z",
          answers: {
            first_name: "Sam",
            last_name: "Diver",
            email: "scuba.had@gmail.com",
            equipment_owned: [
              "Action camera (GoPro",
              "Osmo",
              "Insta360",
              "etc)",
              "Compact camera with housing",
            ],
            marine_subjects: [
              "Big marine life (sharks",
              "whales",
              "etc.)",
            ],
            languages: [
              "English",
              "Spanish",
              "French",
              "German",
              "Portuguese,Catalan",
            ],
          },
        },
      ],
      error: null,
    });

    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(importedLookup)
        .mockReturnValueOnce(legacyLookup),
      rpc: vi.fn(),
    };

    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { createImportedApplication } = await import("./application-imports");
    const result = await createImportedApplication({
      program: "photography",
      answers: {
        first_name: "Sam",
        last_name: "Diver",
        email: "scuba.had@gmail.com",
        equipment_owned: [
          "Action camera (GoPro, Osmo, Insta360, etc)",
          "Compact camera with housing",
        ],
        marine_subjects: ["Big marine life (sharks, whales, etc.)"],
        languages: [
          "English",
          "Spanish",
          "French",
          "German",
          "Portuguese",
          "Catalan",
        ],
      },
      submittedAt: "2026-04-12T05:14:00.000Z",
      importSource: "google_forms:photography",
      importSubmissionId: "submission-photography-1",
      importContentHash: "fresh-hash",
      dryRun: true,
    });

    expect(result).toEqual({ status: "would_backfill" });
  });

  it("reports drift with a per-field diff when the submission id already exists with a different content hash", async () => {
    const client = {
      from: vi.fn().mockReturnValue(
        buildImportedLookup({
          data: {
            id: "app-1",
            import_content_hash: "hash-old",
            contact_id: "contact-1",
            submitted_at: "2026-01-21T21:03:43.000Z",
            answers: {
              first_name: "Max",
              last_name: "Schneider",
              email: "max@example.com",
              phone: "+491234",
            },
          },
          error: null,
        }),
      ),
      rpc: vi.fn(),
    };

    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { createImportedApplication } = await import("./application-imports");
    const result = await createImportedApplication({
      program: "internship",
      answers: {
        first_name: "Maximilian",
        last_name: "Schneider",
        email: "max@example.com",
      },
      submittedAt: "2026-01-21T21:03:43.000Z",
      importSource: "google_forms:internship",
      importSubmissionId: "submission-1",
      importContentHash: "hash-new",
    });

    expect(result).toEqual({
      status: "drift",
      applicationId: "app-1",
      contactId: "contact-1",
      email: "max@example.com",
      submittedAt: "2026-01-21T21:03:43.000Z",
      driftKind: "already_imported",
      changedFields: [
        { field: "first_name", before: "Max", after: "Maximilian" },
        { field: "phone", before: "+491234", after: undefined },
      ],
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("backfills metadata onto a matching legacy application instead of inserting a duplicate", async () => {
    const importedLookup = buildImportedLookup({
      data: null,
      error: null,
    });
    const legacyLookup = buildLegacyLookup({
      data: [
        {
          id: "legacy-app",
          contact_id: "contact-1",
          submitted_at: "2026-01-21T21:03:43.000Z",
          answers: {
            first_name: "Max",
            last_name: "Schneider",
            email: "max@example.com",
            phone: "+491234",
          },
        },
      ],
      error: null,
    });
    const { update, updateQuery } = buildUpdateBase({
      data: { id: "legacy-app" },
      error: null,
    });

    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(importedLookup)
        .mockReturnValueOnce(legacyLookup)
        .mockReturnValueOnce({
          update,
        }),
      rpc: vi.fn(),
    };

    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { buildAcademyImportContentHash } = await import("@/lib/academy/import");
    const { createImportedApplication } = await import("./application-imports");
    const importContentHash = buildAcademyImportContentHash({
      program: "internship",
      submittedAt: "2026-01-21T21:03:43.000Z",
      answers: {
        first_name: "Max",
        last_name: "Schneider",
        email: "max@example.com",
        phone: "+491234",
      },
    });
    const result = await createImportedApplication({
      program: "internship",
      answers: {
        first_name: "Max",
        last_name: "Schneider",
        email: "max@example.com",
        phone: "+491234",
      },
      submittedAt: "2026-01-21T21:03:43.000Z",
      importSource: "google_forms:internship",
      importSubmissionId: "submission-1",
      importContentHash,
    });

    expect(result).toEqual({
      status: "backfilled",
      applicationId: "legacy-app",
      contactId: "contact-1",
    });
    expect(update).toHaveBeenCalledWith({
      import_source: "google_forms:internship",
      import_submission_id: "submission-1",
      import_content_hash: importContentHash,
    });
    expect(updateQuery.eq).toHaveBeenCalledWith("id", "legacy-app");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("backfills metadata and reports drift when a matching legacy application was edited", async () => {
    const importedLookup = buildImportedLookup({
      data: null,
      error: null,
    });
    const legacyLookup = buildLegacyLookup({
      data: [
        {
          id: "legacy-app",
          contact_id: "contact-1",
          submitted_at: "2026-01-21T21:03:43.000Z",
          answers: {
            first_name: "Max",
            last_name: "Schneider",
            email: "max@example.com",
            phone: "+491234",
            anything_else: "Legacy note",
          },
        },
      ],
      error: null,
    });
    const { update } = buildUpdateBase({
      data: { id: "legacy-app" },
      error: null,
    });

    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(importedLookup)
        .mockReturnValueOnce(legacyLookup)
        .mockReturnValueOnce({
          update,
        }),
      rpc: vi.fn(),
    };

    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { createImportedApplication } = await import("./application-imports");
    const result = await createImportedApplication({
      program: "internship",
      answers: {
        first_name: "Max",
        last_name: "Schneider",
        email: "max@example.com",
        phone: "+491234",
      },
      submittedAt: "2026-01-21T21:03:43.000Z",
      importSource: "google_forms:internship",
      importSubmissionId: "submission-1",
      importContentHash: "live-hash",
    });

    expect(result).toEqual({
      status: "drift",
      applicationId: "legacy-app",
      contactId: "contact-1",
      email: "max@example.com",
      submittedAt: "2026-01-21T21:03:43.000Z",
      driftKind: "legacy",
      changedFields: [
        { field: "anything_else", before: "Legacy note", after: undefined },
      ],
    });
    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      import_source: "google_forms:internship",
      import_submission_id: "submission-1",
    });
    expect(payload?.import_content_hash).not.toBe("live-hash");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("marks ambiguous legacy matches instead of guessing which row to backfill", async () => {
    const importedLookup = buildImportedLookup({
      data: null,
      error: null,
    });
    const legacyLookup = buildLegacyLookup({
      data: [
        {
          id: "legacy-1",
          contact_id: "contact-1",
          submitted_at: "2026-01-21T21:03:43.000Z",
          answers: {
            email: "max@example.com",
          },
        },
        {
          id: "legacy-2",
          contact_id: "contact-2",
          submitted_at: "2026-01-21T21:03:43.000Z",
          answers: {
            email: "max@example.com",
          },
        },
      ],
      error: null,
    });

    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(importedLookup)
        .mockReturnValueOnce(legacyLookup),
      rpc: vi.fn(),
    };

    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { createImportedApplication } = await import("./application-imports");
    const result = await createImportedApplication({
      program: "internship",
      answers: {
        first_name: "Max",
        last_name: "Schneider",
        email: "max@example.com",
      },
      submittedAt: "2026-01-21T21:03:43.000Z",
      importSource: "google_forms:internship",
      importSubmissionId: "submission-1",
      importContentHash: "hash-1",
    });

    expect(result).toEqual({
      status: "ambiguous",
      applicationIds: ["legacy-1", "legacy-2"],
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
