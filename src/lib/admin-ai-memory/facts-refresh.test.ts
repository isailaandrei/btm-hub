import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Application, Contact, ContactNote } from "@/types/database";
import type { CrmAiContactDossier } from "@/types/admin-ai-memory";

vi.mock("@/lib/data/admin-ai-memory", () => ({
  loadContactCrmSources: vi.fn(),
  getContactDossier: vi.fn(),
  deleteStaleCurrentCrmEvidenceChunksForContact: vi.fn(),
  upsertEvidenceChunks: vi.fn(),
  patchContactDossierStructural: vi.fn(),
}));

vi.mock("@/lib/data/admin-ai-retrieval", () => ({
  queryAdminAiContactFacts: vi.fn(),
}));

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const APP_ID = "22222222-2222-4222-8222-222222222222";

function makeContact(): Contact {
  return {
    id: CONTACT_ID,
    email: "joana@example.com",
    name: "Joana",
    phone: null,
    profile_id: null,
    created_at: "2026-04-15T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
  };
}

function makeApplication(): Application {
  return {
    id: APP_ID,
    user_id: null,
    contact_id: CONTACT_ID,
    program: "filmmaking",
    status: "reviewing",
    answers: { ultimate_vision: "ocean voice" },
    tags: [],
    admin_notes: [
      {
        author_id: "admin-1",
        author_name: "Andrei",
        text: "Strong interview — push to accept",
        created_at: "2026-04-17T10:00:00Z",
      },
    ],
    submitted_at: "2026-04-10T00:00:00Z",
    updated_at: "2026-04-10T00:00:00Z",
  };
}

function makeContactNote(): ContactNote {
  return {
    id: "note-1",
    contact_id: CONTACT_ID,
    author_id: "admin-1",
    author_name: "Andrei",
    text: "Met at the dock",
    created_at: "2026-04-16T10:00:00Z",
  };
}

function makeDossier(): CrmAiContactDossier {
  return {
    contact_id: CONTACT_ID,
    dossier_version: 2,
    generator_version: "dossier-prompt-v1",
    source_fingerprint: "fp-original",
    source_coverage: {
      applicationCount: 1,
      contactNoteCount: 0,
      applicationAdminNoteCount: 0,
      whatsappMessageCount: 0,
      instagramMessageCount: 0,
      zoomChunkCount: 0,
    },
    facts_json: { stale: true },
    signals_json: {
      motivation: [{ value: "Ocean focus", confidence: "high" }],
      communicationStyle: [],
      reliabilitySignals: [],
      fitSignals: [],
      concerns: [],
    },
    contradictions_json: [],
    unknowns_json: [],
    evidence_anchors_json: [],
    short_summary: "Previous summary",
    medium_summary: "Previous medium",
    confidence_json: {},
    last_built_at: "2026-04-15T00:00:00Z",
    stale_at: null,
    created_at: "2026-04-15T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
  };
}

describe("refreshContactMemoryFacts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("syncs chunks and patches dossier facts", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    const retrievalMod = await import("@/lib/data/admin-ai-retrieval");

    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue({
      contact: makeContact(),
      applications: [makeApplication()],
      contactNotes: [makeContactNote()],
    });
    vi.mocked(retrievalMod.queryAdminAiContactFacts).mockResolvedValue([
      {
        contact_id: CONTACT_ID,
        application_id: APP_ID,
        contact_name: "Joana",
        contact_email: "joana@example.com",
        contact_phone: null,
        program: "filmmaking",
        status: "reviewing",
        submitted_at: "2026-04-10T00:00:00Z",
        tag_ids: ["tag-1"],
        tag_names: ["red flag"],
        budget: "Medium",
        time_availability: null,
        start_timeline: null,
        btm_category: null,
        travel_willingness: null,
        languages: null,
        country_of_residence: null,
        certification_level: null,
        years_experience: null,
        involvement_level: null,
      },
    ]);
    vi.mocked(dataMod.getContactDossier).mockResolvedValue(makeDossier());

    const { refreshContactMemoryFacts } = await import("./facts-refresh");
    const result = await refreshContactMemoryFacts({ contactId: CONTACT_ID });

    expect(result.status).toBe("refreshed");
    expect(result.dossierPatched).toBe(true);
    expect(dataMod.deleteStaleCurrentCrmEvidenceChunksForContact).toHaveBeenCalled();
    expect(dataMod.upsertEvidenceChunks).toHaveBeenCalled();
    expect(dataMod.patchContactDossierStructural).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: CONTACT_ID,
        facts: expect.objectContaining({
          contact: expect.objectContaining({ contactId: CONTACT_ID }),
          tags: expect.objectContaining({ tagNames: ["red flag"] }),
        }),
        staleAt: expect.any(String),
      }),
    );
  });

  it("returns missing_sources when the contact does not exist", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue(null);
    const { refreshContactMemoryFacts } = await import("./facts-refresh");
    const result = await refreshContactMemoryFacts({ contactId: CONTACT_ID });
    expect(result.status).toBe("missing_sources");
    expect(dataMod.upsertEvidenceChunks).not.toHaveBeenCalled();
    expect(dataMod.patchContactDossierStructural).not.toHaveBeenCalled();
  });

  it("syncs chunks but skips patches when no dossier exists yet", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue({
      contact: makeContact(),
      applications: [makeApplication()],
      contactNotes: [makeContactNote()],
    });
    vi.mocked(dataMod.getContactDossier).mockResolvedValue(null);

    const { refreshContactMemoryFacts } = await import("./facts-refresh");
    const result = await refreshContactMemoryFacts({ contactId: CONTACT_ID });
    expect(result.status).toBe("no_dossier");
    expect(result.dossierPatched).toBe(false);
    expect(dataMod.upsertEvidenceChunks).toHaveBeenCalled();
    expect(dataMod.patchContactDossierStructural).not.toHaveBeenCalled();
  });

  it("never calls the dossier generator (no OpenAI call in the facts-only path)", async () => {
    const dataMod = await import("@/lib/data/admin-ai-memory");
    const retrievalMod = await import("@/lib/data/admin-ai-retrieval");

    vi.mocked(dataMod.loadContactCrmSources).mockResolvedValue({
      contact: makeContact(),
      applications: [makeApplication()],
      contactNotes: [makeContactNote()],
    });
    vi.mocked(retrievalMod.queryAdminAiContactFacts).mockResolvedValue([]);
    vi.mocked(dataMod.getContactDossier).mockResolvedValue(makeDossier());
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { refreshContactMemoryFacts } = await import("./facts-refresh");
    await refreshContactMemoryFacts({ contactId: CONTACT_ID });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
