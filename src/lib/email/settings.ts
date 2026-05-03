export function getEmailFromEmail(): string {
  return (
    process.env.EMAIL_FROM_EMAIL?.trim() ||
    process.env.BREVO_FROM_EMAIL?.trim() ||
    "owner@behind-the-mask.com"
  );
}

export function getEmailFromName(): string {
  return process.env.EMAIL_FROM_NAME?.trim() || "Behind The Mask";
}

export function getEmailReplyToEmail(): string {
  return (
    process.env.EMAIL_REPLY_TO_EMAIL?.trim() ||
    process.env.OWNER_EMAIL_FORWARD_TO?.trim() ||
    getEmailFromEmail()
  );
}

export type EmailProviderName = "brevo" | "fake";

function isProductionDeployment(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.EMAIL_REQUIRE_REAL_PROVIDER === "true"
  );
}

export function getEmailProviderName(): EmailProviderName {
  const provider = process.env.EMAIL_PROVIDER?.trim();
  if (!provider) {
    throw new Error("EMAIL_PROVIDER must be set before sending email");
  }
  if (provider !== "brevo" && provider !== "fake") {
    throw new Error(`Unsupported email provider: ${provider}`);
  }
  if (provider === "fake" && isProductionDeployment()) {
    throw new Error("EMAIL_PROVIDER=fake is not allowed in production");
  }
  return provider;
}

export function getEmailWorkerSecret(): string | null {
  return process.env.EMAIL_WORKER_SECRET?.trim() || null;
}

export function getBrevoWebhookToken(): string | null {
  return process.env.BREVO_WEBHOOK_TOKEN?.trim() || null;
}

function normalizeOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getPublicSiteUrl(): string {
  return normalizeOrigin(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      process.env.VERCEL_URL ||
      "http://localhost:3000",
  );
}

export function getEmailWorkerOrigin(): string {
  return normalizeOrigin(
    process.env.EMAIL_WORKER_ORIGIN ||
      process.env.VERCEL_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      "http://localhost:3000",
  );
}
