"use client";

interface CampaignPreviewProps {
  eligibleCount: number;
  skipped: Array<{
    contactId: string;
    email: string;
    name: string;
    reason: string;
  }>;
}

const REASON_LABELS: Record<string, string> = {
  missing_email: "Missing email",
  newsletter_unsubscribed: "Newsletter unsubscribed",
  suppressed: "Suppressed",
};

export function CampaignPreview({ eligibleCount, skipped }: CampaignPreviewProps) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">Preview</span>
        <span className="text-sm text-muted-foreground">
          {eligibleCount} eligible, {skipped.length} skipped
        </span>
      </div>

      {skipped.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-md border border-border bg-background">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {skipped.map((item) => (
                <tr key={`${item.contactId}-${item.reason}`}>
                  <td className="px-3 py-2 text-foreground">{item.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.email}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {REASON_LABELS[item.reason] ?? item.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
