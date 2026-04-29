import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(),
}));

describe("email template data access", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = await import("@/lib/supabase/server");
    const { requireAdmin } = await import("@/lib/auth/require-admin");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
    vi.mocked(requireAdmin).mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      display_name: "Admin",
      bio: null,
      avatar_url: null,
      role: "admin",
      preferences: {},
      created_at: "2026-04-28T00:00:00.000Z",
      updated_at: "2026-04-28T00:00:00.000Z",
    });
  });

  it("creates template versions through the atomic version RPC", async () => {
    const version = {
      id: "version-1",
      template_id: "template-1",
      version_number: 2,
    };
    mockSupabase.mockQueryResult(version);

    const { createEmailTemplateVersion } = await import("./email-templates");
    const result = await createEmailTemplateVersion({
      templateId: "template-1",
      subject: "Hello",
      previewText: "Preview",
      builderJson: { editor: "textarea" },
      mjml: "<mjml></mjml>",
      html: "<p>Hello</p>",
      text: "Hello",
      assetIds: ["asset-1"],
    });

    expect(mockSupabase.client.rpc).toHaveBeenCalledWith(
      "create_email_template_version",
      {
        p_template_id: "template-1",
        p_subject: "Hello",
        p_preview_text: "Preview",
        p_builder_json: { editor: "textarea" },
        p_mjml: "<mjml></mjml>",
        p_html: "<p>Hello</p>",
        p_text: "Hello",
        p_asset_ids: ["asset-1"],
        p_user_id: "admin-1",
      },
    );
    expect(result).toBe(version);
  });
});
