import { authorizeCronRequest } from "@/lib/cron-auth";
import { reconcileOrphanEmailEvents } from "@/lib/data/email-sends";

export const maxDuration = 60;

// Backstop sweep. Re-links and re-applies any provider events that landed
// without a recipient (the delivered-webhook race, or a transient lookup
// failure). With the metadata-first webhook handler this should normally find
// nothing — it exists so a slipped event can never silently under-report a
// recipient's delivered/opened/clicked state.
export async function GET(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const reconciled = await reconcileOrphanEmailEvents(500);
  return Response.json({ ok: true, reconciled });
}
