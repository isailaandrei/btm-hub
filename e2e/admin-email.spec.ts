import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ADMIN_USER = { email: "admin@btmhub.com", password: "AdminPass123" };
const ADMIN_ID = "b2c3d4e5-f6a7-8901-bcde-f12345678901";

interface EmailFixture {
  suffix: string;
  eligibleContactId: string;
  eligibleEmail: string;
  suppressedContactId: string;
  suppressedEmail: string;
  templateId: string;
  templateVersionId: string;
  templateName: string;
  singleOutreachSubject: string;
  replyCampaignId: string;
  replyRecipientId: string;
  replyEventId: string;
}

function hasAdminEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY),
  );
}

function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase admin test environment.");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function expectNoDbError(
  result: { error: { message: string } | null },
  action: string,
) {
  if (result.error) throw new Error(`${action}: ${result.error.message}`);
}

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN_USER.email);
  await page.getByLabel(/password/i).fill(ADMIN_USER.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL("**/profile");
}

function createFixture(): EmailFixture {
  const suffix = randomUUID().slice(0, 8);
  return {
    suffix,
    eligibleContactId: randomUUID(),
    eligibleEmail: `e2e-email-${suffix}-eligible@example.com`,
    suppressedContactId: randomUUID(),
    suppressedEmail: `e2e-email-${suffix}-suppressed@example.com`,
    templateId: randomUUID(),
    templateVersionId: randomUUID(),
    templateName: `E2E Email Template ${suffix}`,
    singleOutreachSubject: `E2E single outreach ${suffix}`,
    replyCampaignId: randomUUID(),
    replyRecipientId: randomUUID(),
    replyEventId: `reply-${suffix}`,
  };
}

async function cleanupFixture(client: SupabaseClient, fixture: EmailFixture) {
  const campaignResult = await client
    .from("email_campaigns")
    .select("id")
    .ilike("subject", `%${fixture.suffix}%`);
  if (campaignResult.error) {
    throw new Error(`Find email campaigns: ${campaignResult.error.message}`);
  }

  const campaignIds = [
    fixture.replyCampaignId,
    ...(campaignResult.data ?? []).map((campaign) => campaign.id as string),
  ];

  await expectNoDbError(
    await client.from("email_campaigns").delete().in("id", campaignIds),
    "Delete email campaigns",
  );
  await expectNoDbError(
    await client
      .from("email_replies")
      .delete()
      .in("contact_id", [fixture.eligibleContactId, fixture.suppressedContactId]),
    "Delete email replies",
  );
  await expectNoDbError(
    await client
      .from("email_suppressions")
      .delete()
      .in("email", [fixture.eligibleEmail, fixture.suppressedEmail]),
    "Delete email suppressions",
  );
  await expectNoDbError(
    await client
      .from("contact_email_preferences")
      .delete()
      .in("contact_id", [fixture.eligibleContactId, fixture.suppressedContactId]),
    "Delete email preferences",
  );
  const templatesResult = await client
    .from("email_templates")
    .select("id")
    .ilike("name", `%${fixture.suffix}%`);
  if (templatesResult.error) {
    throw new Error(`Find email templates: ${templatesResult.error.message}`);
  }
  const templateIds = [
    ...new Set([
      fixture.templateId,
      ...(templatesResult.data ?? []).map((template) => template.id as string),
    ]),
  ];
  if (templateIds.length > 0) {
    await expectNoDbError(
      await client
        .from("email_templates")
        .update({ current_version_id: null })
        .in("id", templateIds),
      "Clear template current versions",
    );
    await expectNoDbError(
      await client
        .from("email_template_versions")
        .delete()
        .in("template_id", templateIds),
      "Delete template versions",
    );
    await expectNoDbError(
      await client.from("email_templates").delete().in("id", templateIds),
      "Delete email templates",
    );
  }
  await expectNoDbError(
    await client
      .from("contacts")
      .delete()
      .in("id", [fixture.eligibleContactId, fixture.suppressedContactId]),
    "Delete contacts",
  );
}

async function seedFixture(client: SupabaseClient, fixture: EmailFixture) {
  await cleanupFixture(client, fixture);

  await expectNoDbError(
    await client.from("contacts").insert([
      {
        id: fixture.eligibleContactId,
        email: fixture.eligibleEmail,
        name: "E2E Eligible Contact",
      },
      {
        id: fixture.suppressedContactId,
        email: fixture.suppressedEmail,
        name: "E2E Suppressed Contact",
      },
    ]),
    "Insert contacts",
  );

  await expectNoDbError(
    await client.from("email_templates").insert({
      id: fixture.templateId,
      name: fixture.templateName,
      description: "E2E template",
      category: "e2e",
      status: "published",
      builder_type: "grapesjs_mjml",
      created_by: ADMIN_ID,
      updated_by: ADMIN_ID,
    }),
    "Insert email template",
  );

  await expectNoDbError(
    await client.from("email_template_versions").insert({
      id: fixture.templateVersionId,
      template_id: fixture.templateId,
      version_number: 1,
      subject: "Hello {{contact.name}}",
      preview_text: "Preview",
      builder_json: { e2e: true },
      mjml:
        "<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{contact.name}}</mj-text></mj-column></mj-section></mj-body></mjml>",
      html: "<p>Hello {{contact.name}}</p>",
      text: "Hello {{contact.name}}",
      asset_ids: [],
      created_by: ADMIN_ID,
    }),
    "Insert email template version",
  );

  await expectNoDbError(
    await client
      .from("email_templates")
      .update({ current_version_id: fixture.templateVersionId })
      .eq("id", fixture.templateId),
    "Publish email template version",
  );
}

async function seedSuppression(client: SupabaseClient, fixture: EmailFixture) {
  await expectNoDbError(
    await client.from("email_suppressions").insert({
      contact_id: fixture.suppressedContactId,
      email: fixture.suppressedEmail,
      reason: "manual",
      detail: "E2E suppression",
      created_by: ADMIN_ID,
    }),
    "Insert email suppression",
  );
}

async function seedSentRecipient(client: SupabaseClient, fixture: EmailFixture) {
  await expectNoDbError(
    await client.from("email_campaigns").insert({
      id: fixture.replyCampaignId,
      kind: "outreach",
      status: "sent",
      name: `E2E reply campaign ${fixture.suffix}`,
      subject: `E2E reply ${fixture.suffix}`,
      preview_text: "",
      from_email: "hello@mail.behind-the-mask.com",
      from_name: "Behind The Mask",
      reply_to_email: "reply@replies.behind-the-mask.com",
      template_version_id: fixture.templateVersionId,
      html_snapshot: "<p>Hello</p>",
      text_snapshot: "Hello",
      created_by: ADMIN_ID,
      updated_by: ADMIN_ID,
      confirmed_by: ADMIN_ID,
      confirmed_at: new Date().toISOString(),
      recipient_count: 1,
      sent_count: 1,
    }),
    "Insert sent campaign",
  );

  await expectNoDbError(
    await client.from("email_campaign_recipients").insert({
      id: fixture.replyRecipientId,
      campaign_id: fixture.replyCampaignId,
      contact_id: fixture.eligibleContactId,
      email: fixture.eligibleEmail,
      contact_name_snapshot: "E2E Eligible Contact",
      personalization_snapshot: {},
      status: "sent",
      provider: "fake",
      provider_message_id: `fake-${fixture.replyRecipientId}`,
      provider_metadata: {},
      sent_at: new Date().toISOString(),
    }),
    "Insert sent recipient",
  );
}

async function sentRecipientCountForSubject(
  client: SupabaseClient,
  input: {
    subject: string;
    contactId: string;
  },
) {
  const campaigns = await client
    .from("email_campaigns")
    .select("id")
    .eq("subject", input.subject)
    .eq("status", "sent");
  if (campaigns.error) throw new Error(campaigns.error.message);
  const campaignIds = (campaigns.data ?? []).map((campaign) => campaign.id as string);
  if (campaignIds.length === 0) return 0;

  const recipients = await client
    .from("email_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .in("campaign_id", campaignIds)
    .eq("contact_id", input.contactId)
    .eq("status", "sent");
  if (recipients.error) throw new Error(recipients.error.message);

  return recipients.count ?? 0;
}

async function sentSingleOutreachRecipientCount(
  client: SupabaseClient,
  fixture: EmailFixture,
) {
  return sentRecipientCountForSubject(client, {
    subject: fixture.singleOutreachSubject,
    contactId: fixture.eligibleContactId,
  });
}

test.describe("Admin email", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!hasAdminEnv(), "Admin email E2E requires Supabase service-role env.");

  let client: SupabaseClient;
  let fixture: EmailFixture;

  test.beforeEach(async () => {
    client = getAdminClient();
    fixture = createFixture();
    await seedFixture(client, fixture);
  });

  test.afterEach(async () => {
    await cleanupFixture(client, fixture);
  });

  test("admin can preview selected outreach and see skipped suppressed contacts", async ({
    page,
  }) => {
    await seedSuppression(client, fixture);
    await loginAsAdmin(page);
    await page.goto("/admin");
    await page.getByPlaceholder("Search by name or email...").fill(fixture.suffix);
    await page.getByLabel("Select E2E Eligible Contact").check();
    await page.getByLabel("Select E2E Suppressed Contact").check();
    await page.getByRole("button", { name: /^send email$/i }).click();

    await expect(page.getByText("Email Studio")).toBeVisible();
    await expect(page.getByLabel("Kind")).toHaveValue("outreach");
    await expect(page.getByText("2 selected recipients")).toBeVisible();
    await expect(page.getByLabel("Contact IDs")).toBeHidden();
    await page.getByLabel("Template").selectOption({ label: fixture.templateName });
    await page.getByLabel("Campaign name").fill(`E2E Outreach ${fixture.suffix}`);
    await page.getByLabel("Subject").fill(`E2E outreach ${fixture.suffix}`);
    await page.getByRole("button", { name: /^preview$/i }).click();

    await expect(page.getByText("1 eligible, 1 skipped")).toBeVisible();
    await expect(
      page.getByRole("cell", { name: fixture.suppressedEmail }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Suppressed", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: /^create draft$/i }).click();
    await expect(page.getByText("Draft ready to send.")).toBeVisible();
    await page.getByRole("button", { name: /^send now$/i }).click();
    await expect
      .poll(() =>
        sentRecipientCountForSubject(client, {
          subject: `E2E outreach ${fixture.suffix}`,
          contactId: fixture.eligibleContactId,
        }),
      )
      .toBe(1);
  });

  test("admin can create a template and publish its first version", async ({
    page,
  }) => {
    const templateName = `E2E Created Template ${fixture.suffix}`;

    await loginAsAdmin(page);
    await page.goto("/admin");
    await page.getByRole("button", { name: /^email$/i }).click();
    await page.getByRole("button", { name: /^templates$/i }).click();

    const createTemplateForm = page.getByRole("form", {
      name: "Create email template",
    });
    await createTemplateForm.getByLabel("Name").fill(templateName);
    await createTemplateForm.getByLabel("Category").fill("outreach");
    await createTemplateForm
      .getByLabel("Description")
      .fill("Template created from E2E.");
    await createTemplateForm
      .getByRole("button", { name: /^create template$/i })
      .click();

    await expect(page.getByText("Template created.")).toBeVisible();
    await page.getByLabel("Subject").fill(`E2E template ${fixture.suffix}`);
    await page.getByLabel("Preview text").fill("Template preview");
    await page.getByLabel("MJML").fill(
      "<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{contact.name}}</mj-text></mj-column></mj-section></mj-body></mjml>",
    );
    await page.getByRole("button", { name: /^publish version$/i }).click();

    await expect
      .poll(async () => {
        const result = await client
          .from("email_templates")
          .select("current_version_id")
          .eq("name", templateName)
          .maybeSingle();
        if (result.error) throw new Error(result.error.message);
        return Boolean(result.data?.current_version_id);
      })
      .toBe(true);
  });

  test("admin can start single-contact outreach from a contact profile", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/contacts/${fixture.eligibleContactId}`);

    await expect(page.getByText("Email outreach")).toBeVisible();
    await page.getByRole("link", { name: /^send email$/i }).click();

    await expect(page.getByText("Email Studio")).toBeVisible();
    await expect(page.getByLabel("Kind")).toHaveValue("outreach");
    await expect(page.getByText("1 selected recipient")).toBeVisible();
    await page.getByLabel("Template").selectOption({ label: fixture.templateName });
    await page.getByLabel("Subject").fill(fixture.singleOutreachSubject);
    await page.getByRole("button", { name: /^preview$/i }).click();
    await expect(page.getByText("1 eligible, 0 skipped")).toBeVisible();

    await page.getByRole("button", { name: /^create draft$/i }).click();
    await expect(page.getByText("Draft ready to send.")).toBeVisible();
    await page.getByRole("button", { name: /^send now$/i }).click();

    await expect
      .poll(() => sentSingleOutreachRecipientCount(client, fixture))
      .toBe(1);
  });

  test("admin can see an inbound reply in the contact timeline after webhook ingestion", async ({
    page,
  }) => {
    await seedSentRecipient(client, fixture);

    const response = await page.request.post("/api/email/webhooks/fake", {
      data: {
        type: "email.received",
        id: fixture.replyEventId,
        messageId: `inbound-${fixture.suffix}`,
        to: `r-${fixture.replyRecipientId}@replies.behind-the-mask.com`,
        from: `student-${fixture.suffix}@example.com`,
        subject: `Re: E2E reply ${fixture.suffix}`,
        text: "Thanks for the update.",
        html: "<p>Thanks for the update.</p>",
        occurredAt: "2026-04-28T12:00:00.000Z",
      },
    });
    const responseBody = await response.text();
    expect(
      response.ok(),
      `status=${response.status()} body=${responseBody}`,
    ).toBe(true);

    await expect
      .poll(async () => {
        const replies = await client
          .from("email_replies")
          .select("id", { count: "exact", head: true })
          .eq("provider_event_id", fixture.replyEventId);
        if (replies.error) throw new Error(replies.error.message);
        return replies.count ?? 0;
      })
      .toBe(1);

    await loginAsAdmin(page);
    await page.goto(`/admin/contacts/${fixture.eligibleContactId}`);

    await expect(
      page.getByText(`Email reply: Re: E2E reply ${fixture.suffix}`),
    ).toBeVisible();
    await expect(page.getByText("Thanks for the update.")).toBeVisible();
  });
});
