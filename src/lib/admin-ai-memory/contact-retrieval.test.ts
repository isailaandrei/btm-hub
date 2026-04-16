import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CrmAiContactDossier } from "@/types/admin-ai-memory";

vi.mock("@/lib/data/admin-ai-memory", () => ({
  getContactDossier: vi.fn(),
  listContactDossierStates: vi.fn(),
  listEvidenceChunksByContact: vi.fn(),
}));

vi.mock("@/lib/data/admin-ai-retrieval", () => ({
  searchAdminAiEvidence: vi.fn(),
  listRecentAdminAiEvidence: vi.fn(),
}));

vi.mock("./backfill", () => ({
  rebuildContactMemory: vi.fn(),
}));

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";

function makeDossier(): CrmAiContactDossier {
  return {
    contact_id: CONTACT_ID,
    dossier_version: 1,
    generator_version: "dossier-prompt-v1",
    source_fingerprint: "fp",
    source_coverage: {
      applicationCount: 1,
      contactNoteCount: 0,
      applicationAdminNoteCount: 0,
      whatsappMessageCount: 0,
      instagramMessageCount: 0,
      zoomChunkCount: 0,
    },
    facts_json: { name: "Joana" },
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
    short_summary: "Short.",
    medium_summary: "Medium.",
    confidence_json: {},
    last_built_at: "2026-04-15T00:00:00Z",
    stale_at: null,
    created_at: "2026-04-15T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
  };
}

describe("assembleContactScopedMemory", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("loads dossier first, then contact-scoped raw evidence", async () => {
    const memoryMod = await import("@/lib/data/admin-ai-memory");
    const retrievalMod = await import("@/lib/data/admin-ai-retrieval");

    vi.mocked(memoryMod.getContactDossier).mockResolvedValue(makeDossier());
    vi.mocked(retrievalMod.searchAdminAiEvidence).mockResolvedValue([
      {
        evidenceId: "e1",
        contactId: CONTACT_ID,
        applicationId: null,
        sourceType: "contact_note",
        sourceId: "note-1",
        sourceLabel: "Contact note",
        sourceTimestamp: null,
        program: null,
        text: "great person",
      },
    ]);

    const { assembleContactScopedMemory } = await import("./contact-retrieval");
    const result = await assembleContactScopedMemory({
      contactId: CONTACT_ID,
      question: "what do we know?",
      textFocus: ["motivation"],
    });

    expect(memoryMod.getContactDossier).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
    });
    const evArgs = vi.mocked(retrievalMod.searchAdminAiEvidence).mock.calls[0][0];
    expect(evArgs.contactId).toBe(CONTACT_ID);
    expect(result.dossier).not.toBeNull();
    expect(result.evidence).toHaveLength(1);
    expect(result.fallbackUsed).toBe(false);
  });

  it("falls back to recent raw chunks when text-focused evidence search is empty", async () => {
    const memoryMod = await import("@/lib/data/admin-ai-memory");
    const retrievalMod = await import("@/lib/data/admin-ai-retrieval");

    vi.mocked(memoryMod.getContactDossier).mockResolvedValue(makeDossier());
    vi.mocked(retrievalMod.searchAdminAiEvidence).mockResolvedValue([]);
    vi.mocked(retrievalMod.listRecentAdminAiEvidence).mockResolvedValue([
      {
        evidenceId: "chunk-1",
        contactId: CONTACT_ID,
        applicationId: null,
        sourceType: "contact_note",
        sourceId: "note-1",
        sourceLabel: "Contact note",
        sourceTimestamp: null,
        program: null,
        text: "Recent note fallback",
      },
    ]);

    const { assembleContactScopedMemory } = await import("./contact-retrieval");
    const result = await assembleContactScopedMemory({
      contactId: CONTACT_ID,
      question: "what do we know?",
      textFocus: ["rare-term"],
    });

    expect(retrievalMod.listRecentAdminAiEvidence).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      limit: 40,
    });
    expect(result.evidence).toEqual([
      expect.objectContaining({
        evidenceId: "chunk-1",
        text: "Recent note fallback",
      }),
    ]);
  });

  it("flags fallbackUsed and still returns evidence when no dossier exists", async () => {
    const memoryMod = await import("@/lib/data/admin-ai-memory");
    const retrievalMod = await import("@/lib/data/admin-ai-retrieval");
    const backfillMod = await import("./backfill");

    vi.mocked(memoryMod.getContactDossier).mockResolvedValue(null);
    vi.mocked(backfillMod.rebuildContactMemory).mockResolvedValue({
      contactId: CONTACT_ID,
      status: "missing_sources",
      chunkCount: 0,
      dossierUpserted: false,
      rankingCardUpserted: false,
    });
    vi.mocked(retrievalMod.searchAdminAiEvidence).mockResolvedValue([
      {
        evidenceId: "e1",
        contactId: CONTACT_ID,
        applicationId: null,
        sourceType: "contact_note",
        sourceId: "note-1",
        sourceLabel: "Contact note",
        sourceTimestamp: null,
        program: null,
        text: "great person",
      },
    ]);

    const { assembleContactScopedMemory } = await import("./contact-retrieval");
    const result = await assembleContactScopedMemory({
      contactId: CONTACT_ID,
      question: "what do we know?",
      textFocus: [],
    });
    expect(result.dossier).toBeNull();
    expect(result.fallbackUsed).toBe(true);
    expect(result.evidence).toHaveLength(1);
    expect(backfillMod.rebuildContactMemory).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
    });
  });

  it("never leaks evidence from a different contact", async () => {
    const memoryMod = await import("@/lib/data/admin-ai-memory");
    const retrievalMod = await import("@/lib/data/admin-ai-retrieval");

    vi.mocked(memoryMod.getContactDossier).mockResolvedValue(makeDossier());
    vi.mocked(retrievalMod.searchAdminAiEvidence).mockResolvedValue([
      {
        evidenceId: "e1",
        contactId: "different-contact",
        applicationId: null,
        sourceType: "contact_note",
        sourceId: "note-99",
        sourceLabel: "Contact note",
        sourceTimestamp: null,
        program: null,
        text: "wrong contact",
      },
    ]);
    const { assembleContactScopedMemory } = await import("./contact-retrieval");
    await expect(
      assembleContactScopedMemory({
        contactId: CONTACT_ID,
        question: "test",
        textFocus: [],
      }),
    ).rejects.toThrow(/contact-scope leak/i);
  });
});
