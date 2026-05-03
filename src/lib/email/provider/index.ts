import { getEmailProviderName } from "../settings";
import { createBrevoEmailProvider } from "./brevo";
import { createFakeEmailProvider } from "./fake";
import type { EmailProvider } from "./types";

export function getEmailProvider(): EmailProvider {
  const provider = getEmailProviderName();
  if (provider === "brevo") return createBrevoEmailProvider();
  if (provider === "fake") return createFakeEmailProvider();
  throw new Error(`Unsupported email provider: ${provider}`);
}
