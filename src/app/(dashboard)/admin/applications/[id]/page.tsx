import Link from "next/link";
import { notFound } from "next/navigation";
import { getApplicationById, getApplicantName } from "@/lib/data/applications";
import { getFormDefinition } from "@/lib/academy/forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { STATUS_BADGE_CLASS } from "../constants";
import { StatusSelector } from "./StatusSelector";
import { TagManager } from "./TagManager";
import { NoteForm } from "./NoteForm";

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
          <Link
            href="/admin"
            className="mb-2 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            &larr; Back to applications
          </Link>
          <h1 className="text-[length:var(--font-size-h2)] font-medium text-foreground">
            {getApplicantName(application.answers, "Unnamed Application")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="capitalize">{application.program}</span> &middot;{" "}
            Submitted {new Date(application.submitted_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <Badge
          variant="outline"
          className={`capitalize ${STATUS_BADGE_CLASS[application.status]}`}
        >
          {application.status}
        </Badge>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Main content — answers grouped by step */}
        <div className="flex flex-col gap-6">
          {formDef ? (
            formDef.steps.map((step) => (
              <Card key={step.id}>
                <CardHeader>
                  <CardTitle>{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="flex flex-col gap-3">
                    {step.fields.map((field) => (
                      <div key={field.name} className="flex flex-col gap-0.5">
                        <dt className="text-xs text-muted-foreground">
                          {field.label}
                        </dt>
                        <dd className="text-sm text-foreground">
                          {formatValue(application.answers[field.name])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Answers</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-3">
                  {Object.entries(application.answers).map(([key, value]) => (
                    <div key={key} className="flex flex-col gap-0.5">
                      <dt className="text-xs text-muted-foreground">{key}</dt>
                      <dd className="text-sm text-foreground">{formatValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar — status, tags, notes */}
        <div className="flex flex-col gap-6">
          {/* Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StatusSelector
                applicationId={application.id}
                currentStatus={application.status}
              />
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                Tags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TagManager
                applicationId={application.id}
                tags={application.tags}
              />
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                Admin Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {application.admin_notes.length > 0 && (
                <div className="mb-4 flex flex-col gap-3">
                  {application.admin_notes.map((note) => (
                    <div
                      key={`${note.created_at}-${note.author_id}`}
                      className="rounded-md border border-border bg-muted/30 p-3"
                    >
                      <p className="text-sm text-foreground">{note.text}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {note.author_name} &middot;{" "}
                        {new Date(note.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <NoteForm applicationId={application.id} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
