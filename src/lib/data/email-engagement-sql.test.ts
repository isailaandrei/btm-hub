import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

// Real-Postgres invariants for the email engagement RPCs. The load-bearing logic
// of the proxy-opens + click-implies-open change lives entirely in SQL
// (apply_email_provider_event*, update_email_send_counts, the historical backfill),
// which the mock-based unit tests cannot reach. This suite runs those RPCs against
// a real database and asserts the resulting column values.
//
// Gated like the other SQL suites: set SUPABASE_DB_URL (and optionally PSQL_BIN)
// to run it; otherwise it skips. Locally:
//   SUPABASE_DB_URL="$(supabase status -o env | sed -n 's/^DB_URL=//p')" npm run test:unit
const dbUrl = process.env.SUPABASE_DB_URL;
const psqlBin = process.env.PSQL_BIN ?? "psql";

function runSql(statement: string): string {
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is required");
  const result = spawnSync(
    psqlBin,
    [dbUrl, "-v", "ON_ERROR_STOP=1", "-c", statement],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

const createdSendIds: string[] = [];
const createdUserIds: string[] = [];

function seedSend(): { userId: string; sendId: string } {
  const userId = randomUUID();
  const sendId = randomUUID();
  runSql(`
    insert into auth.users (id, email, role)
    values ('${userId}', '${userId}@example.com', 'authenticated')
    on conflict (id) do nothing;
    insert into public.email_sends
      (id, kind, name, subject_template, from_email, reply_to_email,
       builder_json_snapshot, created_by, updated_by)
    values
      ('${sendId}', 'outreach', 'sql-test', 'Hi', 'a@b.com', 'a@b.com',
       '{}'::jsonb, '${userId}', '${userId}');
  `);
  createdSendIds.push(sendId);
  createdUserIds.push(userId);
  return { userId, sendId };
}

function addRecipient(
  sendId: string,
  cols: Record<string, string | null>,
): string {
  const id = randomUUID();
  const all: Record<string, string | null> = {
    id: `'${id}'`,
    send_id: `'${sendId}'`,
    email: `'${id}@example.com'`,
    ...cols,
  };
  const keys = Object.keys(all);
  runSql(
    `insert into public.email_send_recipients (${keys.join(", ")}) values (${keys
      .map((k) => all[k])
      .join(", ")});`,
  );
  return id;
}

afterAll(() => {
  if (!dbUrl) return;
  for (const id of createdSendIds) {
    // recipients cascade on send delete
    runSql(`delete from public.email_sends where id = '${id}';`);
  }
  for (const id of createdUserIds) {
    runSql(`delete from auth.users where id = '${id}';`);
  }
});

describe.skipIf(!dbUrl)("email engagement RPC invariants (real Postgres)", () => {
  it("click implies open: apply_email_provider_event('clicked') backfills opened_at", () => {
    const { sendId } = seedSend();
    const recipientId = addRecipient(sendId, {
      status: `'sent'`,
      provider: `'brevo'`,
      provider_message_id: `'msg-click-${sendId}'`,
      sent_at: "now()",
      // opened_at + clicked_at deliberately NULL
    });

    runSql(
      `select apply_email_provider_event('brevo', 'msg-click-${sendId}', 'clicked', 'clicked_at', now());`,
    );

    const out = runSql(
      `select 'OPENED_SET=' || (opened_at is not null) || ' CLICKED_SET=' || (clicked_at is not null) || ' STATUS=' || status
       from public.email_send_recipients where id = '${recipientId}';`,
    );
    expect(out).toContain("OPENED_SET=t");
    expect(out).toContain("CLICKED_SET=t");
    expect(out).toContain("STATUS=clicked");
  });

  it("click implies open (race-proof variant): apply_email_provider_event_by_recipient('clicked') backfills opened_at", () => {
    const { sendId } = seedSend();
    const recipientId = addRecipient(sendId, {
      status: `'sent'`,
      provider: `'brevo'`,
      sent_at: "now()",
    });

    runSql(
      `select apply_email_provider_event_by_recipient('${recipientId}', 'brevo', 'msg-byrec-${sendId}', 'clicked', 'clicked_at', now());`,
    );

    const out = runSql(
      `select 'OPENED_SET=' || (opened_at is not null) from public.email_send_recipients where id = '${recipientId}';`,
    );
    expect(out).toContain("OPENED_SET=t");
  });

  it("proxy opens set proxy_opened_at only — never opened_at or a status change", () => {
    const { sendId } = seedSend();
    const recipientId = addRecipient(sendId, {
      status: `'sent'`,
      provider: `'brevo'`,
      provider_message_id: `'msg-proxy-${sendId}'`,
      sent_at: "now()",
    });

    runSql(
      `select apply_email_proxy_open('brevo', 'msg-proxy-${sendId}', now());`,
    );

    const out = runSql(
      `select 'PROXY_SET=' || (proxy_opened_at is not null) || ' OPENED_SET=' || (opened_at is not null) || ' DELIVERED_SET=' || (delivered_at is not null) || ' STATUS=' || status
       from public.email_send_recipients where id = '${recipientId}';`,
    );
    expect(out).toContain("PROXY_SET=t");
    expect(out).toContain("OPENED_SET=f");
    // A proxy fetch implies delivery.
    expect(out).toContain("DELIVERED_SET=t");
    // Status is untouched by a proxy open.
    expect(out).toContain("STATUS=sent");
  });

  it("update_email_send_counts: proxy_opened_count is net-additional with zero double counting", () => {
    const { sendId } = seedSend();
    // (a) real open + proxy -> counts as opened only
    addRecipient(sendId, {
      status: `'delivered'`,
      delivered_at: "now()",
      opened_at: "now()",
      proxy_opened_at: "now()",
    });
    // (b) proxy only -> counts as proxy only
    addRecipient(sendId, {
      status: `'delivered'`,
      delivered_at: "now()",
      proxy_opened_at: "now()",
    });
    // (c) neither
    addRecipient(sendId, { status: `'delivered'`, delivered_at: "now()" });

    runSql(`select update_email_send_counts('${sendId}');`);

    const out = runSql(
      `select 'OPENED=' || opened_count || ' PROXY=' || proxy_opened_count from public.email_sends where id = '${sendId}';`,
    );
    expect(out).toContain("OPENED=1 PROXY=1");
  });

  it("update_email_send_counts: an all-skipped DRAFT is never auto-flipped to 'sent'", () => {
    const { sendId } = seedSend(); // status defaults to 'draft'
    addRecipient(sendId, { status: `'skipped_suppressed'` });
    addRecipient(sendId, { status: `'skipped_suppressed'` });

    runSql(`select update_email_send_counts('${sendId}');`);

    const out = runSql(
      `select 'STATUS=' || status || ' RC=' || recipient_count || ' SKIPPED=' || skipped_count from public.email_sends where id = '${sendId}';`,
    );
    expect(out).toContain("STATUS=draft");
    expect(out).toContain("SKIPPED=2");
  });

  it("historical backfill statement sets opened_at = clicked_at for clicked-but-unopened rows", () => {
    const { sendId } = seedSend();
    const recipientId = addRecipient(sendId, {
      status: `'clicked'`,
      provider: `'brevo'`,
      delivered_at: "now()",
      clicked_at: "now()",
      // opened_at NULL — the exact pre-fix state
    });

    // The migration's one-time backfill (idempotent: guarded by opened_at IS NULL).
    runSql(
      `update public.email_send_recipients set opened_at = clicked_at, updated_at = now()
       where clicked_at is not null and opened_at is null;`,
    );

    const out = runSql(
      `select 'EQUAL=' || (opened_at = clicked_at) from public.email_send_recipients where id = '${recipientId}';`,
    );
    expect(out).toContain("EQUAL=t");
  });
});
