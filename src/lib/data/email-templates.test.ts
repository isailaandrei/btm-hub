import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(),
}));

const ADMIN_PROFILE = {
  id: "admin-1",
  email: "admin@example.com",
  display_name: "Admin",
  bio: null,
  avatar_url: null,
  role: "admin",
  preferences: {},
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
} as const;

describe("email template data access", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = await import("@/lib/supabase/server");
    const { requireAdmin } = await import("@/lib/auth/require-admin");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_PROFILE);
  });

  it("creates templates with Maily as the only builder type", async () => {
    const template = { id: "template-1", builder_type: "maily" };
    mockSupabase.mockQueryResult(template);

    const { createEmailTemplate } = await import("./email-templates");
    const result = await createEmailTemplate({
      name: "Newsletter",
      description: "Reusable newsletter frame",
      category: "broadcast",
    });

    expect(mockSupabase.client.from).toHaveBeenCalledWith("email_templates");
    expect(mockSupabase.query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Newsletter",
        builder_type: "maily",
        created_by: "admin-1",
        updated_by: "admin-1",
      }),
    );
    expect(result).toBe(template);
  });

  it("creates templates with an empty description when omitted", async () => {
    const template = { id: "template-1", builder_type: "maily" };
    mockSupabase.mockQueryResult(template);

    const { createEmailTemplate } = await import("./email-templates");
    await createEmailTemplate({
      name: "Newsletter",
      category: "broadcast",
    });

    expect(mockSupabase.query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "",
      }),
    );
  });

  it("creates template versions through the atomic Maily RPC", async () => {
    const version = {
      id: "version-1",
      template_id: "template-1",
      version_number: 2,
    };
    mockSupabase.mockQueryResult(version);

    const { createEmailTemplateVersion } = await import("./email-templates");
    const result = await createEmailTemplateVersion({
      templateId: "template-1",
      subject: "Hello {{contact.name}}",
      previewText: "Preview",
      builderJson: { type: "doc", content: [] },
      html: "<p>Hello {{contact.name}}</p>",
      text: "Hello {{contact.name}}",
      assetIds: ["asset-1"],
    });

    expect(mockSupabase.client.rpc).toHaveBeenCalledWith(
      "create_email_template_version",
      {
        p_template_id: "template-1",
        p_subject: "Hello {{contact.name}}",
        p_preview_text: "Preview",
        p_builder_json: { type: "doc", content: [] },
        p_html: "<p>Hello {{contact.name}}</p>",
        p_text: "Hello {{contact.name}}",
        p_asset_ids: ["asset-1"],
        p_user_id: "admin-1",
      },
    );
    expect(result).toBe(version);
  });
});
