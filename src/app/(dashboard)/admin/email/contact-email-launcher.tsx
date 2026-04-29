"use client";

import Link from "next/link";
import { Mail } from "lucide-react";

interface ContactEmailLauncherProps {
  contactId: string;
  contactName: string;
}

export function ContactEmailLauncher({
  contactId,
  contactName,
}: ContactEmailLauncherProps) {
  const href = `/admin?tab=email&contacts=${encodeURIComponent(contactId)}`;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Start an outreach email to {contactName}.
      </p>
      <Link
        href={href}
        className="inline-flex w-fit items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        <Mail className="h-4 w-4" />
        Send email
      </Link>
    </div>
  );
}
