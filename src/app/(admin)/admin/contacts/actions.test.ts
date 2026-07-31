import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Profile } from "@/types/database";

const mockProfile: Profile = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "admin@test.com",
  display_name: "Admin",
  bio: null,
  avatar_url: null,
  role: "admin",
  preferences: {},
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue(mockProfile),
}));

const mockUpdateContact = vi.fn();
const mockAssignTag = vi.fn();
const mockCreateTag = vi.fn();
const mockUnassignTag = vi.fn();
const mockBulkAssignTags = vi.fn();
const mockBulkUnassignTags = vi.fn();
const mockDeleteApplication = vi.fn();
const mockGetContactById = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("@/lib/data/contacts", () => ({
  updateContact: mockUpdateContact,
  assignTag: mockAssignTag,
  createTag: mockCreateTag,
  unassignTag: mockUnassignTag,
  bulkAssignTags: mockBulkAssignTags,
  bulkUnassignTags: mockBulkUnassignTags,
  deleteApplication: mockDeleteApplication,
  getContactById: mockGetContactById,
}));

const mockGetActiveSuppressionForContact = vi.fn();

vi.mock("@/lib/data/email-suppressions", () => ({
  excludeContactEmail: vi.fn(),
  liftContactExclusion: vi.fn(),
  getActiveSuppressionForContact: mockGetActiveSuppressionForContact,
}));

const mockUpdateProfilePreferences = vi.fn();

vi.mock("@/lib/data/profiles", () => ({
  updateProfilePreferences: mockUpdateProfilePreferences,
}));

const mockUpsertConversationDigestCorrection = vi.fn();
const mockGetDigestModelState = vi.fn();

vi.mock("@/lib/data/conversations", () => ({
  getDigestModelState: mockGetDigestModelState,
  listContactConversationDigests: vi.fn(),
  listContactConversationMessages: vi.fn(),
  listContactCurrentConversationFacts: vi.fn(),
  setConversationMessageDeactivated: vi.fn(),
  upsertConversationDigestCorrection: mockUpsertConversationDigestCorrection,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

const {
  updatePreferences,
  bulkAssignTag,
  bulkUnassignTag,
  createAndAssignContactTag,
  editContact,
  deleteApplication,
  loadContactEmailSection,
  correctContactDigest,
} = await import(
  "./actions"
);

describe("updatePreferences", () => {
  beforeEach(() => {
    mockProfile.preferences = {};
    mockUpdateProfilePreferences.mockResolvedValue({});
  });

  it("calls updateProfilePreferences with admin id and patch", async () => {
    const patch = { contacts_table: { visible_columns: ["budget"] } };
    await updatePreferences(patch);
    expect(mockUpdateProfilePreferences).toHaveBeenCalledWith(mockProfile.id, patch);
  });

  it("preserves existing contacts_table preferences when patching one key", async () => {
    mockProfile.preferences = {
      contacts_table: {
        visible_columns: ["budget"],
        previously_selected_columns: ["budget", "age"],
      },
    };

    await updatePreferences({
      contacts_table: {
        sort_by: { key: "name", direction: "asc" },
        page_size: 50,
      },
    });

    expect(mockUpdateProfilePreferences).toHaveBeenCalledWith(mockProfile.id, {
      contacts_table: {
        visible_columns: ["budget"],
        previously_selected_columns: ["budget", "age"],
        sort_by: { key: "name", direction: "asc" },
        page_size: 50,
      },
    });
  });

  it("rejects unsupported preference keys", async () => {
    await expect(
      updatePreferences({ contacts_table: { dangerous: true } }),
    ).rejects.toThrow("Invalid preferences");

    expect(mockUpdateProfilePreferences).not.toHaveBeenCalled();
  });

  it("rejects invalid contacts table sort preferences", async () => {
    await expect(
      updatePreferences({
        contacts_table: {
          sort_by: { key: "name", direction: "sideways" },
        },
      }),
    ).rejects.toThrow("Invalid preferences");

    expect(mockUpdateProfilePreferences).not.toHaveBeenCalled();
  });
});

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("bulkAssignTag", () => {
  beforeEach(() => {
    mockRevalidatePath.mockReset();
    mockBulkAssignTags.mockResolvedValue({
      requested: 2,
      existing: 2,
      inserted: 2,
      alreadyAssigned: 0,
      skippedMissing: 0,
    });
  });

  it("throws for invalid contact UUID", async () => {
    await expect(bulkAssignTag(["not-a-uuid"], VALID_UUID)).rejects.toThrow(
      "Invalid contact ID",
    );
    expect(mockBulkAssignTags).not.toHaveBeenCalled();
  });

  it("throws for invalid tag UUID", async () => {
    await expect(bulkAssignTag([VALID_UUID], "bad")).rejects.toThrow(
      "Invalid tag ID",
    );
    expect(mockBulkAssignTags).not.toHaveBeenCalled();
  });

  it("calls bulkAssignTags with valid input", async () => {
    const ids = [VALID_UUID, "660e8400-e29b-41d4-a716-446655440001"];
    await expect(bulkAssignTag(ids, VALID_UUID)).resolves.toEqual({
      requested: 2,
      existing: 2,
      inserted: 2,
      alreadyAssigned: 0,
      skippedMissing: 0,
    });
    expect(mockBulkAssignTags).toHaveBeenCalledWith(ids, VALID_UUID);
  });

  it("does nothing for empty array", async () => {
    await bulkAssignTag([], VALID_UUID);
    expect(mockBulkAssignTags).not.toHaveBeenCalled();
  });
});

describe("createAndAssignContactTag", () => {
  const CATEGORY_UUID = "770e8400-e29b-41d4-a716-446655440002";
  const createdTag = {
    id: "880e8400-e29b-41d4-a716-446655440003",
    category_id: CATEGORY_UUID,
    name: "Joining",
    sort_order: 3,
    updated_at: "2026-07-31T00:00:00Z",
  };

  beforeEach(() => {
    mockRevalidatePath.mockReset();
    mockCreateTag.mockReset().mockResolvedValue(createdTag);
    mockAssignTag.mockReset().mockResolvedValue(undefined);
  });

  it("returns invalid_input for a bad contact UUID", async () => {
    await expect(
      createAndAssignContactTag("nope", CATEGORY_UUID, "Joining"),
    ).resolves.toMatchObject({ ok: false, code: "invalid_input" });
    expect(mockCreateTag).not.toHaveBeenCalled();
  });

  it("returns invalid_input for a bad category UUID", async () => {
    await expect(
      createAndAssignContactTag(VALID_UUID, "nope", "Joining"),
    ).resolves.toMatchObject({ ok: false, code: "invalid_input" });
    expect(mockCreateTag).not.toHaveBeenCalled();
  });

  it("returns invalid_input for an empty name without touching the DB", async () => {
    await expect(
      createAndAssignContactTag(VALID_UUID, CATEGORY_UUID, "   "),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid_input",
      message: "Tag name is required",
    });
    expect(mockCreateTag).not.toHaveBeenCalled();
    expect(mockAssignTag).not.toHaveBeenCalled();
  });

  it("creates, assigns, revalidates all contact pages, and returns the tag", async () => {
    await expect(
      createAndAssignContactTag(VALID_UUID, CATEGORY_UUID, "  Joining  "),
    ).resolves.toEqual({ ok: true, tag: createdTag });
    expect(mockCreateTag).toHaveBeenCalledWith(CATEGORY_UUID, "Joining");
    expect(mockAssignTag).toHaveBeenCalledWith(VALID_UUID, createdTag.id);
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      "/admin/contacts/[id]",
      "page",
    );
  });

  it("returns duplicate_name with the friendly message", async () => {
    mockCreateTag.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "tags_key"'),
    );
    await expect(
      createAndAssignContactTag(VALID_UUID, CATEGORY_UUID, "Joining"),
    ).resolves.toEqual({
      ok: false,
      code: "duplicate_name",
      message: "A tag with that name already exists in this category.",
    });
    expect(mockAssignTag).not.toHaveBeenCalled();
  });

  it("returns created_not_assigned with the tag when the assign step fails", async () => {
    mockAssignTag.mockRejectedValue(new Error("boom"));
    const result = await createAndAssignContactTag(
      VALID_UUID,
      CATEGORY_UUID,
      "Joining",
    );
    expect(result).toMatchObject({
      ok: false,
      code: "created_not_assigned",
      tag: createdTag,
    });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rethrows unexpected create failures", async () => {
    mockCreateTag.mockRejectedValue(new Error("connection reset"));
    await expect(
      createAndAssignContactTag(VALID_UUID, CATEGORY_UUID, "Joining"),
    ).rejects.toThrow("connection reset");
    expect(mockAssignTag).not.toHaveBeenCalled();
  });
});

describe("editContact", () => {
  beforeEach(() => {
    mockUpdateContact.mockResolvedValue(undefined);
  });

  it("rejects invalid email addresses before touching the data layer", async () => {
    await expect(
      editContact(VALID_UUID, { email: "not-an-email" }),
    ).rejects.toThrow("Please enter a valid email address");
    expect(mockUpdateContact).not.toHaveBeenCalled();
  });

  it("passes the expectedUpdatedAt option through for conflict checks", async () => {
    await editContact(
      VALID_UUID,
      { email: "ADMIN@TEST.COM " },
      { expectedUpdatedAt: "2024-01-01T00:00:00Z" },
    );

    expect(mockUpdateContact).toHaveBeenCalledWith(
      VALID_UUID,
      { email: "admin@test.com" },
      { expectedUpdatedAt: "2024-01-01T00:00:00Z" },
    );
  });
});


describe("deleteApplication", () => {
  beforeEach(() => {
    mockRevalidatePath.mockReset();
    mockDeleteApplication.mockResolvedValue({
      id: VALID_UUID,
      contact_id: "660e8400-e29b-41d4-a716-446655440001",
    });
  });

  it("revalidates the deleted application's contact detail path", async () => {
    await deleteApplication(VALID_UUID);

    expect(mockDeleteApplication).toHaveBeenCalledWith(VALID_UUID);
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      "/admin/contacts/660e8400-e29b-41d4-a716-446655440001",
    );
  });
});

describe("loadContactEmailSection", () => {
  beforeEach(() => {
    mockGetContactById.mockReset();
    mockGetActiveSuppressionForContact.mockReset();
    mockGetContactById.mockResolvedValue({
      id: VALID_UUID,
      email: "jane@example.com",
    });
  });

  it("resolves the email server-side from the contact id (never the client)", async () => {
    mockGetActiveSuppressionForContact.mockResolvedValue(null);

    await loadContactEmailSection(VALID_UUID);

    expect(mockGetContactById).toHaveBeenCalledWith(VALID_UUID);
    // Email passed to the suppression lookup is the server-resolved one.
    expect(mockGetActiveSuppressionForContact).toHaveBeenCalledWith({
      contactId: VALID_UUID,
      email: "jane@example.com",
    });
  });

  it("reports excluded with its reason when a suppression exists", async () => {
    mockGetActiveSuppressionForContact.mockResolvedValue({
      reason: "unsubscribe",
    });

    await expect(loadContactEmailSection(VALID_UUID)).resolves.toEqual({
      excluded: true,
      reason: "unsubscribe",
    });
  });

  it("reports not-excluded when there is no suppression", async () => {
    mockGetActiveSuppressionForContact.mockResolvedValue(null);

    await expect(loadContactEmailSection(VALID_UUID)).resolves.toEqual({
      excluded: false,
      reason: null,
    });
  });

  it("throws for an unknown contact rather than faking a status", async () => {
    mockGetContactById.mockResolvedValue(null);

    await expect(loadContactEmailSection(VALID_UUID)).rejects.toThrow(
      "Contact not found",
    );
    expect(mockGetActiveSuppressionForContact).not.toHaveBeenCalled();
  });
});

describe("bulkUnassignTag", () => {
  beforeEach(() => {
    mockRevalidatePath.mockReset();
    mockBulkUnassignTags.mockResolvedValue({});
  });

  it("throws for invalid contact UUID", async () => {
    await expect(bulkUnassignTag(["not-a-uuid"], VALID_UUID)).rejects.toThrow(
      "Invalid contact ID",
    );
    expect(mockBulkUnassignTags).not.toHaveBeenCalled();
  });

  it("throws for invalid tag UUID", async () => {
    await expect(bulkUnassignTag([VALID_UUID], "bad")).rejects.toThrow(
      "Invalid tag ID",
    );
    expect(mockBulkUnassignTags).not.toHaveBeenCalled();
  });

  it("calls bulkUnassignTags with valid input", async () => {
    const ids = [VALID_UUID, "660e8400-e29b-41d4-a716-446655440001"];
    await bulkUnassignTag(ids, VALID_UUID);
    expect(mockBulkUnassignTags).toHaveBeenCalledWith(ids, VALID_UUID);
  });

  it("does nothing for empty array", async () => {
    await bulkUnassignTag([], VALID_UUID);
    expect(mockBulkUnassignTags).not.toHaveBeenCalled();
  });
});

describe("correctContactDigest", () => {
  const CONTENT_HASH = "a".repeat(64);

  beforeEach(() => {
    mockRevalidatePath.mockReset();
    mockUpsertConversationDigestCorrection
      .mockReset()
      .mockResolvedValue(undefined);
    // Default model state: a signal digest with a non-empty summary, so a signal
    // label without a correctedSummary is allowed (effective summary won't be
    // empty), and an inherited (label-null) effective label resolves to profile.
    mockGetDigestModelState.mockReset().mockResolvedValue({
      isNoise: false,
      relevance: "profile",
      summary: "Runs a dive school in Bali.",
    });
  });

  it("throws for an invalid contact UUID before touching the data layer", async () => {
    await expect(
      correctContactDigest({
        contactId: "not-a-uuid",
        contentHash: CONTENT_HASH,
        label: "status",
        correctedSummary: null,
        correctedEventDate: null,
        originalRelevance: "profile",
        originalIsNoise: false,
        dismissed: false,
      }),
    ).rejects.toThrow("Invalid");
    expect(mockUpsertConversationDigestCorrection).not.toHaveBeenCalled();
  });

  it("rejects a malformed content hash", async () => {
    await expect(
      correctContactDigest({
        contactId: VALID_UUID,
        contentHash: "not-a-hash",
        label: "status",
        correctedSummary: null,
        correctedEventDate: null,
        originalRelevance: "profile",
        originalIsNoise: false,
        dismissed: false,
      }),
    ).rejects.toThrow();
    expect(mockUpsertConversationDigestCorrection).not.toHaveBeenCalled();
  });

  it("rejects labels outside profile/status/noise", async () => {
    await expect(
      correctContactDigest({
        contactId: VALID_UUID,
        contentHash: CONTENT_HASH,
        // @ts-expect-error — invalid label must be rejected at runtime too
        label: "spam",
        correctedSummary: null,
        correctedEventDate: null,
        originalRelevance: "profile",
        originalIsNoise: false,
        dismissed: false,
      }),
    ).rejects.toThrow();
    expect(mockUpsertConversationDigestCorrection).not.toHaveBeenCalled();
  });

  it("rejects a malformed event date", async () => {
    await expect(
      correctContactDigest({
        contactId: VALID_UUID,
        contentHash: CONTENT_HASH,
        label: "status",
        correctedSummary: null,
        correctedEventDate: "2026-13-40",
        originalRelevance: "status",
        originalIsNoise: false,
        dismissed: false,
      }),
    ).rejects.toThrow();
    expect(mockUpsertConversationDigestCorrection).not.toHaveBeenCalled();
  });

  it("rejects a label-less correction that still carries the model originals", async () => {
    // label === null means NO label pair, so originals MUST be null too —
    // otherwise a spurious identity pair leaks into the calibration dataset.
    await expect(
      correctContactDigest({
        contactId: VALID_UUID,
        contentHash: CONTENT_HASH,
        label: null,
        correctedSummary: null,
        correctedEventDate: null,
        originalRelevance: "profile",
        originalIsNoise: false,
        dismissed: false,
      }),
    ).rejects.toThrow();
    expect(mockUpsertConversationDigestCorrection).not.toHaveBeenCalled();
  });

  it("rejects a label correction that omits the model originals", async () => {
    await expect(
      correctContactDigest({
        contactId: VALID_UUID,
        contentHash: CONTENT_HASH,
        label: "status",
        correctedSummary: null,
        correctedEventDate: null,
        originalRelevance: null,
        originalIsNoise: null,
        dismissed: false,
      }),
    ).rejects.toThrow();
    expect(mockUpsertConversationDigestCorrection).not.toHaveBeenCalled();
  });

  it("rejects a signal label that would leave the effective summary empty", async () => {
    // Rescuing a noise-marker window (empty model summary) with no human summary.
    mockGetDigestModelState.mockResolvedValue({
      isNoise: true,
      relevance: null,
      summary: "",
    });
    await expect(
      correctContactDigest({
        contactId: VALID_UUID,
        contentHash: CONTENT_HASH,
        label: "status",
        correctedSummary: null,
        correctedEventDate: null,
        originalRelevance: null,
        originalIsNoise: true,
        dismissed: false,
      }),
    ).rejects.toThrow(/needs a summary/);
    expect(mockUpsertConversationDigestCorrection).not.toHaveBeenCalled();
  });

  it("applies the empty-summary guard against an INHERITED (label-null) status label", async () => {
    // A label-less correction inherits the model's label; here the model is a
    // (degenerate) status window with an empty summary, so the guard still fires.
    mockGetDigestModelState.mockResolvedValue({
      isNoise: false,
      relevance: "status",
      summary: "",
    });
    await expect(
      correctContactDigest({
        contactId: VALID_UUID,
        contentHash: CONTENT_HASH,
        label: null,
        correctedSummary: null,
        correctedEventDate: "2026-08-17",
        originalRelevance: null,
        originalIsNoise: null,
        dismissed: false,
      }),
    ).rejects.toThrow(/needs a summary/);
    expect(mockUpsertConversationDigestCorrection).not.toHaveBeenCalled();
  });

  it("rescues a noise window when a human summary is provided", async () => {
    mockGetDigestModelState.mockResolvedValue({
      isNoise: true,
      relevance: null,
      summary: "",
    });
    await correctContactDigest({
      contactId: VALID_UUID,
      contentHash: CONTENT_HASH,
      label: "status",
      correctedSummary: "T-shirt size L, rashguard XL.",
      correctedEventDate: "2026-08-17",
      originalRelevance: null,
      originalIsNoise: true,
      dismissed: false,
    });

    expect(mockUpsertConversationDigestCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        correctedRelevance: "status",
        correctedIsNoise: false,
        correctedSummary: "T-shirt size L, rashguard XL.",
        correctedEventDate: "2026-08-17",
      }),
    );
  });

  it("records NO label pair for a label-less correction (inherited label)", async () => {
    await correctContactDigest({
      contactId: VALID_UUID,
      contentHash: CONTENT_HASH,
      label: null,
      correctedSummary: "Sharpened event date only.",
      correctedEventDate: "2026-08-17",
      originalRelevance: null,
      originalIsNoise: null,
      dismissed: false,
    });

    expect(mockUpsertConversationDigestCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        correctedIsNoise: null,
        correctedRelevance: null,
        originalRelevance: null,
        originalIsNoise: null,
        dismissedAt: null,
        dismissedBy: null,
      }),
    );
  });

  it("maps a noise correction to corrected_is_noise with no relevance", async () => {
    await correctContactDigest({
      contactId: VALID_UUID,
      contentHash: CONTENT_HASH,
      label: "noise",
      correctedSummary: null,
      correctedEventDate: null,
      originalRelevance: "profile",
      originalIsNoise: false,
      dismissed: false,
    });

    expect(mockUpsertConversationDigestCorrection).toHaveBeenCalledWith({
      contentHash: CONTENT_HASH,
      correctedRelevance: null,
      correctedIsNoise: true,
      correctedSummary: null,
      correctedEventDate: null,
      originalRelevance: "profile",
      originalIsNoise: false,
      dismissedAt: null,
      dismissedBy: null,
      // Attribution comes from requireAdmin's profile, never the client.
      correctedBy: mockProfile.id,
    });
    // A noise correction (explicit label, not dismissed) never needs the model
    // state — no effective-label derivation, no empty-summary guard.
    expect(mockGetDigestModelState).not.toHaveBeenCalled();
  });

  it("maps profile/status corrections to a relevance with is_noise false", async () => {
    await correctContactDigest({
      contactId: VALID_UUID,
      contentHash: CONTENT_HASH,
      label: "status",
      correctedSummary: null,
      correctedEventDate: null,
      originalRelevance: "profile",
      originalIsNoise: false,
      dismissed: false,
    });

    expect(mockUpsertConversationDigestCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        correctedRelevance: "status",
        correctedIsNoise: false,
      }),
    );

    await correctContactDigest({
      contactId: VALID_UUID,
      contentHash: CONTENT_HASH,
      label: "profile",
      correctedSummary: null,
      correctedEventDate: null,
      originalRelevance: null,
      originalIsNoise: true,
      dismissed: false,
    });

    expect(mockUpsertConversationDigestCorrection).toHaveBeenLastCalledWith(
      expect.objectContaining({
        correctedRelevance: "profile",
        correctedIsNoise: false,
        originalRelevance: null,
        originalIsNoise: true,
      }),
    );
  });

  it("dismisses a status digest — sets dismissed_at and dismissed_by from the admin profile", async () => {
    await correctContactDigest({
      contactId: VALID_UUID,
      contentHash: CONTENT_HASH,
      label: "status",
      correctedSummary: null,
      correctedEventDate: null,
      originalRelevance: "status",
      originalIsNoise: false,
      dismissed: true,
    });

    expect(mockUpsertConversationDigestCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        dismissedAt: expect.any(String),
        dismissedBy: mockProfile.id,
      }),
    );
  });

  it("rejects dismissing a digest whose effective label is profile (explicit label)", async () => {
    await expect(
      correctContactDigest({
        contactId: VALID_UUID,
        contentHash: CONTENT_HASH,
        label: "profile",
        correctedSummary: null,
        correctedEventDate: null,
        originalRelevance: "status",
        originalIsNoise: false,
        dismissed: true,
      }),
    ).rejects.toThrow(/Only a status digest/);
    expect(mockUpsertConversationDigestCorrection).not.toHaveBeenCalled();
  });

  it("rejects dismissing a digest whose INHERITED effective label is profile", async () => {
    // label null ⇒ effective label inherited from the model (profile by default).
    await expect(
      correctContactDigest({
        contactId: VALID_UUID,
        contentHash: CONTENT_HASH,
        label: null,
        correctedSummary: null,
        correctedEventDate: null,
        originalRelevance: null,
        originalIsNoise: null,
        dismissed: true,
      }),
    ).rejects.toThrow(/Only a status digest/);
    expect(mockUpsertConversationDigestCorrection).not.toHaveBeenCalled();
  });

  it("revalidates the contact detail path after a correction", async () => {
    await correctContactDigest({
      contactId: VALID_UUID,
      contentHash: CONTENT_HASH,
      label: "status",
      correctedSummary: null,
      correctedEventDate: null,
      originalRelevance: "profile",
      originalIsNoise: false,
      dismissed: false,
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/admin/contacts/${VALID_UUID}`,
    );
  });
});
