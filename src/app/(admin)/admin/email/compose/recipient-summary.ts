import type { EmailSendKind } from "@/types/database";

export function getRecipientSummary(input: {
  kind: EmailSendKind;
  selectedContactCount: number;
}): { headline: string; detail: string } {
  if (input.kind === "broadcast") {
    return {
      headline: "All contacts with email",
      detail: "Broadcast skips newsletter unsubscribes and suppressed addresses.",
    };
  }

  return {
    headline: `${input.selectedContactCount} selected contact${
      input.selectedContactCount === 1 ? "" : "s"
    }`,
    detail: "Outreach sends to selected contacts unless they are suppressed.",
  };
}
