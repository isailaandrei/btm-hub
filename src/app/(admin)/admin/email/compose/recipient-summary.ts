import type { EmailSendKind } from "@/types/database";

export function getRecipientSummary(input: {
  kind: EmailSendKind;
  selectedContactCount: number;
  selectedManualRecipientCount: number;
}): { headline: string; detail: string } {
  if (input.kind === "broadcast") {
    return {
      headline: "All contacts with email",
      detail: "Broadcast skips newsletter unsubscribes and suppressed addresses.",
    };
  }

  const totalSelected =
    input.selectedContactCount + input.selectedManualRecipientCount;
  if (input.selectedManualRecipientCount > 0) {
    return {
      headline: `${totalSelected} selected recipient${
        totalSelected === 1 ? "" : "s"
      }`,
      detail:
        "Outreach sends to selected contacts and saved recipients unless they are suppressed.",
    };
  }

  return {
    headline: `${input.selectedContactCount} selected contact${
      input.selectedContactCount === 1 ? "" : "s"
    }`,
    detail: "Outreach sends to selected contacts unless they are suppressed.",
  };
}
