import {
  getAdminAiFieldLabel,
  getAdminAiFieldOptions,
} from "./field-config";
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

function appendApplication(
  lines: string[],
  evidence: EvidenceItem[],
  contactId: string,
  application: Application,
): void {
  lines.push(
    `Application ${application.id} (${application.program}, ${application.status}, submitted ${isoDate(application.submitted_at) ?? "unknown"})`,
  );

  const entries = Object.entries(application.answers ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [key, rawValue] of entries) {
    const value = formatValue(rawValue);
    if (!value) continue;
    const label = fieldLabel(key);
    const sourceType = answerSourceType(key, rawValue);
    const sourceId = `${application.id}:${key}`;
    const evidenceId = `${sourceType}:${application.id}:${key}`;
    lines.push(`- ${label}: ${value} [${evidenceId}]`);
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

  application.admin_notes.forEach((note, index) => {
    appendAdminNote(lines, evidence, contactId, application, note, index);
  });
}

function appendAdminNote(
  lines: string[],
  evidence: EvidenceItem[],
  contactId: string,
  application: Application,
  note: AdminNote,
  index: number,
): void {
  const text = formatValue(note.text);
  if (!text) return;
  const sourceId = `${application.id}:admin_note:${index}:${note.created_at}`;
  const evidenceId = `application_admin_note:${sourceId}`;
  lines.push(`- Admin note: ${text} [${evidenceId}]`);
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
): void {
  const text = formatValue(note.text);
  if (!text) return;
  const evidenceId = `contact_note:${note.id}`;
  lines.push(`- Contact note: ${text} [${evidenceId}]`);
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
        return `${fact.valueText} [${fact.source} ${date}]`;
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

export function renderContactCard(record: ContactCardRecord): RenderedContactCard {
  const evidence: EvidenceItem[] = [];
  const lines = [
    `Contact: ${record.contact.name}`,
    `Contact ID: ${record.contact.id}`,
    `Email: ${record.contact.email}`,
    `Phone: ${record.contact.phone ?? "unknown"}`,
  ];

  for (const application of record.applications) {
    appendApplication(lines, evidence, record.contact.id, application);
  }

  if (record.contactNotes.length > 0) {
    lines.push("Contact notes");
    for (const note of record.contactNotes) {
      appendContactNote(lines, evidence, record.contact.id, note);
    }
  }

  if (record.contactTags.length > 0) {
    lines.push("Tags");
    for (const tag of record.contactTags) {
      const evidenceId = `contact_tag:${tag.tagId}`;
      lines.push(`- Tag: ${tag.tagName} [${evidenceId}]`);
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

  appendConversationFacts(lines, evidence, record);

  return {
    contactId: record.contact.id,
    contactName: record.contact.name,
    text: lines.join("\n"),
    evidence,
  };
}
