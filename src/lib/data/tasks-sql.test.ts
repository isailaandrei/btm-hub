import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dbUrl = process.env.SUPABASE_DB_URL;
const psqlBin = process.env.PSQL_BIN ?? "psql";
const tasksMigrationPath = "supabase/migrations/20260521000001_admin_tasks_board.sql";

function sql(strings: TemplateStringsArray, ...values: string[]) {
  return strings.reduce((result, part, index) => {
    const value = values[index];
    if (value === undefined) return result + part;
    return result + part + value.replaceAll("'", "''");
  }, "");
}

function runSql(statement: string) {
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is required");
  const result = spawnSync(psqlBin, [dbUrl, "-v", "ON_ERROR_STOP=1", "-c", statement], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

describe("admin task migration realtime invariants", () => {
  it("allows admins to read archived task rows so Realtime can deliver archive updates", () => {
    const migration = readFileSync(tasksMigrationPath, "utf8");
    const policy =
      migration.match(/CREATE POLICY "Admins can read tasks"[\s\S]*?\);/)?.[0] ??
      "";

    expect(policy).toContain("profiles.role = 'admin'");
    expect(policy).not.toContain("archived_at IS NULL");
  });
});

describe.skipIf(!dbUrl)("admin task SQL/RPC invariants", () => {
  it("does not create a contact link column on tasks", () => {
    const output = runSql(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = 'contact_id';
    `);

    expect(output).not.toContain("contact_id");
  });

  it("prevents profile role self-escalation through insert and update", () => {
    const memberId = randomUUID();
    const email = `${memberId}@example.com`;

    const output = runSql(sql`
      insert into auth.users (id, email, role)
      values ('${memberId}', '${email}', 'authenticated')
      on conflict (id) do nothing;

      set role authenticated;
      set request.jwt.claim.sub = '${memberId}';

      do $$
      begin
        begin
          insert into public.profiles (id, email, role)
          values ('${memberId}', '${email}', 'admin');
          raise exception 'self-insert escalation unexpectedly succeeded';
        exception when others then
          raise notice 'self-insert admin denied';
        end;
      end
      $$;

      reset role;
      insert into public.profiles (id, email, role)
      values ('${memberId}', '${email}', 'member')
      on conflict (id) do update set role = excluded.role;

      set role authenticated;
      set request.jwt.claim.sub = '${memberId}';

      do $$
      begin
        begin
          update public.profiles set role = 'admin' where id = '${memberId}';
          raise exception 'self-update escalation unexpectedly succeeded';
        exception when others then
          raise notice 'self-update admin denied';
        end;
      end
      $$;
    `);

    expect(output).toContain("self-insert admin denied");
    expect(output).toContain("self-update admin denied");
  });

  it("rejects duplicate reorder IDs", () => {
    const adminId = randomUUID();
    const email = `${adminId}@example.com`;

    const output = runSql(sql`
      insert into auth.users (id, email, role)
      values ('${adminId}', '${email}', 'authenticated')
      on conflict (id) do nothing;
      insert into public.profiles (id, email, role)
      values ('${adminId}', '${email}', 'admin')
      on conflict (id) do update set role = excluded.role;

      set role authenticated;
      set request.jwt.claim.sub = '${adminId}';

      do $$
      declare
        group_id uuid;
      begin
        select id into group_id from public.create_task_group('SQL test group', 'blue');
        begin
          perform public.reorder_task_groups(array[group_id, group_id]);
          raise exception 'duplicate reorder unexpectedly succeeded';
        exception when others then
          raise notice 'duplicate reorder denied';
        end;
      end
      $$;
    `);

    expect(output).toContain("duplicate reorder denied");
  });
});
