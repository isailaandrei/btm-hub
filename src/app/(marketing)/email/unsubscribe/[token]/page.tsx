import Link from "next/link";
import { confirmNewsletterUnsubscribeAction } from "./actions";

export default async function NewsletterUnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ status?: string }>;
}) {
  const { token } = await params;
  const status = (await searchParams)?.status;
  const confirmed = status === "confirmed";
  const notFound = status === "not-found";

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold text-foreground">
        {confirmed
          ? "Newsletter unsubscribe confirmed"
          : notFound
            ? "Unsubscribe link not found"
            : "Unsubscribe from newsletters"}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {confirmed
          ? "This contact will no longer receive broadcast newsletters. Direct outreach can still be sent when appropriate."
          : notFound
            ? "This link may have already been used or may not belong to a valid email."
            : "Confirm that this contact should stop receiving broadcast newsletters from Behind The Mask."}
      </p>
      {!confirmed && !notFound ? (
        <form action={confirmNewsletterUnsubscribeAction} className="mt-6">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Unsubscribe
          </button>
        </form>
      ) : null}
      <Link
        href="/"
        className="mt-6 w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Back to website
      </Link>
    </main>
  );
}
