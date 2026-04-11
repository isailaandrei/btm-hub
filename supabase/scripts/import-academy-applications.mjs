#!/usr/bin/env node
/**
 * Import real academy application responses from partner A's Google Forms
 * CSV exports into a local-only Supabase seed file.
 *
 * Input:  4 CSVs in the project root (all gitignored — applicant PII):
 *           "_2602 Filmmaking …"
 *           "2602 Photography …"
 *           "Freediving and Modeling …"
 *           "2602 Internship …"
 * Output: supabase/seed.applications.local.sql (gitignored)
 *
 * Usage:
 *   npm run db:import-applications
 *   supabase db reset   # picks up the generated seed via config.toml glob
 *
 * Re-run whenever the CSVs change. The output file is idempotent: each
 * run overwrites it completely.
 *
 * Schema notes:
 * - applications.answers is JSONB. Multi-select checkbox fields are
 *   stored as JSON arrays (split on ", ") EXCEPT certification_level and
 *   languages, which mirror the existing DB shape of comma-joined strings.
 * - Timestamps in the CSVs are German format (DD.MM.YYYY HH:mm:ss);
 *   converted to ISO for submitted_at.
 * - Contacts are deduplicated by lowercased email across all 4 programs.
 * - The normalization migration (20260411000001_normalize_application_
 *   answers.sql) runs at migrate-time, BEFORE this seed loads. To keep
 *   local dev in the same normalized state as production, the same 4
 *   UPDATE statements are appended at the end of the generated seed.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const OUTPUT_PATH = resolve(REPO_ROOT, "supabase/seed.applications.local.sql");

// ---------------------------------------------------------------------------
// Minimal CSV state-machine parser (handles quoted fields, escaped `""`,
// and embedded newlines inside quoted cells — which partner A's CSVs have).
// ---------------------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Value parsers
// ---------------------------------------------------------------------------

/** "02.04.2026 17:30:30" → "2026-04-02 17:30:30" */
function parseGermanTimestamp(s) {
  const m = s
    .trim()
    .match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}${m[4] ? " " + m[4] : ""}`;
}

/** "02.04.2026" → "2026-04-02" (pass-through on any other shape) */
function parseGermanDate(s) {
  const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s.trim();
}

// ---------------------------------------------------------------------------
// Field types — how each CSV cell is converted to its JSONB representation
// ---------------------------------------------------------------------------
const STRING = "str"; // plain string cell
const NUMBER = "num"; // parseInt
const DATE = "date"; // German → ISO
const STRING_MULTI = "str_multi"; // multi-select stored as comma-joined string
const ARRAY_MULTI = "arr_multi"; // multi-select stored as JSON array

// ---------------------------------------------------------------------------
// Column mappings per program. Each entry is [dbKey, type] for that column
// index; `null` means "skip" (or "consume as submitted_at" when type is
// "timestamp"). Mappings reflect what partner A's Google Forms actually
// emit today (2026-04-11 extraction).
// ---------------------------------------------------------------------------
const MAPPINGS = {
  filmmaking: [
    [null, "timestamp"],
    ["first_name", STRING],
    ["last_name", STRING],
    ["nickname", STRING],
    ["email", STRING],
    ["phone", STRING],
    ["age", STRING],
    ["gender", STRING],
    ["nationality", STRING],
    ["country_of_residence", STRING],
    ["languages", STRING_MULTI],
    ["current_occupation", STRING],
    ["physical_fitness", STRING],
    ["health_conditions", STRING],
    ["diving_types", ARRAY_MULTI],
    ["certification_level", STRING_MULTI],
    ["number_of_dives", STRING],
    ["last_dive_date", DATE],
    ["diving_environments", ARRAY_MULTI],
    ["buoyancy_skill", NUMBER],
    ["equipment_owned", ARRAY_MULTI],
    ["filming_equipment", STRING],
    ["planning_to_invest", STRING],
    ["years_experience", STRING],
    ["skill_camera_settings", NUMBER],
    ["skill_lighting", NUMBER],
    ["skill_post_production", NUMBER],
    ["skill_color_correction", NUMBER],
    ["skill_storytelling", NUMBER],
    ["skill_drone", NUMBER],
    ["skill_over_water", NUMBER],
    ["content_created", ARRAY_MULTI],
    ["btm_category", STRING],
    ["involvement_level", STRING],
    ["online_presence", ARRAY_MULTI],
    ["online_links", STRING],
    ["income_from_filming", STRING],
    ["primary_goal", STRING],
    ["secondary_goal", STRING],
    ["learning_aspects", ARRAY_MULTI],
    ["content_to_create", ARRAY_MULTI],
    ["learning_approach", ARRAY_MULTI],
    ["marine_subjects", ARRAY_MULTI],
    ["time_availability", STRING],
    ["travel_willingness", STRING],
    ["budget", STRING],
    ["start_timeline", STRING],
    ["ultimate_vision", STRING],
    ["inspiration_to_apply", STRING],
    ["referral_source", ARRAY_MULTI],
    ["questions_or_concerns", STRING],
    ["anything_else", STRING],
  ],
  // Photography has a reordered personal section — online_links, age, and
  // budget float to the top after email, and nickname/phone come later.
  photography: [
    [null, "timestamp"],
    ["first_name", STRING],
    ["last_name", STRING],
    ["email", STRING],
    ["online_links", STRING],
    ["age", STRING],
    ["budget", STRING],
    ["nickname", STRING],
    ["phone", STRING],
    ["gender", STRING],
    ["nationality", STRING],
    ["country_of_residence", STRING],
    ["languages", STRING_MULTI],
    ["current_occupation", STRING],
    ["physical_fitness", STRING],
    ["health_conditions", STRING],
    ["diving_types", ARRAY_MULTI],
    ["certification_level", STRING_MULTI],
    ["number_of_dives", STRING],
    ["last_dive_date", DATE],
    ["diving_environments", ARRAY_MULTI],
    ["buoyancy_skill", NUMBER],
    ["equipment_owned", ARRAY_MULTI],
    ["photography_equipment", STRING],
    ["planning_to_invest", STRING],
    ["years_experience", STRING],
    ["skill_camera_settings", NUMBER],
    ["skill_lighting", NUMBER],
    ["skill_post_production", NUMBER],
    ["skill_color_correction", NUMBER],
    ["skill_composition", NUMBER],
    ["skill_drone", NUMBER],
    ["skill_over_water", NUMBER],
    ["content_created", ARRAY_MULTI],
    ["btm_category", STRING],
    ["involvement_level", STRING],
    ["online_presence", ARRAY_MULTI],
    ["income_from_photography", STRING],
    ["primary_goal", STRING],
    ["secondary_goal", STRING],
    ["learning_aspects", ARRAY_MULTI],
    ["content_to_create", ARRAY_MULTI],
    ["learning_approach", ARRAY_MULTI],
    ["marine_subjects", ARRAY_MULTI],
    ["time_availability", STRING],
    ["travel_willingness", STRING],
    ["start_timeline", STRING],
    ["ultimate_vision", STRING],
    ["inspiration_to_apply", STRING],
    ["referral_source", ARRAY_MULTI],
    ["questions_or_concerns", STRING],
    ["anything_else", STRING],
  ],
  freediving: [
    [null, "timestamp"],
    ["first_name", STRING],
    ["last_name", STRING],
    ["nickname", STRING],
    ["email", STRING],
    ["phone", STRING],
    ["age", STRING],
    ["gender", STRING],
    ["nationality", STRING],
    ["country_of_residence", STRING],
    ["languages", STRING_MULTI],
    ["current_occupation", STRING],
    ["physical_fitness", STRING],
    ["health_conditions", STRING],
    ["certification_level", STRING_MULTI],
    ["number_of_sessions", STRING],
    ["practice_duration", STRING],
    ["last_session_date", DATE],
    ["comfortable_max_depth", STRING],
    ["breath_hold_time", STRING],
    ["personal_best", STRING],
    ["diving_environments", ARRAY_MULTI],
    ["performance_experience", STRING],
    ["land_movement_sports", STRING],
    ["choreography_experience", STRING],
    ["filmed_underwater", STRING],
    ["comfort_without_dive_line", NUMBER],
    ["comfort_without_fins", NUMBER],
    ["comfort_without_mask", NUMBER],
    ["freediving_equipment", STRING],
    ["btm_category", STRING],
    ["online_presence", ARRAY_MULTI],
    ["online_links", STRING],
    ["primary_goal", STRING],
    ["secondary_goal", STRING],
    ["learning_aspects", ARRAY_MULTI],
    ["learning_approach", ARRAY_MULTI],
    ["professional_material_purpose", STRING],
    ["time_availability", STRING],
    ["travel_willingness", STRING],
    ["budget", STRING],
    ["start_timeline", STRING],
    ["ultimate_vision", STRING],
    ["inspiration_to_apply", STRING],
    ["referral_source", ARRAY_MULTI],
    ["questions_or_concerns", STRING],
    ["anything_else", STRING],
  ],
  internship: [
    [null, "timestamp"],
    ["first_name", STRING],
    ["last_name", STRING],
    ["nickname", STRING],
    ["email", STRING],
    ["phone", STRING],
    ["age", STRING],
    ["gender", STRING],
    ["nationality", STRING],
    ["country_of_residence", STRING],
    ["languages", STRING_MULTI],
    ["online_links", STRING],
    ["accommodation_ties", STRING],
    ["current_occupation", STRING],
    ["education_level", STRING],
    ["field_of_study", STRING],
    ["recent_activities", STRING],
    ["filmmaking_experience", STRING],
    ["filming_equipment", STRING],
    ["content_created", ARRAY_MULTI],
    ["inspiration_to_apply", STRING],
    ["ultimate_vision", STRING],
    ["internship_hopes", STRING],
    ["candidacy_reason", STRING],
    ["physical_fitness", STRING],
    ["health_conditions", STRING],
    ["diving_types", ARRAY_MULTI],
    ["certification_level", STRING_MULTI],
    ["number_of_dives", STRING],
    ["last_dive_date", DATE],
    ["diving_environments", ARRAY_MULTI],
    ["buoyancy_skill", NUMBER],
    ["referral_source", ARRAY_MULTI],
    ["questions_or_concerns", STRING],
    ["anything_else", STRING],
  ],
};

const PROGRAMS = [
  [
    "filmmaking",
    "_2602 Filmmaking - BTM Academy Application Form (Antworten) - Formularantworten 1.csv",
  ],
  [
    "photography",
    "2602 Photography - BTM Academy Application Form (Antworten) - Formularantworten 1.csv",
  ],
  [
    "freediving",
    "Freediving and Modeling - BTM Academy Application Form (Antworten) - Formularantworten 1.csv",
  ],
  [
    "internship",
    "2602 Internship - BTM Academy Application Form (Antworten) - Formularantworten 1.csv",
  ],
];

// ---------------------------------------------------------------------------
// SQL literal helpers
// ---------------------------------------------------------------------------
function sqlString(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function jsonbLiteral(value) {
  // Serialize as JSON, then wrap as a Postgres string literal cast to jsonb.
  // Single quotes inside JSON (inside string values) get escaped by sqlString.
  return sqlString(JSON.stringify(value)) + "::jsonb";
}

function uuid(prefix, counter) {
  // Deterministic fake UUID: `<prefix>-0000000000NN` where NN is counter.
  // Only used locally; applications.id has no uniqueness cross-dataset.
  const padded = String(counter).padStart(12, "0");
  return `${prefix}-${padded}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const contacts = new Map(); // email → contact
  const applications = [];
  let contactCounter = 0;
  let appCounter = 0;
  const stats = {};

  for (const [program, file] of PROGRAMS) {
    const path = resolve(REPO_ROOT, file);
    let text;
    try {
      text = await readFile(path, "utf8");
    } catch (err) {
      console.error(`\n✗ Failed to read ${file}`);
      console.error(`  ${err.message}`);
      process.exit(1);
    }
    const rows = parseCsv(text);
    const mapping = MAPPINGS[program];
    let programCount = 0;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((c) => (c ?? "").trim() === "")) continue;

      const answers = {};
      let submittedAt = null;

      for (let i = 0; i < mapping.length && i < row.length; i++) {
        const [key, type] = mapping[i];
        const raw = (row[i] ?? "").trim();

        if (type === "timestamp") {
          submittedAt = parseGermanTimestamp(raw);
          continue;
        }
        if (key === null) continue;
        if (raw === "") continue;

        switch (type) {
          case STRING:
            answers[key] = raw;
            break;
          case NUMBER: {
            const n = Number.parseInt(raw, 10);
            if (!Number.isNaN(n)) answers[key] = n;
            break;
          }
          case DATE:
            answers[key] = parseGermanDate(raw);
            break;
          case STRING_MULTI:
            answers[key] = raw;
            break;
          case ARRAY_MULTI:
            answers[key] = raw
              .split(/,\s+/)
              .map((s) => s.trim())
              .filter(Boolean);
            break;
        }
      }

      const email = (answers.email ?? "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "");
      if (!email) {
        // No email — skip (shouldn't happen in partner A's data but be safe)
        continue;
      }

      // Dedupe contact by email across all programs.
      let contact = contacts.get(email);
      if (!contact) {
        contactCounter++;
        const firstName = answers.first_name ?? "";
        const lastName = answers.last_name ?? "";
        const name = `${firstName} ${lastName}`.trim() || email;
        contact = {
          id: uuid("11111111-1111-1111-1111", contactCounter),
          email,
          name,
          phone: answers.phone ?? null,
        };
        contacts.set(email, contact);
      }

      appCounter++;
      applications.push({
        id: uuid("22222222-2222-2222-2222", appCounter),
        program,
        contact_id: contact.id,
        answers,
        submitted_at: submittedAt ?? "2026-01-01 00:00:00",
      });
      programCount++;
    }

    stats[program] = programCount;
  }

  // -----------------------------------------------------------------------
  // Emit SQL
  // -----------------------------------------------------------------------
  const out = [];
  out.push(
    "-- AUTO-GENERATED by supabase/scripts/import-academy-applications.mjs",
  );
  out.push("-- DO NOT COMMIT — contains applicant PII.");
  out.push("-- Regenerate with: npm run db:import-applications");
  out.push(
    `-- Input: 4 Google Forms CSVs in the repo root (all gitignored).`,
  );
  out.push("");
  out.push("-- Row counts per program:");
  for (const [p, n] of Object.entries(stats)) out.push(`--   ${p}: ${n}`);
  out.push(`--   contacts (deduped by email): ${contacts.size}`);
  out.push("");

  out.push("INSERT INTO public.contacts (id, email, name, phone) VALUES");
  const contactRows = [...contacts.values()].map(
    (c) =>
      `  (${sqlString(c.id)}, ${sqlString(c.email)}, ${sqlString(c.name)}, ${c.phone ? sqlString(c.phone) : "NULL"})`,
  );
  out.push(contactRows.join(",\n"));
  out.push("ON CONFLICT (email) DO NOTHING;");
  out.push("");

  out.push(
    "INSERT INTO public.applications (id, program, status, contact_id, answers, submitted_at) VALUES",
  );
  const appRows = applications.map(
    (a) =>
      `  (${sqlString(a.id)}, ${sqlString(a.program)}, 'reviewing', ${sqlString(a.contact_id)}, ${jsonbLiteral(a.answers)}, ${sqlString(a.submitted_at)})`,
  );
  out.push(appRows.join(",\n"));
  out.push("ON CONFLICT (id) DO NOTHING;");
  out.push("");

  // -----------------------------------------------------------------------
  // Re-run the normalization migration against the freshly-seeded rows.
  // (The migration runs before seed.sql during `supabase db reset`, so any
  // legacy typos / split-array referral_sources inserted above still need
  // normalization for local dev to mirror production post-migration state.)
  // -----------------------------------------------------------------------
  out.push("-- ========================================================");
  out.push("-- Post-seed re-run of the normalization migration.");
  out.push(
    "-- Mirrors supabase/migrations/20260411000001_normalize_application_answers.sql",
  );
  out.push("-- ========================================================");
  out.push("");
  out.push("UPDATE public.applications");
  out.push("SET answers = jsonb_set(answers, '{age}', '\"55+\"'::jsonb)");
  out.push(
    "WHERE program IN ('filmmaking', 'photography', 'freediving') AND answers->>'age' = '54+';",
  );
  out.push("");
  out.push("UPDATE public.applications");
  out.push("SET answers = jsonb_set(");
  out.push("  answers, '{time_availability}',");
  out.push(
    "  to_jsonb(replace(answers->>'time_availability', 'aproject', 'a project'))",
  );
  out.push(")");
  out.push(
    "WHERE program IN ('filmmaking', 'photography') AND answers->>'time_availability' LIKE '%aproject%';",
  );
  out.push("");
  out.push("UPDATE public.applications");
  out.push("SET answers = jsonb_set(");
  out.push("  answers, '{income_from_photography}',");
  out.push("  '\"No, that''s not my goal.\"'::jsonb");
  out.push(")");
  out.push(
    "WHERE program = 'photography' AND answers->>'income_from_photography' = 'No, thats not my goal.';",
  );
  out.push("");
  out.push("UPDATE public.applications");
  out.push("SET answers = jsonb_set(");
  out.push("  answers, '{referral_source}',");
  out.push("  COALESCE(");
  out.push("    (");
  out.push("      SELECT jsonb_agg(x)");
  out.push(
    "      FROM jsonb_array_elements_text(answers->'referral_source') AS x",
  );
  out.push(
    "      WHERE x NOT IN ('Social Media (Instagram', 'Facebook', 'etc.)')",
  );
  out.push("    ),");
  out.push("    '[]'::jsonb");
  out.push(
    "  ) || '[\"Social Media (Instagram, Facebook, etc.)\"]'::jsonb",
  );
  out.push(")");
  out.push(
    "WHERE answers->'referral_source' @> '[\"Social Media (Instagram\"]'::jsonb",
  );
  out.push(
    "  AND answers->'referral_source' @> '[\"Facebook\"]'::jsonb",
  );
  out.push(
    "  AND answers->'referral_source' @> '[\"etc.)\"]'::jsonb;",
  );
  out.push("");

  // -----------------------------------------------------------------------
  // Write to disk
  // -----------------------------------------------------------------------
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, out.join("\n") + "\n", "utf8");

  console.log(`✓ Wrote ${OUTPUT_PATH}`);
  console.log(`  contacts (deduped by email): ${contacts.size}`);
  for (const [p, n] of Object.entries(stats)) console.log(`  ${p}: ${n}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
