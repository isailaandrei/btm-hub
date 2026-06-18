import type { EmailSuppressionReason } from "@/types/database";

/** Human label for why an address is on the exclusion list. */
export function formatSuppressionReason(reason: EmailSuppressionReason): string {
  switch (reason) {
    case "unsubscribe":
      return "Unsubscribed";
    case "hard_bounce":
      return "Bounced";
    case "spam_complaint":
      return "Spam complaint";
    case "invalid_address":
      return "Invalid address";
    case "manual":
    case "do_not_contact":
      return "Manually excluded";
    default:
      return reason;
  }
}

/** Where the exclusion came from, for the Excluded list's source column. */
export function formatSuppressionSource(input: {
  reason: EmailSuppressionReason;
  provider: string | null;
}): string {
  if (input.provider === "brevo") return "Brevo";
  if (input.provider) return input.provider;
  if (input.reason === "unsubscribe") return "Unsubscribe link";
  return "Admin";
}
