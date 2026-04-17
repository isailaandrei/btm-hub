#!/usr/bin/env -S node --experimental-strip-types
/**
 * Local dossier evaluation harness.
 *
 * Loads a gold-set scoring file (JSON) and prints score breakdowns per
 * dossier plus aggregate counts by verdict. Format is intentionally
 * plain so an external eval platform (LangSmith, Phoenix, Braintrust)
 * can be wired in later without replacing the local rubric.
 *
 * Usage:
 *   node --experimental-strip-types scripts/admin-ai-memory/eval.ts <gold-set.json>
 *   node --experimental-strip-types scripts/admin-ai-memory/eval.ts --filter=strong <file>
 *
 * Gold-set file shape (see docs/superpowers/evals/admin-ai-memory-gold-set.md):
 *   {
 *     "model": "gpt-test",
 *     "promptVersion": "dossier-prompt-v1",
 *     "entries": [
 *       {
 *         "contactId": "<uuid or alias>",
 *         "scores": { "factualAccuracy": 2, ..., "usefulnessForRanking": 1 },
 *         "hardFails": []
 *       }
 *     ]
 *   }
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  scoreDossier,
  type Verdict,
} from "../../src/lib/admin-ai-memory/eval-rubric.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

type GoldSetEntry = {
  contactId: string;
  scores: Record<string, number>;
  hardFails: string[];
  notes?: string;
};

type GoldSet = {
  model?: string;
  promptVersion?: string;
  entries: GoldSetEntry[];
};

type CliArgs = {
  file: string;
  filter: Verdict | undefined;
};

function parseArgs(argv: string[]): CliArgs {
  let file: string | undefined;
  let filter: Verdict | undefined;
  for (const raw of argv.slice(2)) {
    if (raw === "--help" || raw === "-h") {
      printHelp();
      process.exit(0);
    }
    if (raw.startsWith("--filter=")) {
      const value = raw.slice("--filter=".length) as Verdict;
      if (
        value !== "strong" &&
        value !== "acceptable" &&
        value !== "insufficient" &&
        value !== "hard_fail"
      ) {
        throw new Error(`Invalid --filter value: ${value}`);
      }
      filter = value;
      continue;
    }
    if (!file) {
      file = raw;
      continue;
    }
    throw new Error(`Unexpected argument: ${raw}`);
  }
  if (!file) {
    printHelp();
    throw new Error("Missing gold-set file argument");
  }
  return { file, filter };
}

function printHelp(): void {
  console.log(
    [
      "Usage: node --experimental-strip-types scripts/admin-ai-memory/eval.ts <gold-set.json> [--filter=<verdict>]",
      "",
      "Verdicts: strong | acceptable | insufficient | hard_fail",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const path = resolve(REPO_ROOT, args.file);
  const raw = await readFile(path, "utf8");
  let goldSet: GoldSet;
  try {
    goldSet = JSON.parse(raw) as GoldSet;
  } catch (error) {
    throw new Error(
      `Gold-set file is not valid JSON (${path}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!goldSet.entries?.length) {
    throw new Error("Gold-set file has no `entries`");
  }

  const counts: Record<Verdict, number> = {
    strong: 0,
    acceptable: 0,
    insufficient: 0,
    hard_fail: 0,
  };

  console.log(`Eval run: ${path}`);
  if (goldSet.model) console.log(`Model: ${goldSet.model}`);
  if (goldSet.promptVersion) console.log(`Prompt: ${goldSet.promptVersion}`);
  console.log("");

  for (const entry of goldSet.entries) {
    const result = scoreDossier({
      scores: entry.scores as Partial<
        Parameters<typeof scoreDossier>[0]["scores"]
      >,
      hardFails: entry.hardFails ?? [],
    });
    counts[result.verdict] += 1;
    if (args.filter && args.filter !== result.verdict) continue;
    const summary = `${entry.contactId}\ttotal=${result.total}\tverdict=${result.verdict}`;
    const fails =
      result.hardFails.length > 0
        ? `\thardFails=${result.hardFails.join(",")}`
        : "";
    console.log(summary + fails);
  }

  console.log("\nVerdict counts:");
  console.log(JSON.stringify(counts, null, 2));
  if (counts.hard_fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
