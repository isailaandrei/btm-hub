import { notFound } from "next/navigation";
import { validateUUID } from "@/lib/validation-helpers";
import { getContactDetailPageBootstrap } from "@/lib/data/contact-detail";
import { ContactDetailCacheSeeder } from "./contact-detail-cache-seeder";

/**
 * Deep-link / refresh entry point for a contact. The visible UI is rendered by
 * the client `ContactDetailPanel` in `AdminWorkspaceFrame`; this route only
 * fetches the page bootstrap on the server — the core detail PLUS the lazy
 * sections' data, in parallel — and seeds it into the session cache (via the
 * embedded RSC payload) so a cold open paints complete without the serial
 * chain of mount-time section actions (docs/plans/deep-link-batching.md).
 */
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

  const detail = await getContactDetailPageBootstrap(id);
  if (!detail) return notFound();

  return <ContactDetailCacheSeeder data={detail} />;
}
