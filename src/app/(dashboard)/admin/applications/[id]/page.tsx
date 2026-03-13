import { notFound } from "next/navigation";
import { getApplicationById, getApplicantName } from "@/lib/data/applications";
import { getFormDefinition } from "@/lib/academy/forms";
import { StatusSelector } from "./StatusSelector";
import { TagManager } from "./TagManager";
import { NoteForm } from "./NoteForm";
import { STATUS_COLORS } from "../constants";

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (typeof value === "number") return `${value}/10`;
  return String(value);
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const application = await getApplicationById(id);
  if (!application) return notFound();

  const formDef = getFormDefinition(application.program);

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <a
            href="/admin/applications"
            className="mb-2 inline-block text-sm text-brand-cyan-blue-gray transition-colors hover:text-white"
          >
            &larr; Back to applications
          </a>
          <h1 className="text-[length:var(--font-size-h2)] font-medium text-white">
            {getApplicantName(application.answers, "Unnamed Application")}
          </h1>
          <p className="mt-1 text-sm text-brand-cyan-blue-gray">
            <span className="capitalize">{application.program}</span> &middot;{" "}
            Submitted {new Date(application.submitted_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-sm font-medium capitalize ${STATUS_COLORS[application.status]}`}
        >
          {application.status}
        </span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Main content — answers grouped by step */}
        <div className="flex flex-col gap-6">
          {formDef ? (
            formDef.steps.map((step) => (
              <section
                key={step.id}
                className="rounded-lg border border-brand-secondary bg-brand-near-black p-5"
              >
                <h2 className="mb-4 text-base font-medium text-white">
                  {step.title}
                </h2>
                <dl className="flex flex-col gap-3">
                  {step.fields.map((field) => (
                    <div key={field.name} className="flex flex-col gap-0.5">
                      <dt className="text-xs text-brand-cyan-blue-gray">
                        {field.label}
                      </dt>
                      <dd className="text-sm text-white">
                        {formatValue(application.answers[field.name])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))
          ) : (
            <section className="rounded-lg border border-brand-secondary bg-brand-near-black p-5">
              <h2 className="mb-4 text-base font-medium text-white">
                Answers
              </h2>
              <dl className="flex flex-col gap-3">
                {Object.entries(application.answers).map(([key, value]) => (
                  <div key={key} className="flex flex-col gap-0.5">
                    <dt className="text-xs text-brand-cyan-blue-gray">{key}</dt>
                    <dd className="text-sm text-white">{formatValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>

        {/* Sidebar — status, tags, notes */}
        <div className="flex flex-col gap-6">
          {/* Status */}
          <section className="rounded-lg border border-brand-secondary bg-brand-near-black p-4">
            <h3 className="mb-3 text-sm font-medium text-brand-light-gray">
              Status
            </h3>
            <StatusSelector
              applicationId={application.id}
              currentStatus={application.status}
            />
          </section>

          {/* Tags */}
          <section className="rounded-lg border border-brand-secondary bg-brand-near-black p-4">
            <h3 className="mb-3 text-sm font-medium text-brand-light-gray">
              Tags
            </h3>
            <TagManager
              applicationId={application.id}
              tags={application.tags}
            />
          </section>

          {/* Notes */}
          <section className="rounded-lg border border-brand-secondary bg-brand-near-black p-4">
            <h3 className="mb-3 text-sm font-medium text-brand-light-gray">
              Admin Notes
            </h3>
            {application.admin_notes.length > 0 && (
              <div className="mb-4 flex flex-col gap-3">
                {application.admin_notes.map((note, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-brand-secondary bg-brand-secondary/30 p-3"
                  >
                    <p className="text-sm text-white">{note.text}</p>
                    <p className="mt-1 text-xs text-brand-cyan-blue-gray">
                      {note.author_name} &middot;{" "}
                      {new Date(note.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <NoteForm applicationId={application.id} />
          </section>
        </div>
      </div>
    </div>
  );
}
