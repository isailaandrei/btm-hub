import { getFormDefinition } from "@/lib/academy/forms";
import type { Application } from "@/types/database";

/**
 * Format one stored answer for display. Mirrors the admin ApplicationCard's
 * `formatValue`, except empty values collapse to `""` (the caller skips them)
 * instead of an em dash — a shareable document reads better showing only the
 * questions that were actually answered.
 */
export function formatAnswer(value: unknown): string {
  if (value == null || value === "") return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") return `${value}/10`;
  return String(value);
}

/** Best-effort human name for the applicant, from their own answers. */
export function applicantDisplayName(answers: Application["answers"]): string {
  const parts = [answers.first_name, answers.last_name]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .map((part) => part.trim());
  if (parts.length > 0) return parts.join(" ");
  if (typeof answers.name === "string" && answers.name.trim() !== "") {
    return answers.name.trim();
  }
  if (typeof answers.email === "string" && answers.email.trim() !== "") {
    return answers.email.trim();
  }
  return "Applicant";
}

function titleCase(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/** Title used for the browser tab and the default "Save as PDF" filename. */
export function buildDocumentTitle(application: Application): string {
  const name = applicantDisplayName(application.answers);
  return `${name} - BTM Application`;
}

const STATUS_LABEL: Record<Application["status"], string> = {
  reviewing: "Reviewing",
  accepted: "Accepted",
  rejected: "Rejected",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

interface RenderedField {
  key: string;
  label: string;
  value: string;
}

/**
 * Group the application's answers into labelled sections using the program's
 * form definition, keeping only answered fields. Falls back to the raw
 * answer keys when no form definition is registered for the program.
 * Internal-only data (admin notes, tags) is intentionally never included —
 * this document is meant to be handed to people off the platform.
 */
function buildSections(
  application: Application,
): { title: string; fields: RenderedField[] }[] {
  const formDef = getFormDefinition(application.program);
  const { answers } = application;

  if (!formDef) {
    const fields = Object.entries(answers)
      .map(([key, value]) => ({ key, label: key, value: formatAnswer(value) }))
      .filter((field) => field.value !== "");
    return fields.length > 0 ? [{ title: "Responses", fields }] : [];
  }

  return formDef.steps
    .map((step) => ({
      title: step.title,
      fields: step.fields
        .map((field) => ({
          key: field.name,
          label: field.label,
          value: formatAnswer(answers[field.name]),
        }))
        .filter((field) => field.value !== ""),
    }))
    .filter((section) => section.fields.length > 0);
}

interface ApplicationPrintDocumentProps {
  application: Application;
}

/**
 * Server-rendered, print-optimised document for a single application. Forced to
 * light colours so it prints cleanly regardless of the viewer's theme, and
 * self-contained (no app chrome) so it lives on its own standalone route.
 */
export function ApplicationPrintDocument({
  application,
}: ApplicationPrintDocumentProps) {
  const sections = buildSections(application);
  const applicant = applicantDisplayName(application.answers);

  return (
    <div className="pdf-document mx-auto max-w-[820px] bg-white px-8 py-10 text-neutral-900 print:max-w-none print:p-[16mm]">
      <style>{`
        /* Zero page margin removes the browser-injected header/footer (page
           URL, timestamp, document title, page number) from the PDF — those
           only print inside a page margin. Per-page top spacing instead comes
           from padding on the sections/fields below: unlike margin, padding is
           preserved when a block starts at the top of a new page, so later
           pages don't butt against the top edge. */
        @page { margin: 0; }
        @media print {
          html, body { background: #fff; }
          .pdf-no-print { display: none !important; }
        }
        .pdf-field { break-inside: avoid; }
        .pdf-header { break-after: avoid; }
        .pdf-heading { break-after: avoid; }
      `}</style>

      <header className="pdf-header mb-8 border-b border-neutral-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Behind The Mask
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">
          {titleCase(application.program)} Application
        </h1>
        <p className="mt-1 text-lg text-neutral-700">{applicant}</p>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-sm text-neutral-600">
          <div className="flex gap-2">
            <dt className="font-medium text-neutral-500">Submitted</dt>
            <dd>{formatDate(application.submitted_at)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-neutral-500">Status</dt>
            <dd>{STATUS_LABEL[application.status]}</dd>
          </div>
        </dl>
      </header>

      {sections.length === 0 ? (
        <p className="text-sm text-neutral-500">
          This application has no recorded answers.
        </p>
      ) : (
        <div className="flex flex-col">
          {sections.map((section) => (
            <section key={section.title} className="pt-8 first:pt-0">
              <h2 className="pdf-heading text-sm font-semibold uppercase tracking-wider text-neutral-500">
                {section.title}
              </h2>
              <dl className="flex flex-col">
                {section.fields.map((field) => (
                  <div
                    key={field.key}
                    className="pdf-field flex flex-col gap-1 pt-6"
                  >
                    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      {field.label}
                    </dt>
                    <dd className="whitespace-pre-wrap break-words text-sm text-neutral-900">
                      {field.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
