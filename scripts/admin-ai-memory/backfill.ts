#!/usr/bin/env -S node --import tsx
/**
 * Local admin AI memory backfill CLI.
 *
 * Rebuilds the Admin AI memory artifacts for current CRM contacts:
 * evidence chunks, direct fact observations, and dossiers.
 * Bypasses the Next.js request lifecycle by using a service-role Supabase
 * client directly. Intended for local + CI use; production should drive
 * the same `rebuildContactMemory` flow from a server context.
 *
 * Usage:
 *   node --import tsx scripts/admin-ai-memory/backfill.ts
 *   node --import tsx scripts/admin-ai-memory/backfill.ts --limit=5
 *   node --import tsx scripts/admin-ai-memory/backfill.ts --contact=<uuid>
 *   node --import tsx scripts/admin-ai-memory/backfill.ts --contact=<uuid>,<uuid> --force
 *
 * Required env (read from .env.local or shell):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (or SUPABASE_LOCAL_SERVICE_ROLE_KEY)
 *   OPENAI_API_KEY
 * Optional:
 *   OPENAI_DOSSIER_MODEL  (falls back to OPENAI_MODEL, then default)
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

// ---------------------------------------------------------------------------
// Tiny .env loader (avoids pulling dotenv in just for a CLI script)
// ---------------------------------------------------------------------------

async function loadEnvFile(path: string): Promise<void> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

type CliArgs = {
  limit: number | undefined;
  contactIds: string[];
  force: boolean;
  structuralOnly: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    limit: undefined,
    contactIds: [],
    force: false,
    structuralOnly: false,
  };
  for (const raw of argv.slice(2)) {
    if (raw === "--force") {
      args.force = true;
      continue;
    }
    if (raw === "--structural-only") {
      args.structuralOnly = true;
      continue;
    }
    if (raw.startsWith("--limit=")) {
      const n = Number(raw.slice("--limit=".length));
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --limit value: ${raw}`);
      }
      args.limit = n;
      continue;
    }
    if (raw.startsWith("--contact=")) {
      args.contactIds.push(
        ...raw.slice("--contact=".length).split(",").map((s) => s.trim()).filter(Boolean),
      );
      continue;
    }
    if (raw === "--help" || raw === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function printHelp(): void {
  console.log(
    [
      "Usage: node --import tsx scripts/admin-ai-memory/backfill.ts [options]",
      "",
      "Options:",
      "  --limit=N           Process at most N contacts (default: all).",
      "  --contact=<uuid>    One or more contact ids (comma-separated).",
      "  --force             Rebuild even when memory is already fresh.",
      "  --structural-only   Refresh deterministic dossier facts/version only; no OpenAI dossier call.",
      "  --help              Show this message.",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  await loadEnvFile(resolve(REPO_ROOT, ".env.local"));
  await loadEnvFile(resolve(REPO_ROOT, ".env.development.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (set it for the local supabase instance — see `supabase status`).",
    );
  }
  if (!args.structuralOnly && !process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY — dossier generation requires it.");
  }

  // Lazy-import so env loading happens before any module reads process.env.
  const { createClient } = await import("@supabase/supabase-js");
  const {
    runStandaloneBackfill,
    runStandaloneStructuralRefresh,
  } = await import("./_runner.ts");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const stats = args.structuralOnly
    ? await runStandaloneStructuralRefresh({
        supabase,
        limit: args.limit,
        contactIds: args.contactIds.length > 0 ? args.contactIds : undefined,
      })
    : await runStandaloneBackfill({
        supabase,
        limit: args.limit,
        contactIds: args.contactIds.length > 0 ? args.contactIds : undefined,
        force: args.force,
      });

  console.log("\nBackfill summary:");
  console.log(JSON.stringify(stats, null, 2));
  if (stats.contactsFailed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
