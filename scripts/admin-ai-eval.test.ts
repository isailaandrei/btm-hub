/**
 * Admin-AI live eval harness — a repeatable scorecard for the admin AI so every
 * future prompt/architecture change is measured, not vibed.
 *
 * Run: RUN_ADMIN_AI_EVAL=1 npx vitest run scripts/admin-ai-eval.test.ts
 *
 * Gated behind RUN_ADMIN_AI_EVAL so the normal suite never runs it. It hits the
 * live DB (.env.development.local service-role key) and the real DeepSeek API,
 * bypassing ALL persistence (no admin_ai_threads/messages writes). Ground truth
 * is computed at RUNTIME from the loaded records — never hardcoded (contact ids
 * are the join key; the one id constant below is a documented canary).
 *
 * Env is forced within the run (saved/restored): ADMIN_AI_PROVIDER=deepseek,
 * ADMIN_AI_SCAN_MODE=map_reduce, DEEPSEEK_THINKING off. Each question is one
 * serial it() (600s timeout) and is independent — a scored assertion failing
 * fails only that question. Full JSON is written to .admin-ai-debug/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createLiveSupabaseClient,
  loadEligible,
  loadEnv,
  type LiveSupabaseClient,
} from "./admin-ai-live-lib";
import { deepSeekAdminAiProvider } from "@/lib/admin-ai/deepseek-provider";
import {
  runGlobalSynthesis,
  type GlobalSynthesisDiagnostics,
} from "@/lib/admin-ai/orchestrator";
import type { ContactCardRecord } from "@/lib/data/contact-cards";
import type { AdminAiResponse } from "@/types/admin-ai";

// deepseek-v4-pro prices, USD per 1M tokens (single source of truth).
const PRICE_PER_M = {
  inputMiss: 0.435,
  inputHit: 0.003625,
  output: 0.87,
};

const YANG_YANG_ID = "6b21215b-c67a-4e71-84f0-f343fd5601a1";
const CORAL = "26 Coral Catch";
const SCUBASPA = "26 Maldives Academy ScubaSpa";

type EvalResult = {
  key: string;
  question: string;
  truthCount: number | null;
  recall: number | null;
  shortlistPrecision: number | null;
  forbiddenViolations: string[];
  expectEmpty: boolean | null;
  expectEmptyPass: boolean | null;
  shortlistCount: number;
  additionalCount: number;
  cardsSent: number;
  mapUsed: boolean;
  latencyMs: number;
  costUsd: number;
  advisory: string[];
  // Self-diagnosing fields from the shared pipeline diagnostics.
  prefilteredCount: number;
  candidateCount: number;
  // The map-union candidate ids fed to the reduce — reveals whether a dropped
  // contact was lost by the map or the reduce. JSON-only (off the scorecard).
  candidateIds: string[];
  nearMissCandidateCount: number;
  nearMissModeUsed: boolean;
  // Evidence rescue scan over field/budget-dropped contacts (JSON-only forensics).
  rescueScanUsed: boolean;
  rescuedCandidateCount: number;
  rescuedIds: string[];
  idRepairs: number;
  idDrops: number;
  appendedByEnumeration: number;
  plan: GlobalSynthesisDiagnostics["plan"];
  droppedParts: string[];
  assumptions: string[];
  truthIds: string[];
  unionIds: string[];
  missingIds: string[];
};

type PipelineOutput = {
  response: AdminAiResponse;
  diagnostics: GlobalSynthesisDiagnostics;
  latencyMs: number;
  // Kept for call-site compatibility; sourced from diagnostics.
  cardsSent: number;
  mapUsed: boolean;
};

const gateEnabled = process.env.RUN_ADMIN_AI_EVAL === "1";

function costUsd(usage: GlobalSynthesisDiagnostics["usage"]): number {
  return (
    (usage.prompt_cache_miss_tokens * PRICE_PER_M.inputMiss +
      usage.prompt_cache_hit_tokens * PRICE_PER_M.inputHit +
      usage.completion_tokens * PRICE_PER_M.output) /
    1_000_000
  );
}

// ---------------------------------------------------------------------------
// Runtime ground-truth helpers (computed from the loaded eligible records)
// ---------------------------------------------------------------------------

function tagsInCategory(record: ContactCardRecord, category: string) {
  const target = category.toLowerCase();
  return (record.contactTags ?? []).filter(
    (tag) => tag.categoryName?.toLowerCase() === target,
  );
}

function idsWithTagInCategory(
  records: ContactCardRecord[],
  category: string,
  tagNames: string[],
): string[] {
  const wanted = new Set(tagNames.map((n) => n.toLowerCase()));
  return records
    .filter((record) =>
      tagsInCategory(record, category).some((tag) =>
        wanted.has((tag.tagName ?? "").toLowerCase()),
      ),
    )
    .map((record) => record.contact.id);
}

function declinedOnlyIds(
  records: ContactCardRecord[],
  category: string,
): string[] {
  return records
    .filter((record) => {
      const tags = tagsInCategory(record, category);
      return (
        tags.length > 0 &&
        tags.every((tag) => (tag.tagName ?? "").toLowerCase() === "declined")
      );
    })
    .map((record) => record.contact.id);
}

function recordAnswerText(record: ContactCardRecord): string {
  return record.applications
    .flatMap((app) => Object.values((app.answers ?? {}) as Record<string, unknown>))
    .filter((v): v is string => typeof v === "string")
    .join(" ");
}

function recordNoteText(record: ContactCardRecord): string {
  return (record.contactNotes ?? [])
    .map((note) => (note as { text?: string }).text ?? "")
    .join(" ");
}

// The `languages` answer field specifically — NOT all answers — so an essay
// mention like "filmed in Spanish waters" does not count as a speaker. The field
// stores two shapes across applications: a plain string, or a JSON array of
// strings (the vast majority). Accept both; join array items with ", ".
function recordLanguagesText(record: ContactCardRecord): string {
  const parts: string[] = [];
  for (const app of record.applications) {
    const value = (app.answers as Record<string, unknown>)?.languages;
    if (typeof value === "string") {
      parts.push(value);
    } else if (Array.isArray(value)) {
      parts.push(
        value.filter((item): item is string => typeof item === "string").join(", "),
      );
    }
  }
  return parts.join(" ");
}

function idsMatching(
  records: ContactCardRecord[],
  test: (record: ContactCardRecord) => boolean,
): string[] {
  return records.filter(test).map((record) => record.contact.id);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function unionIds(response: AdminAiResponse): Set<string> {
  const ids = new Set<string>();
  for (const entry of response.shortlist ?? []) ids.add(entry.contactId);
  for (const match of response.additionalMatches ?? []) ids.add(match.contactId);
  return ids;
}

function shortlistIds(response: AdminAiResponse): string[] {
  return (response.shortlist ?? []).map((entry) => entry.contactId);
}

function recall(found: Set<string>, truth: string[]): number | null {
  if (truth.length === 0) return null;
  const hits = truth.filter((id) => found.has(id)).length;
  return hits / truth.length;
}

function shortlistPrecision(response: AdminAiResponse, truth: string[]): number | null {
  const sl = shortlistIds(response);
  if (sl.length === 0) return null;
  const truthSet = new Set(truth);
  return sl.filter((id) => truthSet.has(id)).length / sl.length;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function fmtPct(value: number | null): string {
  return value === null ? "  n/a" : `${(value * 100).toFixed(0)}%`;
}

function printScorecard(results: EvalResult[]): void {
  const lines: string[] = [];
  lines.push("=".repeat(96));
  lines.push("ADMIN-AI EVAL SCORECARD · provider=deepseek · scan=map_reduce");
  lines.push("=".repeat(96));
  lines.push(
    `${pad("QUESTION", 18)}${pad("RECALL", 8)}${pad("SL-PREC", 9)}${pad("FORBID", 8)}${pad("EMPTY", 7)}${pad("SL/ADD", 8)}${pad("PREFILT", 8)}${pad("CARDS", 7)}${pad("MAP", 5)}${pad("LAT(s)", 8)}${pad("COST$", 9)}`,
  );
  lines.push("-".repeat(104));
  for (const r of results) {
    const empty =
      r.expectEmpty === null ? "-" : r.expectEmptyPass ? "pass" : "FAIL";
    lines.push(
      `${pad(r.key, 18)}${pad(fmtPct(r.recall), 8)}${pad(fmtPct(r.shortlistPrecision), 9)}${pad(String(r.forbiddenViolations.length), 8)}${pad(empty, 7)}${pad(`${r.shortlistCount}/${r.additionalCount}`, 8)}${pad(String(r.prefilteredCount), 8)}${pad(String(r.candidateCount), 7)}${pad(r.mapUsed ? "yes" : "no", 5)}${pad((r.latencyMs / 1000).toFixed(1), 8)}${pad(r.costUsd.toFixed(4), 9)}`,
    );
    for (const note of r.advisory) lines.push(`    · ${note}`);
  }
  lines.push("-".repeat(96));
  const totalCost = results.reduce((n, r) => n + r.costUsd, 0);
  lines.push(`TOTAL COST: $${totalCost.toFixed(4)} over ${results.length} questions`);
  lines.push("=".repeat(96));
  console.info(`\n${lines.join("\n")}\n`);
}

function writeResults(results: EvalResult[]): void {
  const dir = path.join(process.cwd(), ".admin-ai-debug");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `eval-${stamp}.json`);
  writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), "utf8");
  console.info(`[admin-ai-eval] wrote ${file}`);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.runIf(gateEnabled)("admin-ai eval", () => {
  const env: Record<string, string> = (() => {
    try {
      return loadEnv(".env.development.local");
    } catch {
      return {};
    }
  })();
  const apiKey = env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || "";
  const hasKey = Boolean(apiKey);

  let supabase: LiveSupabaseClient;
  let records: ContactCardRecord[] = [];
  const results: EvalResult[] = [];
  const savedEnv: Record<string, string | undefined> = {};
  const forcedKeys = [
    "ADMIN_AI_PROVIDER",
    "ADMIN_AI_SCAN_MODE",
    "DEEPSEEK_THINKING",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_MODEL",
    "DEEPSEEK_BASE_URL",
  ];

  beforeAll(async () => {
    if (!hasKey) return;
    for (const key of forcedKeys) savedEnv[key] = process.env[key];
    process.env.ADMIN_AI_PROVIDER = "deepseek";
    process.env.ADMIN_AI_SCAN_MODE = "map_reduce";
    delete process.env.DEEPSEEK_THINKING;
    process.env.DEEPSEEK_API_KEY = apiKey;
    if (env.DEEPSEEK_MODEL) process.env.DEEPSEEK_MODEL = env.DEEPSEEK_MODEL;
    if (env.DEEPSEEK_BASE_URL) process.env.DEEPSEEK_BASE_URL = env.DEEPSEEK_BASE_URL;

    supabase = createLiveSupabaseClient(env);
    records = await loadEligible(supabase);
  }, 600_000);

  afterAll(() => {
    if (!hasKey) return;
    for (const key of forcedKeys) {
      const original = savedEnv[key];
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
    if (results.length > 0) {
      writeResults(results);
      printScorecard(results);
    }
  });

  // Runs the SAME shared pipeline the orchestrator uses (no drift), with no
  // persistence, evidence off. runGlobalSynthesis does planner/legacy prefilter →
  // render → map-skip/scan → generate → parse → id-repair → sort → enumeration.
  async function runPipeline(question: string): Promise<PipelineOutput> {
    const start = Date.now();
    const result = await runGlobalSynthesis({
      provider: deepSeekAdminAiProvider,
      records,
      question,
      queryPlan: {
        mode: "global_search",
        structuredFilters: [],
        textFocus: question.trim() ? [question.trim()] : [],
        requestedLimit: 10,
      },
      includeEvidence: false,
    });
    return {
      response: result.response,
      diagnostics: result.diagnostics,
      latencyMs: Date.now() - start,
      cardsSent: result.diagnostics.candidateCount,
      mapUsed: result.diagnostics.mapUsed,
    };
  }

  type EvalBase = Omit<
    EvalResult,
    | "costUsd"
    | "shortlistCount"
    | "additionalCount"
    | "cardsSent"
    | "mapUsed"
    | "latencyMs"
    | "prefilteredCount"
    | "candidateCount"
    | "candidateIds"
    | "nearMissCandidateCount"
    | "nearMissModeUsed"
    | "rescueScanUsed"
    | "rescuedCandidateCount"
    | "rescuedIds"
    | "idRepairs"
    | "idDrops"
    | "appendedByEnumeration"
    | "plan"
    | "droppedParts"
    | "assumptions"
    | "truthIds"
    | "unionIds"
    | "missingIds"
  > & { truthIds?: string[] };

  function record(base: EvalBase, out: PipelineOutput): EvalResult {
    const d = out.diagnostics;
    const truthIds = base.truthIds ?? [];
    const union = unionIds(out.response);
    const full: EvalResult = {
      ...base,
      truthIds,
      unionIds: [...union],
      missingIds: truthIds.filter((id) => !union.has(id)),
      shortlistCount: out.response.shortlist?.length ?? 0,
      additionalCount: out.response.additionalMatches?.length ?? 0,
      cardsSent: d.candidateCount,
      mapUsed: d.mapUsed,
      latencyMs: out.latencyMs,
      prefilteredCount: d.prefilteredCount,
      candidateCount: d.candidateCount,
      candidateIds: d.candidateIds,
      nearMissCandidateCount: d.nearMissCandidateCount,
      nearMissModeUsed: d.nearMissModeUsed,
      rescueScanUsed: d.rescueScanUsed,
      rescuedCandidateCount: d.rescuedCandidateCount,
      rescuedIds: d.rescuedIds,
      idRepairs: d.idRepairs,
      idDrops: d.idDrops,
      appendedByEnumeration: d.appendedByEnumeration,
      plan: d.plan,
      droppedParts: d.droppedParts,
      assumptions: out.response.assumptions ?? [],
      costUsd: costUsd(d.usage),
    };
    results.push(full);
    return full;
  }

  function skipIfNoKey(ctx: { skip: () => void }): boolean {
    if (hasKey) return false;
    console.warn(
      "[admin-ai-eval] DEEPSEEK_API_KEY missing from .env.development.local — skipping",
    );
    ctx.skip();
    return true;
  }

  it("cohort-recall: interested/potential for 26 Coral Catch", async (ctx) => {
    if (skipIfNoKey(ctx)) return;
    const question =
      "Which contacts are interested in or potential candidates for the 26 Coral Catch?";
    const truth = idsWithTagInCategory(records, CORAL, [
      "Interested",
      "Potential Candidate",
    ]);
    const forbidden = declinedOnlyIds(records, CORAL);

    const out = await runPipeline(question);
    const union = unionIds(out.response);
    const violations = forbidden.filter((id) => union.has(id));
    const r = record(
      {
        key: "cohort-recall",
        truthIds: truth,
        question,
        truthCount: truth.length,
        recall: recall(union, truth),
        shortlistPrecision: shortlistPrecision(out.response, truth),
        forbiddenViolations: violations,
        expectEmpty: null,
        expectEmptyPass: null,
        advisory: [],
      },
      out,
    );

    expect(violations, "declined-only members must appear nowhere").toEqual([]);
    expect(r.recall, "recall over shortlist∪additionalMatches").toBe(1);
    const truthSet = new Set(truth);
    expect(
      shortlistIds(out.response).filter((id) => !truthSet.has(id)),
      "every shortlisted contact must be a real cohort member",
    ).toEqual([]);
  }, 600_000);

  it("cohort-big: potential candidates for 26 Maldives Academy ScubaSpa", async (ctx) => {
    if (skipIfNoKey(ctx)) return;
    const question =
      "Who are potential candidates for the 26 Maldives Academy ScubaSpa?";
    const truth = idsWithTagInCategory(records, SCUBASPA, ["Potential Candidate"]);

    const out = await runPipeline(question);
    const union = unionIds(out.response);
    const r = record(
      {
        key: "cohort-big",
        truthIds: truth,
        question,
        truthCount: truth.length,
        recall: recall(union, truth),
        shortlistPrecision: shortlistPrecision(out.response, truth),
        forbiddenViolations: [],
        expectEmpty: null,
        expectEmptyPass: null,
        advisory: [`top-10 + ${out.response.additionalMatches?.length ?? 0} overflow`],
      },
      out,
    );

    expect(r.recall, "union recall over the full cohort must be 1.0").toBe(1);
  }, 600_000);

  it("status-trap: who is joining 26 Maldives Academy ScubaSpa", async (ctx) => {
    if (skipIfNoKey(ctx)) return;
    const question = "Who is joining the 26 Maldives Academy ScubaSpa?";
    const joiners = idsWithTagInCategory(records, SCUBASPA, ["Joining"]);
    const potentialOnly = idsWithTagInCategory(records, SCUBASPA, [
      "Potential Candidate",
    ]).filter((id) => !joiners.includes(id));

    const out = await runPipeline(question);
    const union = unionIds(out.response);
    const slSet = new Set(shortlistIds(out.response));
    const pcOnlyInShortlist = potentialOnly.filter((id) => slSet.has(id));
    const advisory = [
      `${pcOnlyInShortlist.length} potential-candidate-only member(s) leaked into the shortlist (status semantics are model territory post-Part-A)`,
    ];
    const r = record(
      {
        key: "status-trap",
        truthIds: joiners,
        question,
        truthCount: joiners.length,
        recall: recall(union, joiners),
        shortlistPrecision: shortlistPrecision(out.response, joiners),
        forbiddenViolations: [],
        expectEmpty: null,
        expectEmptyPass: null,
        advisory,
      },
      out,
    );

    // Assert recall of the joiners; PC-only leakage is documented, not asserted.
    expect(
      joiners.filter((id) => !union.has(id)),
      "all joiners must surface somewhere",
    ).toEqual([]);
    void r;
  }, 600_000);

  it("structured-fact: contacts who speak Spanish", async (ctx) => {
    if (skipIfNoKey(ctx)) return;
    const question = "Which contacts speak Spanish?";
    // Truth is the `languages` answer field only (FIELD_REGISTRY key), not any
    // essay that happens to mention Spanish.
    const truth = idsMatching(records, (rec) =>
      /spanish|espa[nñ]ol/i.test(recordLanguagesText(rec)),
    );

    const out = await runPipeline(question);
    const union = unionIds(out.response);
    const r = record(
      {
        key: "structured-fact",
        truthIds: truth,
        question,
        truthCount: truth.length,
        recall: recall(union, truth),
        shortlistPrecision: shortlistPrecision(out.response, truth),
        forbiddenViolations: [],
        expectEmpty: null,
        expectEmptyPass: null,
        advisory: [],
      },
      out,
    );

    expect(truth.length, "truth set of Spanish speakers should be non-empty").toBeGreaterThan(0);
    expect(r.recall, "union recall over Spanish speakers must be 1.0").toBe(1);
    // The languages field constraint drops the non-Spanish-field contacts, so the
    // evidence rescue scan must have run over that pool (structural check only —
    // no ground truth on rescued content).
    expect(
      out.diagnostics.rescueScanUsed,
      "field constraint drops contacts, so the rescue scan must run",
    ).toBe(true);
  }, 600_000);

  it("note-canary: personal project idea about ocean-animal perception", async (ctx) => {
    if (skipIfNoKey(ctx)) return;
    const question =
      "Who has mentioned a personal project idea about how ocean animals perceive or experience the ocean?";

    const out = await runPipeline(question);
    const union = unionIds(out.response);
    record(
      {
        key: "note-canary",
        truthIds: [YANG_YANG_ID],
        question,
        truthCount: 1,
        recall: union.has(YANG_YANG_ID) ? 1 : 0,
        shortlistPrecision: null,
        forbiddenViolations: [],
        expectEmpty: null,
        expectEmptyPass: null,
        advisory: [`Yang Yang ${union.has(YANG_YANG_ID) ? "surfaced" : "MISSED"}`],
      },
      out,
    );

    expect(
      union.has(YANG_YANG_ID),
      "Yang Yang's call-note idea must surface in shortlist∪additionalMatches",
    ).toBe(true);
  }, 600_000);

  it("negative-control: professional filming under polar ice", async (ctx) => {
    if (skipIfNoKey(ctx)) return;
    const question =
      "Which contacts have professional experience filming under polar ice?";
    const polarRe = /\bpolar\b|under (?:the )?ice|ice[- ]?dive|diving under ice/i;
    const truth = idsMatching(
      records,
      (rec) => polarRe.test(recordAnswerText(rec)) || polarRe.test(recordNoteText(rec)),
    );

    const out = await runPipeline(question);
    const union = unionIds(out.response);
    const shortlistCount = out.response.shortlist?.length ?? 0;
    const additionalCount = out.response.additionalMatches?.length ?? 0;
    const expectEmpty = truth.length === 0;
    const emptyPass = shortlistCount === 0 && additionalCount === 0;

    // Regex hits are NEAR-MISS candidates (partial signal), not ground-truth
    // exact matches for "professional experience filming under polar ice". Score
    // as a near-miss disclosure: the shortlist must not fabricate exact matches
    // outside the hit set, and every hit must be reachable — surfaced in the
    // union OR named (by name) in the uncertainty disclosure.
    const hitSet = new Set(truth);
    const shortlistOutsideHits = expectEmpty
      ? []
      : shortlistIds(out.response).filter((id) => !hitSet.has(id));
    const uncertaintyText = out.response.uncertainty.join(" ").toLowerCase();
    const nameById = new Map(
      records.map((rec) => [rec.contact.id, (rec.contact.name ?? "").toLowerCase()]),
    );
    const unreachableHits = expectEmpty
      ? []
      : truth.filter((id) => {
          if (union.has(id)) return false;
          const name = nameById.get(id) ?? "";
          return !(name.length > 0 && uncertaintyText.includes(name));
        });

    record(
      {
        key: "negative-control",
        truthIds: truth,
        question,
        truthCount: truth.length,
        recall: expectEmpty ? null : recall(union, truth),
        shortlistPrecision: null,
        forbiddenViolations: shortlistOutsideHits,
        expectEmpty,
        expectEmptyPass: expectEmpty ? emptyPass : null,
        advisory: expectEmpty
          ? ["truth empty — expecting no matches"]
          : [`truth non-empty (${truth.length}) — scored as near-miss disclosure`],
      },
      out,
    );

    if (expectEmpty) {
      expect(
        emptyPass,
        "no truth → shortlist AND additionalMatches must be empty",
      ).toBe(true);
    } else {
      expect(
        shortlistOutsideHits,
        "no fabricated exact matches — every shortlist entry must be within the near-miss hit set",
      ).toEqual([]);
      expect(
        unreachableHits,
        "every near-miss hit must surface in shortlist∪additionalMatches or be named in uncertainty",
      ).toEqual([]);
    }
  }, 600_000);

  it("declined-recall: who declined 26 Coral Catch (planner retires the limitation)", async (ctx) => {
    if (skipIfNoKey(ctx)) return;
    const question = "Who declined the 26 Coral Catch?";
    const declined = idsWithTagInCategory(records, CORAL, ["Declined"]);
    const nonDeclined = idsWithTagInCategory(records, CORAL, [
      "Interested",
      "Potential Candidate",
    ]).filter((id) => !declined.includes(id));

    const out = await runPipeline(question);
    const union = unionIds(out.response);
    const slSet = new Set(shortlistIds(out.response));
    const nonDeclinedInShortlist = nonDeclined.filter((id) => slSet.has(id));
    record(
      {
        key: "declined-recall",
        truthIds: declined,
        question,
        truthCount: declined.length,
        recall: recall(union, declined),
        shortlistPrecision: shortlistPrecision(out.response, declined),
        forbiddenViolations: nonDeclinedInShortlist,
        expectEmpty: null,
        expectEmptyPass: null,
        advisory: [
          "planner should emit includeStatuses ['Declined'] so declined members are reachable",
        ],
      },
      out,
    );

    expect(
      declined.filter((id) => !union.has(id)),
      "all declined members must surface (planner retires the old exclusion)",
    ).toEqual([]);
    expect(
      nonDeclinedInShortlist,
      "non-declined cohort members must not be in the shortlist",
    ).toEqual([]);
  }, 600_000);

  it("broad-advisory: people with their own project initiatives (structural only)", async (ctx) => {
    if (skipIfNoKey(ctx)) return;
    const question =
      "Are there any people in our contacts who have their own projects in mind? Something they could do if we assist them, but it's their initiative?";

    const out = await runPipeline(question);
    const union = unionIds(out.response);
    const strengths = (out.response.shortlist ?? []).map((e) => e.matchStrength ?? 0);
    const nonIncreasing = strengths.every(
      (s, i) => i === 0 || s <= strengths[i - 1]!,
    );
    record(
      {
        key: "broad-advisory",
        question,
        truthCount: null,
        recall: null,
        shortlistPrecision: null,
        forbiddenViolations: [],
        expectEmpty: null,
        expectEmptyPass: null,
        advisory: [
          "ADVISORY (no ground truth — structural checks only)",
          `Yang Yang ${union.has(YANG_YANG_ID) ? "appears" : "absent"} in the union`,
        ],
      },
      out,
    );

    expect(
      (out.response.assumptions ?? []).length,
      "assumptions must be stated for a bar-ambiguous question",
    ).toBeGreaterThan(0);
    expect(
      out.response.shortlist?.length ?? 0,
      "shortlist must respect the 10-entry cap",
    ).toBeLessThanOrEqual(10);
    expect(nonIncreasing, "matchStrength must be non-increasing across the shortlist").toBe(true);
  }, 600_000);

  it("qualifier-trap: 'professional equipment' must rank, not hard-filter, the cohort", async (ctx) => {
    if (skipIfNoKey(ctx)) return;
    const question =
      "Which of the people who are interested / potential candidates for the 26 Coral Catch have the most experience with underwater filmmaking / photography? I'm interested especially in experience in the industry, such that they can lead a project already with little guidance? They should own their own professional equipment.";
    // Truth is the cohort itself; this is a RANKING question over that cohort, so
    // there is no roster-recall bar — the lock is that the "professional
    // equipment" / "most experience" QUALIFIERS never become a hard field filter
    // that excludes cohort members (the live bug cut 15 candidates down to 1).
    const truth = idsWithTagInCategory(records, CORAL, [
      "Interested",
      "Potential Candidate",
    ]);

    const out = await runPipeline(question);
    const union = unionIds(out.response);
    const truthSet = new Set(truth);
    const shortlistOutsideCohort = shortlistIds(out.response).filter(
      (id) => !truthSet.has(id),
    );
    const strengths = (out.response.shortlist ?? []).map((e) => e.matchStrength ?? 0);
    const nonIncreasing = strengths.every(
      (s, i) => i === 0 || s <= strengths[i - 1]!,
    );
    const fieldConstraints = out.diagnostics.plan?.fieldConstraints ?? [];

    record(
      {
        key: "qualifier-trap",
        truthIds: truth,
        question,
        truthCount: truth.length,
        recall: recall(union, truth),
        shortlistPrecision: shortlistPrecision(out.response, truth),
        forbiddenViolations: shortlistOutsideCohort,
        expectEmpty: null,
        expectEmptyPass: null,
        advisory: [
          "qualifier ('professional equipment' / 'most experience') must stay MODEL territory — never a field filter that prefilters the cohort",
        ],
      },
      out,
    );

    // Core lock: the quality qualifier must NOT be lifted into a hard field filter.
    expect(
      fieldConstraints,
      "planner must not emit a field constraint for the 'professional equipment' qualifier",
    ).toEqual([]);
    // Nothing beyond the tag cohort was excluded — the equipment qualifier
    // prefiltered no one out.
    expect(
      out.diagnostics.prefilteredCount,
      "prefilter must narrow to exactly the interested/potential cohort — no qualifier exclusion",
    ).toBe(truth.length);
    // Precision: every shortlisted contact is a real cohort member.
    expect(
      shortlistOutsideCohort,
      "every shortlisted contact must be within the interested/potential cohort",
    ).toEqual([]);
    // Ranking question over a non-empty cohort: a shortlist, ranked descending.
    expect(
      out.response.shortlist?.length ?? 0,
      "a ranking question over a non-empty cohort must return a shortlist",
    ).toBeGreaterThan(0);
    expect(
      nonIncreasing,
      "matchStrength must be non-increasing across the shortlist",
    ).toBe(true);
  }, 600_000);
});
