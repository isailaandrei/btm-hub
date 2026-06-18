import { notFound } from "next/navigation";
import { validateUUID } from "@/lib/validation-helpers";
import { getContactDetailBootstrap } from "@/lib/data/contact-detail";
import { ContactDetailCacheSeeder } from "./contact-detail-cache-seeder";

/**
 * Deep-link / refresh entry point for a contact. The visible UI is rendered by
 * the client `ContactDetailPanel` in `AdminWorkspaceFrame`; this route only
 * fetches the bootstrap on the server and seeds it into the session cache (via
 * the embedded RSC payload) so the panel renders without an extra round-trip.
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

  const detail = await getContactDetailBootstrap(id);
  if (!detail) return notFound();

  return <ContactDetailCacheSeeder data={detail} />;
}
