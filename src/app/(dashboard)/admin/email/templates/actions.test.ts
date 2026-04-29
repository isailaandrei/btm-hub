import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateEmailTemplate = vi.fn();
const mockCreateEmailTemplateVersion = vi.fn();
const mockRenderMjmlEmail = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("@/lib/data/email-templates", () => ({
  createEmailTemplate: mockCreateEmailTemplate,
  createEmailTemplateVersion: mockCreateEmailTemplateVersion,
}));

vi.mock("@/lib/email/rendering/mjml", () => ({
  renderMjmlEmail: mockRenderMjmlEmail,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

const {
  createTemplateAction,
  publishTemplateVersionAction,
} = await import("./actions");

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("createTemplateAction", () => {
  beforeEach(() => {
    mockCreateEmailTemplate.mockReset();
    mockRevalidatePath.mockReset();
  });

  it("returns field errors for invalid template names", async () => {
    const formData = new FormData();
    formData.set("name", " ");
    formData.set("description", "Description");
    formData.set("category", "general");

    const result = await createTemplateAction(
      { errors: {}, message: "", templateId: null, success: false, resetKey: 0 },
      formData,
    );

    expect(result.errors.name).toEqual(["Template name is required"]);
    expect(mockCreateEmailTemplate).not.toHaveBeenCalled();
  });

  it("creates a template, returns its id, and revalidates admin", async () => {
    mockCreateEmailTemplate.mockResolvedValue({ id: "template-1" });
    const formData = new FormData();
    formData.set("name", "Newsletter");
    formData.set("description", "Monthly update");
    formData.set("category", "broadcast");

    const result = await createTemplateAction(
      { errors: {}, message: "", templateId: null, success: false, resetKey: 0 },
      formData,
    );

    expect(mockCreateEmailTemplate).toHaveBeenCalledWith({
      name: "Newsletter",
      description: "Monthly update",
      category: "broadcast",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
    expect(result).toEqual({
      errors: {},
      message: "Template created.",
      templateId: "template-1",
      success: true,
      resetKey: 1,
    });
  });
});

describe("publishTemplateVersionAction", () => {
  beforeEach(() => {
    mockCreateEmailTemplateVersion.mockReset();
    mockRenderMjmlEmail.mockReset();
    mockRevalidatePath.mockReset();
  });

  it("renders MJML and persists an immutable template version", async () => {
    mockRenderMjmlEmail.mockResolvedValue({
      subject: "Hello Alex",
      html: "<p>Hello Alex</p>",
      text: "Hello Alex",
    });
    mockCreateEmailTemplateVersion.mockResolvedValue({ id: "version-1" });

    const result = await publishTemplateVersionAction({
      templateId: VALID_UUID,
      subject: "Hello {{contact.name}}",
      previewText: "Preview",
      builderJson: { blocks: [] },
      mjml: "<mjml><mj-body></mj-body></mjml>",
      assetIds: [],
    });

    expect(mockCreateEmailTemplateVersion).toHaveBeenCalledWith({
      templateId: VALID_UUID,
      subject: "Hello Alex",
      previewText: "Preview",
      builderJson: { blocks: [] },
      mjml: "<mjml><mj-body></mj-body></mjml>",
      html: "<p>Hello Alex</p>",
      text: "Hello Alex",
      assetIds: [],
    });
    expect(result).toEqual({ ok: true, versionId: "version-1" });
  });
});
