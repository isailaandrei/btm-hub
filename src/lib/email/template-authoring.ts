import { listEmailAssetIdsByPublicUrls } from "@/lib/data/email-assets";
import {
  createEmailTemplate,
  createEmailTemplateVersion,
  findTemplateVersionIdByContentHash,
} from "@/lib/data/email-templates";
import { validateUUID } from "@/lib/validation-helpers";
import type { EmailTemplateVersion } from "@/types/database";
import { computeMailyContentHash } from "./content-hash";
import {
  assertMailyDocument,
  getAssetIdsForMailyDocument,
  getAssetPublicUrlsForMailyDocument,
  renderMailyDocument,
  type MailyDocument,
} from "./rendering/maily";

/** Default template name to fall back to when a subject is empty. */
const FALLBACK_TEMPLATE_NAME = "Untitled email";
const MAX_TEMPLATE_NAME_LENGTH = 120;

/**
 * Derive a template name from an email subject. Subjects can contain variable
 * placeholders (e.g. "Hello {{contact.name}}") and may exceed the template name
 * length cap, so trim and clamp; admins can rename later.
 */
export function templateNameFromSubject(subject: string): string {
  const trimmed = subject.trim();
  if (!trimmed) return FALLBACK_TEMPLATE_NAME;
  return trimmed.length > MAX_TEMPLATE_NAME_LENGTH
    ? trimmed.slice(0, MAX_TEMPLATE_NAME_LENGTH)
    : trimmed;
}

/**
 * Render a Maily document and resolve its asset references the same way for
 * every template version we create (manual publishes and auto-saved sends), so
 * the stored html/text/asset_ids/content_hash stay consistent.
 */
async function buildVersionPayload(
  document: MailyDocument,
  precomputedContentHash?: string,
) {
  const explicitAssetIds = getAssetIdsForMailyDocument(document);
  const uploadedAssetIds = await listEmailAssetIdsByPublicUrls(
    getAssetPublicUrlsForMailyDocument(document),
  );
  const assetIds = [...new Set([...explicitAssetIds, ...uploadedAssetIds])];
  for (const assetId of assetIds) validateUUID(assetId, "asset");

  const rendered = await renderMailyDocument(document);

  return {
    builderJson: document as Record<string, unknown>,
    html: rendered.html,
    text: rendered.text,
    assetIds,
    contentHash: precomputedContentHash ?? computeMailyContentHash(document),
  };
}

/**
 * Create a new version of an existing template from a Maily document, recording
 * its content hash. Used by the manual "publish" path.
 */
export async function createTemplateVersionFromDocument(input: {
  templateId: string;
  builderJson: unknown;
}): Promise<EmailTemplateVersion> {
  validateUUID(input.templateId, "template");
  const document = assertMailyDocument(input.builderJson);
  const payload = await buildVersionPayload(document);
  return createEmailTemplateVersion({
    templateId: input.templateId,
    builderJson: payload.builderJson,
    html: payload.html,
    text: payload.text,
    assetIds: payload.assetIds,
    contentHash: payload.contentHash,
  });
}

/**
 * Find a non-archived template whose content matches the given document, or
 * create a new published template for it. This is the dedup gate behind
 * auto-save-on-send: identical content reuses the existing template version,
 * distinct content creates a new template named from the subject.
 *
 * Returns the resolved template version id plus whether a template was created.
 */
export async function findOrCreateTemplateForDocument(input: {
  builderJson: unknown;
  subject: string;
}): Promise<{ templateVersionId: string; created: boolean }> {
  const document = assertMailyDocument(input.builderJson);
  const contentHash = computeMailyContentHash(document);

  const existingId = await findTemplateVersionIdByContentHash(contentHash);
  if (existingId) {
    return { templateVersionId: existingId, created: false };
  }

  const template = await createEmailTemplate({
    name: templateNameFromSubject(input.subject),
    category: "general",
  });
  const payload = await buildVersionPayload(document, contentHash);
  const version = await createEmailTemplateVersion({
    templateId: template.id,
    builderJson: payload.builderJson,
    html: payload.html,
    text: payload.text,
    assetIds: payload.assetIds,
    contentHash: payload.contentHash,
  });

  return { templateVersionId: version.id, created: true };
}
