import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/data/profiles";
import { getContactDetailApplication } from "@/lib/data/contact-detail";
import { isUUID } from "@/lib/validation-helpers";
import {
  ApplicationPrintDocument,
  buildDocumentTitle,
} from "./application-print-document";
import { PrintTrigger } from "./print-trigger";

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

  const application = await getContactDetailApplication(id);
  if (!application) {
    notFound();
  }

  return (
    <>
      <PrintTrigger title={buildDocumentTitle(application)} />
      <ApplicationPrintDocument application={application} />
    </>
  );
}
