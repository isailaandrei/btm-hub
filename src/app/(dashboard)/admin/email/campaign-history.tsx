"use client";

import type { EmailCampaign } from "@/types/database";

interface CampaignHistoryProps {
  campaigns: EmailCampaign[];
}

export function CampaignHistory({ campaigns }: CampaignHistoryProps) {
  if (campaigns.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
        No campaigns yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/60 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Kind</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Sent</th>
            <th className="px-3 py-2 font-medium">Clicks</th>
            <th className="px-3 py-2 font-medium">Replies</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {campaigns.map((campaign) => (
            <tr key={campaign.id} className="hover:bg-muted/40">
              <td className="px-3 py-2 font-medium text-foreground">
                {campaign.name}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{campaign.kind}</td>
              <td className="px-3 py-2 text-muted-foreground">{campaign.status}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {campaign.sent_count}/{campaign.recipient_count}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {campaign.clicked_count}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {campaign.replied_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
