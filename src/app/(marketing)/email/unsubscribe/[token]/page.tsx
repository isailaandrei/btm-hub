import Link from "next/link";
import { unsubscribeNewsletterByToken } from "@/lib/data/email-sends";

export default async function NewsletterUnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ok = await unsubscribeNewsletterByToken(token);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold text-foreground">
        {ok ? "Newsletter unsubscribe confirmed" : "Unsubscribe link not found"}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {ok
          ? "This contact will no longer receive broadcast newsletters. Direct outreach can still be sent when appropriate."
          : "This link may have already been used or may not belong to a valid email."}
      </p>
      <Link
        href="/"
        className="mt-6 w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Back to website
      </Link>
    </main>
  );
}
