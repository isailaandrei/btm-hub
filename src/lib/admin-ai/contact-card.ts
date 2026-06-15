import {
  getAdminAiFieldLabel,
  getAdminAiFieldOptions,
} from "./field-config";
import type { EvidenceAliasRegistry } from "./evidence-alias";
import type { ContactCardRecord } from "@/lib/data/contact-cards";
import type { EvidenceItem, EvidenceSourceType } from "@/types/admin-ai";
import type { AdminNote, Application, ContactNote } from "@/types/database";

export type RenderedContactCard = {
  contactId: string;
  contactName: string;
  text: string;
  evidence: EvidenceItem[];
};

function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim();
  if (!spaced) return key;
  return `${spaced[0]!.toUpperCase()}${spaced.slice(1)}`;
}

function fieldLabel(key: string): string {
  const label = getAdminAiFieldLabel(key);
  return label === key ? humanizeKey(key) : label;
}

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => formatValue(item))
      .filter((item): item is string => Boolean(item));
    return items.length > 0 ? items.join(", ") : null;
  }
  return JSON.stringify(value);
}

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function evidenceItem(input: {
  evidenceId: string;
  contactId: string;
  applicationId: string | null;
  sourceType: EvidenceSourceType;
  sourceId: string;
  sourceLabel: string;
  sourceTimestamp: string | null;
  program: string | null;
  text: string;
}): EvidenceItem {
  return {
    evidenceId: input.evidenceId,
    contactId: input.contactId,
    applicationId: input.applicationId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceLabel: input.sourceLabel,
    sourceTimestamp: input.sourceTimestamp,
    program: input.program,
    text: input.text,
  };
}

function answerSourceType(key: string, value: unknown): EvidenceSourceType {
  if (getAdminAiFieldOptions(key)) return "application_structured_field";
  if (Array.isArray(value) || typeof value === "number" || typeof value === "boolean") {
    return "application_structured_field";
  }
  return "application_answer";
}

type ApplicationAnswerSignal = {
  fieldKey: string;
  value: string;
  evidenceId: string;
  submittedAt: string | null;
};

type ConversationFactSignal = NonNullable<
  ContactCardRecord["conversationFacts"]
>[number] & {
  fieldKey: string;
};

function collectApplicationAnswerSignals(
  record: ContactCardRecord,
): Map<string, ApplicationAnswerSignal[]> {
  const byField = new Map<string, ApplicationAnswerSignal[]>();
  for (const application of record.applications) {
    const entries = Object.entries(application.answers ?? {}).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    for (const [key, rawValue] of entries) {
      const value = formatValue(rawValue);
      if (!value) continue;
      const sourceType = answerSourceType(key, rawValue);
      const signal: ApplicationAnswerSignal = {
        fieldKey: key,
        value,
        evidenceId: `${sourceType}:${application.id}:${key}`,
        submittedAt: application.submitted_at,
      };
      const bucket = byField.get(key);
      if (bucket) bucket.push(signal);
      else byField.set(key, [signal]);
    }
  }
  return byField;
}

function collectConversationFactSignals(
  record: ContactCardRecord,
): Map<string, ConversationFactSignal[]> {
  const byField = new Map<string, ConversationFactSignal[]>();
  for (const fact of record.conversationFacts ?? []) {
    if (!fact.fieldKey) continue;
    const bucket = byField.get(fact.fieldKey);
    if (bucket) bucket.push(fact as ConversationFactSignal);
    else byField.set(fact.fieldKey, [fact as ConversationFactSignal]);
  }
  return byField;
}

function normalizedConflictValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function hasCrossSourceConflict(
  applicationSignals: ApplicationAnswerSignal[],
  conversationSignals: ConversationFactSignal[],
): boolean {
  const values = new Set(
    [...applicationSignals.map((signal) => signal.value), ...conversationSignals.map((fact) => fact.valueText)]
      .map(normalizedConflictValue)
      .filter(Boolean),
  );
  return values.size > 1;
}

function appendCrossSourceSignals(
  lines: string[],
  record: ContactCardRecord,
  registry: EvidenceAliasRegistry,
): void {
  const applicationsByField = collectApplicationAnswerSignals(record);
  const conversationFactsByField = collectConversationFactSignals(record);
  const rendered: string[] = [];

  const fieldKeys = [...applicationsByField.keys()]
    .filter((key) => conversationFactsByField.has(key))
    .sort((a, b) => fieldLabel(a).localeCompare(fieldLabel(b)));

  for (const fieldKey of fieldKeys) {
    const applicationSignals = applicationsByField.get(fieldKey) ?? [];
    const conversationSignals = conversationFactsByField.get(fieldKey) ?? [];
    if (!hasCrossSourceConflict(applicationSignals, conversationSignals)) continue;

    const label = fieldLabel(fieldKey);
    const applicationParts = applicationSignals.map((signal) => {
      const date = isoDate(signal.submittedAt) ?? "unknown";
      return `application ${date} ${signal.value} [${registry.register(signal.evidenceId)}]`;
    });
    const conversationParts = conversationSignals.map((fact) => {
      const date = isoDate(fact.observedAt) ?? "unknown";
      const evidenceId = `conversation_fact:${fact.id}`;
      return `${fact.source} ${date} ${fact.valueText} [${registry.register(evidenceId)}]`;
    });
    rendered.push(
      `- ${label}: ${[...applicationParts, ...conversationParts].join(" / ")}`,
    );
  }

  if (rendered.length === 0) return;
  lines.push("Cross-source signals");
  lines.push(...rendered);
}

function appendApplication(
  lines: string[],
  evidence: EvidenceItem[],
  contactId: string,
  application: Application,
  registry: EvidenceAliasRegistry,
): void {
  lines.push(
    `Application ${application.id} (${application.program}, ${application.status}, submitted ${isoDate(application.submitted_at) ?? "unknown"})`,
  );

  const entries = Object.entries(application.answers ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const structuredFacts: string[] = [];
  const evidenceLines: string[] = [];
  for (const [key, rawValue] of entries) {
    const value = formatValue(rawValue);
    if (!value) continue;
    const label = fieldLabel(key);
    const sourceType = answerSourceType(key, rawValue);
    const sourceId = `${application.id}:${key}`;
    const evidenceId = `${sourceType}:${application.id}:${key}`;
    if (sourceType === "application_structured_field") {
      structuredFacts.push(`${label}=${value} [${registry.register(evidenceId)}]`);
    } else {
      evidenceLines.push(`- ${label}: ${value} [${registry.register(evidenceId)}]`);
    }
    evidence.push(
      evidenceItem({
        evidenceId,
        contactId,
        applicationId: application.id,
        sourceType,
        sourceId,
        sourceLabel: label,
        sourceTimestamp: application.submitted_at,
        program: application.program,
        text: value,
      }),
    );
  }

  if (structuredFacts.length > 0) {
    lines.push(`- Structured facts: ${structuredFacts.join("; ")}`);
  }
  lines.push(...evidenceLines);

  application.admin_notes.forEach((note, index) => {
    appendAdminNote(lines, evidence, contactId, application, note, index, registry);
  });
}

function appendAdminNote(
  lines: string[],
  evidence: EvidenceItem[],
  contactId: string,
  application: Application,
  note: AdminNote,
  index: number,
  registry: EvidenceAliasRegistry,
): void {
  const text = formatValue(note.text);
  if (!text) return;
  const sourceId = `${application.id}:admin_note:${index}:${note.created_at}`;
  const evidenceId = `application_admin_note:${sourceId}`;
  lines.push(`- Admin note: ${text} [${registry.register(evidenceId)}]`);
  evidence.push(
    evidenceItem({
      evidenceId,
      contactId,
      applicationId: application.id,
      sourceType: "application_admin_note",
      sourceId,
      sourceLabel: "Admin note",
      sourceTimestamp: note.created_at,
      program: application.program,
      text,
    }),
  );
}

function appendContactNote(
  lines: string[],
  evidence: EvidenceItem[],
  contactId: string,
  note: ContactNote,
  registry: EvidenceAliasRegistry,
): void {
  const text = formatValue(note.text);
  if (!text) return;
  const evidenceId = `contact_note:${note.id}`;
  lines.push(`- Contact note: ${text} [${registry.register(evidenceId)}]`);
  evidence.push(
    evidenceItem({
      evidenceId,
      contactId,
      applicationId: null,
      sourceType: "contact_note",
      sourceId: note.id,
      sourceLabel: "Contact note",
      sourceTimestamp: note.created_at,
      program: null,
      text,
    }),
  );
}

function appendConversationFacts(
  lines: string[],
  evidence: EvidenceItem[],
  record: ContactCardRecord,
  registry: EvidenceAliasRegistry,
): void {
  const facts = record.conversationFacts ?? [];
  if (facts.length === 0) return;

  lines.push("Conversation facts");
  const grouped = new Map<string, typeof facts>();
  for (const fact of facts) {
    const key = fact.fieldKey ?? fact.conflictGroup ?? fact.id;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(fact);
    else grouped.set(key, [fact]);
  }

  for (const [fieldKey, bucket] of grouped) {
    const label = fieldLabel(fieldKey);
    const rendered = bucket
      .map((fact) => {
        const date = isoDate(fact.observedAt) ?? "unknown";
        const evidenceId = `conversation_fact:${fact.id}`;
        return `${fact.valueText} [${registry.register(evidenceId)}] (${fact.source} ${date})`;
      })
      .join(" / ");
    lines.push(`- ${label}: ${rendered}`);
  }

  for (const fact of facts) {
    evidence.push(
      evidenceItem({
        evidenceId: `conversation_fact:${fact.id}`,
        contactId: record.contact.id,
        applicationId: null,
        sourceType: "conversation_fact",
        sourceId: fact.id,
        sourceLabel: fact.fieldKey ? fieldLabel(fact.fieldKey) : "Conversation fact",
        sourceTimestamp: fact.observedAt,
        program: null,
        text: fact.valueText,
      }),
    );
  }
}

export function renderContactCard(
  record: ContactCardRecord,
  registry: EvidenceAliasRegistry,
): RenderedContactCard {
  const evidence: EvidenceItem[] = [];
  const lines = [
    `Contact: ${record.contact.name}`,
    `Contact ID: ${record.contact.id}`,
    `Email: ${record.contact.email}`,
    `Phone: ${record.contact.phone ?? "unknown"}`,
  ];

  for (const application of record.applications) {
    appendApplication(lines, evidence, record.contact.id, application, registry);
  }

  appendCrossSourceSignals(lines, record, registry);

  if (record.contactNotes.length > 0) {
    lines.push("Contact notes");
    for (const note of record.contactNotes) {
      appendContactNote(lines, evidence, record.contact.id, note, registry);
    }
  }

  if (record.contactTags.length > 0) {
    lines.push(
      `Tags: ${record.contactTags
        .map((tag) => {
          const evidenceId = `contact_tag:${tag.tagId}`;
          return `${tag.tagName} [${registry.register(evidenceId)}]`;
        })
        .join(", ")}`,
    );
    for (const tag of record.contactTags) {
      const evidenceId = `contact_tag:${tag.tagId}`;
      evidence.push(
        evidenceItem({
          evidenceId,
          contactId: record.contact.id,
          applicationId: null,
          sourceType: "contact_tag",
          sourceId: tag.tagId,
          sourceLabel: "Contact tag",
          sourceTimestamp: tag.assignedAt,
          program: null,
          text: tag.tagName,
        }),
      );
    }
  }

  if (record.conversationDigests?.length) {
    lines.push("Conversation digests");
    for (const digest of record.conversationDigests) {
      lines.push(
        `- ${digest.source} ${isoDate(digest.windowStart) ?? "unknown"}-${isoDate(digest.windowEnd) ?? "unknown"}: ${digest.summary}`,
      );
    }
  }

  appendConversationFacts(lines, evidence, record, registry);

  return {
    contactId: record.contact.id,
    contactName: record.contact.name,
    text: lines.join("\n"),
    evidence,
  };
}
