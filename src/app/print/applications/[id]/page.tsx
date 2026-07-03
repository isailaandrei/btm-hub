import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/data/profiles";
import { getContactDetailApplication } from "@/lib/data/contact-detail";
import { isUUID } from "@/lib/validation-helpers";
import {
  ApplicationPrintDocument,
  buildDocumentTitle,
} from "./application-print-document";
import { PrintTrigger } from "./print-trigger";

// Deduped within a single request so generateMetadata and the page share one
// query instead of hitting the DB twice.
const loadApplication = cache((id: string) => getContactDetailApplication(id));

/**
 * Sets the document <title> on the server so the browser's "Save as PDF" dialog
 * pre-fills "<applicant> - BTM Application" as the filename. Setting
 * document.title imperatively on the client raced with Next's metadata system
 * and left the generic site title in place — driving it from metadata is the
 * race-free fix.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!isUUID(id)) return {};
  const application = await loadApplication(id);
  return application ? { title: buildDocumentTitle(application) } : {};
}

/**
 * Standalone, admin-only print view for a single application, opened in a new
 * tab from the contact detail card. It lives outside the `/admin` segment so it
 * renders without the persistent admin workspace shell — just the document —
 * which is what the browser's "Save as PDF" should capture.
 */
export default async function ApplicationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const { id } = await params;
  if (!isUUID(id)) {
    notFound();
  }

  const application = await loadApplication(id);
  if (!application) {
    notFound();
  }

  return (
    <>
      <PrintTrigger />
      <ApplicationPrintDocument application={application} />
    </>
  );
}
