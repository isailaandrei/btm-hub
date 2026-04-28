"use client";

import type { EmailCampaignRecipient } from "@/types/database";

interface CampaignReportProps {
  recipients: EmailCampaignRecipient[];
}

export function CampaignReport({ recipients }: CampaignReportProps) {
  if (recipients.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
        No recipient activity yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border bg-muted/60 uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Recipient</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Sent</th>
            <th className="px-3 py-2 font-medium">Opened</th>
            <th className="px-3 py-2 font-medium">Clicked</th>
            <th className="px-3 py-2 font-medium">Replied</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {recipients.map((recipient) => (
            <tr key={recipient.id} className="hover:bg-muted/40">
              <td className="px-3 py-2 text-foreground">{recipient.email}</td>
              <td className="px-3 py-2 text-muted-foreground">{recipient.status}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {recipient.sent_at ? "Yes" : "No"}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {recipient.opened_at ? "Yes" : "No"}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {recipient.clicked_at ? "Yes" : "No"}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {recipient.replied_at ? "Yes" : "No"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
