import Link from "next/link";
import { AlertCircle, MailCheck, MailX } from "lucide-react";
import { confirmNewsletterUnsubscribeAction } from "./actions";

const REASON_OPTIONS = [
  { value: "too_many", label: "Too many emails" },
  { value: "not_relevant", label: "The content isn't relevant to me" },
  { value: "never_signed_up", label: "I never signed up for this" },
  { value: "other", label: "Something else" },
];

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
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div
          className={`mx-auto mb-5 flex size-12 items-center justify-center rounded-full ${
            confirmed
              ? "bg-emerald-50 text-emerald-600"
              : notFound
                ? "bg-amber-50 text-amber-600"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {confirmed ? (
            <MailCheck className="size-6" />
          ) : notFound ? (
            <AlertCircle className="size-6" />
          ) : (
            <MailX className="size-6" />
          )}
        </div>

        <h1 className="text-center text-xl font-semibold text-foreground">
          {confirmed
            ? "You've been unsubscribed"
            : notFound
              ? "This link isn't valid"
              : "Unsubscribe from emails"}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-6 text-muted-foreground">
          {confirmed
            ? "You won't receive any more emails from Behind The Mask. Thanks for letting us know — if you change your mind, just reach out and we'll add you back."
            : notFound
              ? "This unsubscribe link may have already been used or no longer matches a valid email. If you keep receiving emails you don't want, reply to one and we'll sort it out."
              : "We're sorry to see you go. Confirm below to stop receiving all emails from Behind The Mask."}
        </p>

        {!confirmed && !notFound ? (
          <form
            action={confirmNewsletterUnsubscribeAction}
            className="mt-6 flex flex-col gap-4 text-left"
          >
            <input type="hidden" name="token" value={token} />

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Mind sharing why?{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </span>
              <select
                name="reason"
                defaultValue=""
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">Prefer not to say</option>
                {REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Anything else?{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </span>
              <textarea
                name="comment"
                rows={3}
                maxLength={500}
                placeholder="Your feedback helps us send better emails."
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>

            <button
              type="submit"
              className="mt-1 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Unsubscribe
            </button>
            <Link
              href="/"
              className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Never mind, keep me subscribed
            </Link>
          </form>
        ) : (
          <div className="mt-6 flex justify-center">
            <Link
              href="/"
              className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Back to website
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
