import { createFakeEmailProvider } from "./fake";
import type { EmailProvider } from "./types";

export function getEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER?.trim() || "fake";
  if (provider === "fake") return createFakeEmailProvider();
  throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
}
