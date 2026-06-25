import { beforeEach, describe, expect, it, vi } from "vitest";

const mockArchiveEmailTemplate = vi.fn();
const mockCreateEmailTemplate = vi.fn();
const mockCreateEmailTemplateVersion = vi.fn();
const mockGetEmailTemplateVersion = vi.fn();
const mockListEmailAssetIdsByPublicUrls = vi.fn();
const mockAssertMailyDocument = vi.fn((document: unknown) => document);
const mockGetAssetIdsForMailyDocument = vi.fn();
const mockGetAssetPublicUrlsForMailyDocument = vi.fn();
const mockRenderMailyDocument = vi.fn();
const mockRequireAdmin = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("@/lib/data/email-templates", () => ({
  archiveEmailTemplate: mockArchiveEmailTemplate,
  createEmailTemplate: mockCreateEmailTemplate,
  createEmailTemplateVersion: mockCreateEmailTemplateVersion,
  getEmailTemplateVersion: mockGetEmailTemplateVersion,
}));

vi.mock("@/lib/data/email-assets", () => ({
  listEmailAssetIdsByPublicUrls: mockListEmailAssetIdsByPublicUrls,
}));

vi.mock("@/lib/email/rendering/maily", () => ({
  assertMailyDocument: mockAssertMailyDocument,
  getAssetIdsForMailyDocument: mockGetAssetIdsForMailyDocument,
  getAssetPublicUrlsForMailyDocument: mockGetAssetPublicUrlsForMailyDocument,
  renderMailyDocument: mockRenderMailyDocument,
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

const {
  createAndPublishTemplateAction,
  getTemplateVersionForEditorAction,
  publishTemplateVersionAction,
} = await import("./actions");

const TEMPLATE_ID = "550e8400-e29b-41d4-a716-446655440030";
const VERSION_ID = "550e8400-e29b-41d4-a716-446655440031";
const BUILDER_JSON = { type: "doc", content: [] };

beforeEach(() => {
  mockArchiveEmailTemplate.mockReset();
  mockCreateEmailTemplate.mockReset().mockResolvedValue({
    id: TEMPLATE_ID,
    name: "Newsletter shell",
    description: "Header and footer frame",
    category: "general",
    current_version_id: null,
  });
  mockCreateEmailTemplateVersion.mockReset().mockResolvedValue({
    id: VERSION_ID,
    template_id: TEMPLATE_ID,
  });
  mockGetEmailTemplateVersion.mockReset().mockResolvedValue({
    id: VERSION_ID,
    builder_json: BUILDER_JSON,
    subject_template: "Hello {{contact.name}}",
    preview_text: "A quick note",
  });
  mockAssertMailyDocument.mockClear();
  mockGetAssetIdsForMailyDocument.mockReset().mockReturnValue([]);
  mockGetAssetPublicUrlsForMailyDocument.mockReset().mockReturnValue([]);
  mockListEmailAssetIdsByPublicUrls.mockReset().mockResolvedValue([]);
  mockRenderMailyDocument.mockReset().mockResolvedValue({
    html: "<p>Hello</p>",
    text: "Hello",
  });
  mockRequireAdmin.mockReset().mockResolvedValue({ id: "admin-1" });
  mockRevalidatePath.mockReset();
});

describe("publishTemplateVersionAction", () => {
  it("publishes a visual template without requiring send-time subject fields", async () => {
    const result = await publishTemplateVersionAction({
      templateId: TEMPLATE_ID,
      builderJson: BUILDER_JSON,
    });

    expect(mockCreateEmailTemplateVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: TEMPLATE_ID,
        builderJson: BUILDER_JSON,
      }),
    );
    expect(mockRenderMailyDocument).toHaveBeenCalledWith(BUILDER_JSON);
    expect(result).toEqual({ ok: true, versionId: VERSION_ID });
  });

  it("saves the current subject + preview text with the version", async () => {
    await publishTemplateVersionAction({
      templateId: TEMPLATE_ID,
      builderJson: BUILDER_JSON,
      subjectTemplate: "Welcome {{contact.name}}",
      previewText: "Your spot is confirmed",
    });

    expect(mockCreateEmailTemplateVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectTemplate: "Welcome {{contact.name}}",
        previewText: "Your spot is confirmed",
      }),
    );
  });

  it("defaults subject + preview to empty strings when omitted", async () => {
    await publishTemplateVersionAction({
      templateId: TEMPLATE_ID,
      builderJson: BUILDER_JSON,
    });

    expect(mockCreateEmailTemplateVersion).toHaveBeenCalledWith(
      expect.objectContaining({ subjectTemplate: "", previewText: "" }),
    );
  });
});

describe("createAndPublishTemplateAction", () => {
  it("creates template metadata and publishes its visual document together", async () => {
    const result = await createAndPublishTemplateAction({
      name: "Newsletter shell",
      description: "Header and footer frame",
      builderJson: BUILDER_JSON,
    });

    expect(mockCreateEmailTemplate).toHaveBeenCalledWith({
      name: "Newsletter shell",
      description: "Header and footer frame",
      category: "general",
    });
    expect(mockCreateEmailTemplateVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: TEMPLATE_ID,
        builderJson: BUILDER_JSON,
      }),
    );
    expect(result).toEqual({
      ok: true,
      template: expect.objectContaining({
        id: TEMPLATE_ID,
        name: "Newsletter shell",
        current_version_id: VERSION_ID,
      }),
      versionId: VERSION_ID,
    });
  });

  it("allows the new template description to be omitted", async () => {
    await createAndPublishTemplateAction({
      name: "Simple frame",
      builderJson: BUILDER_JSON,
    });

    expect(mockCreateEmailTemplate).toHaveBeenCalledWith({
      name: "Simple frame",
      description: undefined,
      category: "general",
    });
  });

  it("resolves uploaded image URLs into template asset ids", async () => {
    mockGetAssetPublicUrlsForMailyDocument.mockReturnValue([
      "https://cdn.example.com/email-assets/header.png",
    ]);
    mockListEmailAssetIdsByPublicUrls.mockResolvedValue([
      "550e8400-e29b-41d4-a716-446655440041",
    ]);

    await createAndPublishTemplateAction({
      name: "Image frame",
      builderJson: BUILDER_JSON,
    });

    expect(mockCreateEmailTemplateVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        assetIds: ["550e8400-e29b-41d4-a716-446655440041"],
      }),
    );
  });
});

describe("getTemplateVersionForEditorAction", () => {
  it("returns the visual document plus the saved subject + preview", async () => {
    const result = await getTemplateVersionForEditorAction(VERSION_ID);

    expect(result).toEqual({
      builderJson: BUILDER_JSON,
      subjectTemplate: "Hello {{contact.name}}",
      previewText: "A quick note",
    });
  });
});
