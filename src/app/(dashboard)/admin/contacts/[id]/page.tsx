import Link from "next/link";
import { notFound } from "next/navigation";
import { validateUUID } from "@/lib/validation-helpers";
import {
  getContactById,
  getApplicationsByContactId,
  getContactTags,
  getContactNotes,
  getTagCategories,
  getTags,
} from "@/lib/data/contacts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ApplicationCard } from "./application-card";
import { ContactTagManager } from "./contact-tag-manager";
import { ContactNoteForm } from "./contact-note-form";
import { ContactDetailRealtimeRefresh } from "./contact-detail-realtime-refresh";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    validateUUID(id);
  } catch {
    return notFound();
  }
  const [contact, applications, contactTagRows, notes, categories, allTags] =
    await Promise.all([
      getContactById(id),
      getApplicationsByContactId(id),
      getContactTags(id),
      getContactNotes(id),
      getTagCategories(),
      getTags(),
    ]);

  if (!contact) return notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <ContactDetailRealtimeRefresh contactId={contact.id} />

      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin"
          className="mb-2 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          &larr; Back to contacts
        </Link>
        <h1 className="text-[length:var(--font-size-h2)] font-medium text-foreground">
          {contact.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{contact.email}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Left column — Applications */}
        <div className="flex flex-col gap-6">
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications yet.</p>
          ) : applications.length === 1 ? (
            <ApplicationCard application={applications[0]} defaultOpen />
          ) : (
            applications.map((app) => (
              <ApplicationCard key={app.id} application={app} defaultOpen={false} />
            ))
          )}
        </div>

        {/* Right sidebar */}
        <div className="flex flex-col gap-6">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Contact Info</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Email</dt>
                  <dd>{contact.email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Phone</dt>
                  <dd>{contact.phone || "—"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Tags — overflow-visible so the tag assignment dropdown isn't clipped */}
          <Card className="overflow-visible">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <ContactTagManager
                contactId={contact.id}
                contactTagRows={contactTagRows}
                categories={categories}
                allTags={allTags}
              />
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Admin Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {notes.length > 0 && (
                <div className="mb-4 flex flex-col gap-3">
                  {notes.map((note) => (
                    <div
                      key={note.id}
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
              <ContactNoteForm contactId={contact.id} />
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
