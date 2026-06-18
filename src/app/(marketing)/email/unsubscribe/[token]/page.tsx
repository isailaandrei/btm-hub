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
          ? "You've been unsubscribed"
          : notFound
            ? "Unsubscribe link not found"
            : "Unsubscribe from all emails"}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {confirmed
          ? "You will no longer receive any emails from Behind The Mask."
          : notFound
            ? "This link may have already been used or may not belong to a valid email."
            : "Confirm that you want to stop receiving all emails from Behind The Mask."}
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
