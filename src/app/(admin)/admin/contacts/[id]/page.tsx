import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { validateUUID } from "@/lib/validation-helpers";
import { getContactDetailBootstrap } from "@/lib/data/contact-detail";
import { getProfile } from "@/lib/data/profiles";
import { ApplicationCard } from "./application-card";
import { ContactTagsSection } from "./contact-tags-section";
import { ContactDetailRealtimeRefresh } from "./contact-detail-realtime-refresh";
import {
  PortfolioSection,
  PortfolioSectionSkeleton,
} from "./portfolio-section";
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

  const [detail, profile] = await Promise.all([
    getContactDetailBootstrap(id),
    getProfile(),
  ]);

  if (!detail) return notFound();

  const { applications, contact, events, hasMore, nextCursor } = detail;
  const authorName = profile?.display_name ?? profile?.email ?? "You";

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
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 flex flex-col gap-6">
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications yet.</p>
          ) : (
            applications.map((app) => (
              <ApplicationCard key={app.id} application={app} defaultOpen={false} />
            ))
          )}

          <Timeline
            key={`${contact.id}:${events.map((event) => event.id).join(",")}:${nextCursor ?? "end"}`}
            contactId={contact.id}
            events={events}
            hasMore={hasMore}
            nextCursor={nextCursor}
            authorName={authorName}
          />
        </div>

        <div className="min-w-0 flex flex-col gap-6">
          <ContactTagsSection contactId={contact.id} />

          <Suspense fallback={<PortfolioSectionSkeleton />}>
            <PortfolioSection profileId={contact.profile_id} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
