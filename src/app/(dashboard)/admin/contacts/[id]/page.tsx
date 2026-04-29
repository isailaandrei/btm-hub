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
import { getEmailTimelineItems } from "@/lib/data/email-timeline";
import { getAdminAiProviderAvailability } from "@/lib/admin-ai/provider";
import { listAdminAiThreadSummaries } from "@/lib/data/admin-ai";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ApplicationCard } from "./application-card";
import { ContactTagManager } from "./contact-tag-manager";
import { ContactDetailRealtimeRefresh } from "./contact-detail-realtime-refresh";
import { Timeline } from "./timeline";
import { CollapsibleAiPanel } from "./collapsible-ai-panel";
import { SuppressionControl } from "../../email/suppression-control";
import { ContactEmailLauncher } from "../../email/contact-email-launcher";

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
    emailTimelineItems,
    categories,
    allTags,
    initialContactThreads,
    adminAiAvailability,
  ] = await Promise.all([
    getContactById(id),
    getApplicationsByContactId(id),
    getContactTags(id),
    getContactEvents(id),
    getEmailTimelineItems(id),
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
  const displayPhone = latestApplicationPhone || contact.phone || null;

  return (
    <div className="mx-auto max-w-5xl">
      <ContactDetailRealtimeRefresh contactId={contact.id} />

      {/* Header — absorbs Contact Info */}
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
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="mr-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              Email
            </span>
            <a
              href={`mailto:${contact.email}`}
              className="text-foreground transition-colors hover:text-primary"
            >
              {contact.email}
            </a>
          </span>
          {displayPhone && (
            <span>
              <span className="mr-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                Phone
              </span>
              <a
                href={`tel:${displayPhone}`}
                className="text-foreground transition-colors hover:text-primary"
              >
                {displayPhone}
              </a>
            </span>
          )}
        </div>
      </div>

      {/* Two-column: applications + timeline left, tags right */}
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-6">
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications yet.</p>
          ) : (
            applications.map((app) => (
              <ApplicationCard key={app.id} application={app} defaultOpen={false} />
            ))
          )}

          <Timeline
            contactId={contact.id}
            events={events}
            emailItems={emailTimelineItems}
          />
        </div>

        <div className="flex flex-col gap-6">
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

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                Email outreach
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ContactEmailLauncher
                contactId={contact.id}
                contactName={contact.name}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                Email suppression
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SuppressionControl contactId={contact.id} email={contact.email} />
            </CardContent>
          </Card>
        </div>
      </div>

      <CollapsibleAiPanel
        contactId={contact.id}
        contactName={contact.name}
        initialThreads={initialContactThreads}
        providerAvailability={adminAiAvailability}
      />
    </div>
  );
}
