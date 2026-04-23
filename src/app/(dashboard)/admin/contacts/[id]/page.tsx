import Link from "next/link";
import { notFound } from "next/navigation";
import { validateUUID } from "@/lib/validation-helpers";
import {
  getContactById,
  getApplicationsByContactId,
  getContactTags,
  getTagCategories,
  getTags,
} from "@/lib/data/contacts";
import { getContactEvents } from "@/lib/data/contact-events";
import { getAdminAiProviderAvailability } from "@/lib/admin-ai/provider";
import { listAdminAiThreadSummaries } from "@/lib/data/admin-ai";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AdminAiPanel } from "../../admin-ai/panel";
import { ApplicationCard } from "./application-card";
import { ContactTagManager } from "./contact-tag-manager";
import { ContactDetailRealtimeRefresh } from "./contact-detail-realtime-refresh";
import { Timeline } from "./timeline";

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
  const [
    contact,
    applications,
    contactTagRows,
    events,
    categories,
    allTags,
    initialContactThreads,
    adminAiAvailability,
  ] = await Promise.all([
    getContactById(id),
    getApplicationsByContactId(id),
    getContactTags(id),
    getContactEvents(id),
    getTagCategories(),
    getTags(),
    listAdminAiThreadSummaries({ scope: "contact", contactId: id }),
    getAdminAiProviderAvailability(),
  ]);

  if (!contact) return notFound();

  const latestApplication = applications[0] ?? null;
  const latestApplicationPhone =
    latestApplication && typeof latestApplication.answers.phone === "string"
      ? latestApplication.answers.phone
      : null;

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

      {/* Two-column area: applications + timeline on the left; contact info + tags on the right */}
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
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

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline contactId={contact.id} events={events} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
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
                  <dd>{latestApplicationPhone || contact.phone || "—"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

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
        </div>
      </div>

      {/* Full-width AI Analyst strip */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">AI Analyst</CardTitle>
          <p className="text-xs text-muted-foreground">
            Each question runs a fresh grounded search. Past questions below
            are a log — they are not used as context.
          </p>
        </CardHeader>
        <CardContent>
          <AdminAiPanel
            scope="contact"
            contactId={contact.id}
            contactName={contact.name}
            initialThreads={initialContactThreads}
            providerAvailability={adminAiAvailability}
          />
        </CardContent>
      </Card>
    </div>
  );
}
