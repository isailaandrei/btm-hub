import { createHash } from "node:crypto";

import type { ProgramSlug } from "@/types/database";

export type ImportFieldType = "text" | "multiselect" | "rating" | "date";

type HeaderSpec = {
  field: string;
  type: ImportFieldType;
};

export type ParsedAcademyImportRow = {
  sourceRowNumber: number;
  email: string;
  submittedAt: string | null;
  answers: Record<string, unknown>;
};

export type ParsedAcademyImportCsv = {
  unknownHeaders: string[];
  missingHeaders: string[];
  duplicateHeaders: string[];
  rows: ParsedAcademyImportRow[];
};

export type AcademyImportSource = {
  program: ProgramSlug;
  label: string;
  sourceId: string;
  spreadsheetId: string;
  gid: string;
};

export const ACADEMY_IMPORT_SOURCES: AcademyImportSource[] = [
  {
    program: "photography",
    label: "Photography",
    sourceId: "google_forms:photography",
    spreadsheetId: "1JcWivifmk-7pcaIutvK95-WHki3CrRhgzGo6xyC6CoI",
    gid: "282509162",
  },
  {
    program: "internship",
    label: "Internship",
    sourceId: "google_forms:internship",
    spreadsheetId: "1dksGxsyXyytHwPYIoeeqJqXrqaCuiJqfW90R59-scDk",
    gid: "843923670",
  },
  {
    program: "freediving",
    label: "Freediving",
    sourceId: "google_forms:freediving",
    spreadsheetId: "12Q2IjM7zpOrFKbNC3uSxxsyJeRnR0uHw8NgAHDagh6w",
    gid: "2063176870",
  },
  {
    program: "filmmaking",
    label: "Filmmaking",
    sourceId: "google_forms:filmmaking",
    spreadsheetId: "1g_owi6OJV3i6U6rbYMRsyJ6vkndiO5byaMeSaN17JSA",
    gid: "1770034077",
  },
];

const SHARED_PERSONAL: Record<string, HeaderSpec> = {
  "first name": { field: "first_name", type: "text" },
  "last name": { field: "last_name", type: "text" },
  nickname: { field: "nickname", type: "text" },
  email: { field: "email", type: "text" },
  phone: { field: "phone", type: "text" },
  age: { field: "age", type: "text" },
  gender: { field: "gender", type: "text" },
};

const SHARED_BACKGROUND: Record<string, HeaderSpec> = {
  nationality: { field: "nationality", type: "text" },
  "country of residence": { field: "country_of_residence", type: "text" },
  languages: { field: "languages", type: "multiselect" },
  "current occupation": { field: "current_occupation", type: "text" },
};

const SHARED_OPEN: Record<string, HeaderSpec> = {
  "how did you hear about btm academy?": {
    field: "referral_source",
    type: "multiselect",
  },
  "do you have any specific questions or concerns?": {
    field: "questions_or_concerns",
    type: "text",
  },
  "is there anything else you'd like to share with us?": {
    field: "anything_else",
    type: "text",
  },
};

const SHARED_SCUBA_DIVING: Record<string, HeaderSpec> = {
  "what type of diving do you practice?": {
    field: "diving_types",
    type: "multiselect",
  },
  "current diving certification level": {
    field: "certification_level",
    type: "multiselect",
  },
  "number of dives": { field: "number_of_dives", type: "text" },
  "last diving activity date": { field: "last_dive_date", type: "date" },
  "diving environments experience": {
    field: "diving_environments",
    type: "multiselect",
  },
  "how would you describe your buoyancy skill level": {
    field: "buoyancy_skill",
    type: "rating",
  },
};

const PHOTOGRAPHY_HEADERS: Record<string, HeaderSpec> = {
  ...SHARED_PERSONAL,
  ...SHARED_BACKGROUND,
  "physical fitness & health": { field: "physical_fitness", type: "text" },
  "do you have any specific health conditions that might affect diving?": {
    field: "health_conditions",
    type: "text",
  },
  ...SHARED_SCUBA_DIVING,
  "current equipment owned": {
    field: "equipment_owned",
    type: "multiselect",
  },
  "list your underwater photography equipment": {
    field: "photography_equipment",
    type: "text",
  },
  "planning to invest in new equipment?": {
    field: "planning_to_invest",
    type: "text",
  },
  "years of experience in underwater photography": {
    field: "years_experience",
    type: "text",
  },
  "rate your current skill level in 'camera settings and operation'": {
    field: "skill_camera_settings",
    type: "rating",
  },
  "rate your current skill level in 'underwater lighting'": {
    field: "skill_lighting",
    type: "rating",
  },
  "rate your current skill level in 'post-production editing'": {
    field: "skill_post_production",
    type: "rating",
  },
  "rate your current skill level in 'color correction'": {
    field: "skill_color_correction",
    type: "rating",
  },
  "rate your current skill level in 'composition'": {
    field: "skill_composition",
    type: "rating",
  },
  "rate your current skill level in 'drone photography'": {
    field: "skill_drone",
    type: "rating",
  },
  "rate your current skill level in 'over-water photography'": {
    field: "skill_over_water",
    type: "rating",
  },
  "what type of underwater content have you created so far?": {
    field: "content_created",
    type: "multiselect",
  },
  "which btm academy category best describes you?": {
    field: "btm_category",
    type: "text",
  },
  "current involvement in underwater photography": {
    field: "involvement_level",
    type: "text",
  },
  "online presence": { field: "online_presence", type: "multiselect" },
  "if you have an online presence, please share your links.": {
    field: "online_links",
    type: "text",
  },
  "do you currently earn income from underwater photography?": {
    field: "income_from_photography",
    type: "text",
  },
  "what is your primary goal with btm academy?": {
    field: "primary_goal",
    type: "text",
  },
  "what is your secondary goal with btm academy?": {
    field: "secondary_goal",
    type: "text",
  },
  "what aspects are you most interested in learning?": {
    field: "learning_aspects",
    type: "multiselect",
  },
  "what type of content would you like to create?": {
    field: "content_to_create",
    type: "multiselect",
  },
  "preferred learning approach": {
    field: "learning_approach",
    type: "multiselect",
  },
  "what marine subjects interest you most?": {
    field: "marine_subjects",
    type: "multiselect",
  },
  "time availability for btm academy training and projects": {
    field: "time_availability",
    type: "text",
  },
  "travel willingness": { field: "travel_willingness", type: "text" },
  "career investment plans": { field: "budget", type: "text" },
  "preferred start timeline": { field: "start_timeline", type: "text" },
  "please describe your ultimate vision for your underwater photography journey": {
    field: "ultimate_vision",
    type: "text",
  },
  "what inspired you to apply to btm academy?": {
    field: "inspiration_to_apply",
    type: "text",
  },
  ...SHARED_OPEN,
};

const FILMMAKING_HEADERS: Record<string, HeaderSpec> = {
  ...SHARED_PERSONAL,
  ...SHARED_BACKGROUND,
  "physical fitness & health": { field: "physical_fitness", type: "text" },
  "do you have any specific health conditions that might affect diving?": {
    field: "health_conditions",
    type: "text",
  },
  ...SHARED_SCUBA_DIVING,
  "current equipment owned": {
    field: "equipment_owned",
    type: "multiselect",
  },
  "list your underwater filming equipment": {
    field: "filming_equipment",
    type: "text",
  },
  "planning to invest in new equipment?": {
    field: "planning_to_invest",
    type: "text",
  },
  "years of experience in underwater filming": {
    field: "years_experience",
    type: "text",
  },
  "rate your current skill level in 'camera settings and operation'": {
    field: "skill_camera_settings",
    type: "rating",
  },
  "rate your current skill level in 'underwater lighting'": {
    field: "skill_lighting",
    type: "rating",
  },
  "rate your current skill level in 'post-production editing'": {
    field: "skill_post_production",
    type: "rating",
  },
  "rate your current skill level in 'color correction'": {
    field: "skill_color_correction",
    type: "rating",
  },
  "rate your current skill level in 'storytelling'": {
    field: "skill_storytelling",
    type: "rating",
  },
  "rate your current skill level in 'drone filming'": {
    field: "skill_drone",
    type: "rating",
  },
  "rate your current skill level in 'over-water filming'": {
    field: "skill_over_water",
    type: "rating",
  },
  "what type of underwater content have you created so far?": {
    field: "content_created",
    type: "multiselect",
  },
  "which btm academy category best describes you?": {
    field: "btm_category",
    type: "text",
  },
  "current involvement in underwater filming": {
    field: "involvement_level",
    type: "text",
  },
  "online presence": { field: "online_presence", type: "multiselect" },
  "if you have an online presence, please share your links.": {
    field: "online_links",
    type: "text",
  },
  "do you currently earn income from underwater filming?": {
    field: "income_from_filming",
    type: "text",
  },
  "what is your primary goal with btm academy?": {
    field: "primary_goal",
    type: "text",
  },
  "what is your secondary goal with btm academy?": {
    field: "secondary_goal",
    type: "text",
  },
  "what aspects are you most interested in learning?": {
    field: "learning_aspects",
    type: "multiselect",
  },
  "what type of content would you like to create?": {
    field: "content_to_create",
    type: "multiselect",
  },
  "preferred learning approach": {
    field: "learning_approach",
    type: "multiselect",
  },
  "what marine subjects interest you most?": {
    field: "marine_subjects",
    type: "multiselect",
  },
  "time availability for btm academy training and projects": {
    field: "time_availability",
    type: "text",
  },
  "travel willingness": { field: "travel_willingness", type: "text" },
  "career investment plans": { field: "budget", type: "text" },
  "preferred start timeline": { field: "start_timeline", type: "text" },
  "please describe your ultimate vision for your underwater filming journey": {
    field: "ultimate_vision",
    type: "text",
  },
  "what inspired you to apply to btm academy?": {
    field: "inspiration_to_apply",
    type: "text",
  },
  ...SHARED_OPEN,
};

const INTERNSHIP_HEADERS: Record<string, HeaderSpec> = {
  ...SHARED_PERSONAL,
  ...SHARED_BACKGROUND,
  "if you have an online presence, please share your links.": {
    field: "online_links",
    type: "text",
  },
  "do you already have accommodation, connections, or other ties to faial, azores?": {
    field: "accommodation_ties",
    type: "text",
  },
  "what is the highest level of education or training you have completed so far?": {
    field: "education_level",
    type: "text",
  },
  "what is your field of study, training or profession?": {
    field: "field_of_study",
    type: "text",
  },
  "which activities (like jobs, studies, school, time-intensive interests) have primarily occupied your time over the past few years?":
    { field: "recent_activities", type: "text" },
  "experience with underwater filmmaking so far": {
    field: "filmmaking_experience",
    type: "text",
  },
  "list your filming equipment": {
    field: "filming_equipment",
    type: "text",
  },
  "what type of content have you created so far?": {
    field: "content_created",
    type: "multiselect",
  },
  "what inspired you to apply to btm academy?": {
    field: "inspiration_to_apply",
    type: "text",
  },
  "please describe your ultimate vision for your underwater filming journey": {
    field: "ultimate_vision",
    type: "text",
  },
  "what do you hope to gain from this internship?": {
    field: "internship_hopes",
    type: "text",
  },
  "why do you think you are a good candidate for the internship?": {
    field: "candidacy_reason",
    type: "text",
  },
  "physical fitness & health": { field: "physical_fitness", type: "text" },
  "do you have any specific health conditions that might affect diving?": {
    field: "health_conditions",
    type: "text",
  },
  ...SHARED_SCUBA_DIVING,
  ...SHARED_OPEN,
};

const FREEDIVING_HEADERS: Record<string, HeaderSpec> = {
  ...SHARED_PERSONAL,
  ...SHARED_BACKGROUND,
  "physical fitness & health": { field: "physical_fitness", type: "text" },
  "do you have any specific health conditions that might affect freediving?": {
    field: "health_conditions",
    type: "text",
  },
  "current freediving certification level": {
    field: "certification_level",
    type: "multiselect",
  },
  "number of freediving sessions": {
    field: "number_of_sessions",
    type: "text",
  },
  "how long have you been practicing freediving or breath-hold activities?": {
    field: "practice_duration",
    type: "text",
  },
  "last freediving session": { field: "last_session_date", type: "date" },
  "what is your current comfortable maximum depth?": {
    field: "comfortable_max_depth",
    type: "text",
  },
  "what is your current comfortable breath-hold time? static or dynamic, please specify": {
    field: "breath_hold_time",
    type: "text",
  },
  "what is your personal best?": {
    field: "personal_best",
    type: "text",
  },
  "diving environments experience": {
    field: "diving_environments",
    type: "multiselect",
  },
  "years of experience in expressive underwater performance": {
    field: "performance_experience",
    type: "text",
  },
  "what forms of movement/sports do you practice on land?": {
    field: "land_movement_sports",
    type: "text",
  },
  "have you ever worked with choreography or improvised movements?": {
    field: "choreography_experience",
    type: "text",
  },
  "have you ever been filmed while moving underwater?": {
    field: "filmed_underwater",
    type: "text",
  },
  "how comfortable are you moving underwater without a dive line?": {
    field: "comfort_without_dive_line",
    type: "rating",
  },
  "how comfortable are you moving freely underwater without fins?": {
    field: "comfort_without_fins",
    type: "rating",
  },
  "how comfortable are you moving freely underwater without mask?": {
    field: "comfort_without_mask",
    type: "rating",
  },
  "list your freediving equipment": {
    field: "freediving_equipment",
    type: "text",
  },
  "which btm academy category best describes you?": {
    field: "btm_category",
    type: "text",
  },
  "online presence": { field: "online_presence", type: "multiselect" },
  "if you have an online presence, please share your links.": {
    field: "online_links",
    type: "text",
  },
  "what is your primary goal with btm academy?": {
    field: "primary_goal",
    type: "text",
  },
  "what is your secondary goal with btm academy?": {
    field: "secondary_goal",
    type: "text",
  },
  "what aspects are you most interested in learning?": {
    field: "learning_aspects",
    type: "multiselect",
  },
  "preferred learning approach": {
    field: "learning_approach",
    type: "multiselect",
  },
  "would you like to receive professional video and photo material of yourself performing underwater? if yes, for what purpose?":
    { field: "professional_material_purpose", type: "text" },
  "time availability for btm academy training and projects": {
    field: "time_availability",
    type: "text",
  },
  "travel willingness": { field: "travel_willingness", type: "text" },
  "career investment plans": { field: "budget", type: "text" },
  "preferred start timeline": { field: "start_timeline", type: "text" },
  "please describe your ultimate vision for your freediving and modeling journey.": {
    field: "ultimate_vision",
    type: "text",
  },
  "what inspired you to apply to btm academy?": {
    field: "inspiration_to_apply",
    type: "text",
  },
  ...SHARED_OPEN,
};

const HEADER_MAPS: Record<ProgramSlug, Record<string, HeaderSpec>> = {
  filmmaking: FILMMAKING_HEADERS,
  photography: PHOTOGRAPHY_HEADERS,
  freediving: FREEDIVING_HEADERS,
  internship: INTERNSHIP_HEADERS,
};

const FIELD_TYPE_MAPS = Object.fromEntries(
  Object.entries(HEADER_MAPS).map(([program, headers]) => [
    program,
    Object.fromEntries(
      Object.values(headers).map((spec) => [spec.field, spec.type]),
    ),
  ]),
) as Record<ProgramSlug, Record<string, ImportFieldType>>;

export function getAcademyImportFieldType(
  program: ProgramSlug,
  field: string,
): ImportFieldType {
  return FIELD_TYPE_MAPS[program]?.[field] ?? "text";
}

// Headers we expect on the sheet but intentionally do not map to an
// answer field:
//   - "zeitstempel" — Google Forms timestamp; we use the typed
//     `submittedAt` extracted upstream rather than the raw text column.
//   - "column 53" — a trailing blank column that the freediving sheet
//     emits because of a now-removed form question. If a sheet is later
//     restructured and a real new column lands at this position, it will
//     be silently dropped — revisit this set when adding form questions.
const SKIPPED_HEADERS = new Set(["zeitstempel", "column 53"]);

function parseGoogleFormsCsv(text: string): string[][] {
  // Strip a leading UTF-8 BOM if present. Google Sheets currently does not
  // include one, but other tools (and future Google changes) may, and the
  // header parser otherwise sees "﻿zeitstempel" instead of
  // "zeitstempel" and silently drops the timestamp column.
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index++;
        continue;
      }

      cell += char;
      index++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index++;
      continue;
    }

    if (char === ",") {
      row.push(cell);
      cell = "";
      index++;
      continue;
    }

    if (char === "\r") {
      index++;
      continue;
    }

    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      index++;
      continue;
    }

    cell += char;
    index++;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

export function normalizeImportHeader(header: string): string {
  return header
    .replace(/[\r\n]+/g, " ")
    .trim()
    .replace(/'\s+'$/, "'")
    .trim()
    .toLowerCase();
}

export function splitMultiselectValue(raw: string): string[] {
  const items: string[] = [];
  let current = "";
  let depth = 0;

  for (let index = 0; index < raw.length; index++) {
    const char = raw[index];
    if (char === "(") depth++;
    if (char === ")") depth = Math.max(0, depth - 1);

    if (char === "," && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) items.push(trimmed);
      current = "";
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) items.push(trimmed);
  return items;
}

function parseGermanTimestamp(raw: string): string | null {
  const match = raw
    .trim()
    .match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
  if (!match) return null;

  const [, day, month, year, hour = "00", minute = "00", second = "00"] = match;
  return new Date(
    Date.UTC(
      Number.parseInt(year, 10),
      Number.parseInt(month, 10) - 1,
      Number.parseInt(day, 10),
      Number.parseInt(hour, 10),
      Number.parseInt(minute, 10),
      Number.parseInt(second, 10),
    ),
  ).toISOString();
}

function parseGermanDate(raw: string): string {
  const match = raw.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return raw.trim();

  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function convertImportValue(raw: string, type: ImportFieldType): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;

  switch (type) {
    case "multiselect":
      return splitMultiselectValue(trimmed);
    case "rating": {
      const parsed = Number.parseInt(trimmed, 10);
      return Number.isNaN(parsed) ? trimmed : parsed;
    }
    case "date":
      return parseGermanDate(trimmed);
    default:
      return trimmed;
  }
}

export function normalizeImportAnswers(
  program: ProgramSlug,
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...answers };

  if (typeof next.email === "string") {
    next.email = next.email.trim().toLowerCase();
  }

  if (typeof next.phone === "string") {
    const trimmedPhone = next.phone.trim();
    next.phone = trimmedPhone || undefined;
  }

  // Historical-form typo corrections. The three rewrites below normalize
  // option strings the Google Forms used to emit but later edited. They
  // exist to keep older sheet rows hash-equal to today's form values, so
  // re-running the import doesn't re-flag them as drift. Audit (and most
  // likely delete) when the underlying form options are changed again, so
  // we don't silently rewrite an option that legitimately ships with the
  // old spelling.
  if (
    (program === "filmmaking" || program === "photography" || program === "freediving") &&
    next.age === "54+"
  ) {
    next.age = "55+";
  }

  if (
    (program === "filmmaking" || program === "photography") &&
    typeof next.time_availability === "string"
  ) {
    next.time_availability = next.time_availability.replace("aproject", "a project");
  }

  if (program === "photography" && next.income_from_photography === "No, thats not my goal.") {
    next.income_from_photography = "No, that's not my goal.";
  }

  return next;
}

export function normalizeImportSubmittedAt(submittedAt: string | null): string | null {
  if (!submittedAt) return null;

  const date = new Date(submittedAt);
  if (Number.isNaN(date.getTime())) return null;

  date.setMilliseconds(0);
  return date.toISOString();
}

export function normalizeImportedEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function normalizeImportArrayForHash(value: unknown[]): unknown[] | undefined {
  const normalized = value
    .map((item) => {
      if (typeof item === "string") {
        const trimmed = item.trim();
        return trimmed || undefined;
      }

      return item ?? undefined;
    })
    .filter((item) => item !== undefined);

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function normalizeImportValueForHash(
  program: ProgramSlug,
  field: string,
  value: unknown,
): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }

  const fieldType = FIELD_TYPE_MAPS[program]?.[field] ?? "text";

  if (fieldType === "multiselect") {
    if (Array.isArray(value)) {
      return normalizeImportArrayForHash(value);
    }

    if (typeof value === "string") {
      const items = splitMultiselectValue(value);
      return normalizeImportArrayForHash(items);
    }
  }

  if (Array.isArray(value)) {
    return normalizeImportArrayForHash(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    if (field === "email") {
      return normalizeImportedEmail(trimmed);
    }

    if (fieldType === "rating") {
      const parsed = Number.parseInt(trimmed, 10);
      return Number.isNaN(parsed) ? trimmed : parsed;
    }

    if (fieldType === "date") {
      return parseGermanDate(trimmed);
    }

    return trimmed;
  }

  return value;
}

export function canonicalizeImportAnswers(
  program: ProgramSlug,
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = normalizeImportAnswers(program, answers);
  const entries = Object.entries(normalized)
    .map(([field, value]) => [
      field,
      normalizeImportValueForHash(program, field, value),
    ] as const)
    .filter((entry): entry is readonly [string, unknown] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return Object.fromEntries(entries);
}

export function buildAcademyImportSubmissionId(input: {
  importSource: string;
  submittedAt: string | null;
  email: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        importSource: input.importSource,
        submittedAt: normalizeImportSubmittedAt(input.submittedAt),
        email: normalizeImportedEmail(input.email),
      }),
    )
    .digest("hex");
}

export function buildAcademyImportContentHash(input: {
  program: ProgramSlug;
  submittedAt: string | null;
  answers: Record<string, unknown>;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        program: input.program,
        submittedAt: normalizeImportSubmittedAt(input.submittedAt),
        answers: canonicalizeImportAnswers(input.program, input.answers),
      }),
    )
    .digest("hex");
}

export function parseAcademyImportCsv(
  program: ProgramSlug,
  csvText: string,
): ParsedAcademyImportCsv {
  const rows = parseGoogleFormsCsv(csvText);
  if (rows.length === 0) {
    return {
      unknownHeaders: [],
      missingHeaders: [],
      duplicateHeaders: [],
      rows: [],
    };
  }

  const headers = rows[0] ?? [];
  const headerMap = HEADER_MAPS[program];
  const normalizedHeaders = headers.map(normalizeImportHeader);
  const normalizedHeaderSet = new Set(
    normalizedHeaders.filter((header) => !SKIPPED_HEADERS.has(header)),
  );
  const specs = headers.map((header) => headerMap[normalizeImportHeader(header)] ?? null);
  const unknownHeaders = normalizedHeaders
    .filter((header) => !SKIPPED_HEADERS.has(header))
    .filter((header) => !headerMap[header]);
  const missingHeaders = Object.keys(headerMap).filter(
    (header) => !normalizedHeaderSet.has(header),
  );
  const duplicateHeaders = normalizedHeaders.filter((header, index) => {
    if (SKIPPED_HEADERS.has(header)) return false;
    return normalizedHeaders.indexOf(header) !== index;
  });

  const timestampColumnIndex = headers.findIndex(
    (header) => normalizeImportHeader(header) === "zeitstempel",
  );

  const parsedRows: ParsedAcademyImportRow[] = [];
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    if (!row || row.every((cell) => cell.trim() === "")) continue;

    const answers: Record<string, unknown> = {};
    for (let cellIndex = 0; cellIndex < specs.length; cellIndex++) {
      const spec = specs[cellIndex];
      if (!spec) continue;

      const value = convertImportValue(row[cellIndex] ?? "", spec.type);
      if (value !== undefined) {
        answers[spec.field] = value;
      }
    }

    const normalizedAnswers = normalizeImportAnswers(program, answers);
    const email = String(normalizedAnswers.email ?? "")
      .trim()
      .toLowerCase();
    if (email === "") continue;

    parsedRows.push({
      sourceRowNumber: index + 1,
      email,
      submittedAt:
        timestampColumnIndex >= 0
          ? parseGermanTimestamp(row[timestampColumnIndex] ?? "")
          : null,
      answers: normalizedAnswers,
    });
  }

  return {
    unknownHeaders: [...new Set(unknownHeaders)],
    missingHeaders,
    duplicateHeaders: [...new Set(duplicateHeaders)],
    rows: parsedRows,
  };
}

export function buildAcademyImportCsvUrl(source: AcademyImportSource): string {
  return `https://docs.google.com/spreadsheets/d/${source.spreadsheetId}/export?format=csv&gid=${source.gid}`;
}

export function buildAcademyImportSourceId(source: AcademyImportSource): string {
  return source.sourceId;
}
