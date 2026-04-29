import type { EmailAsset } from "@/types/database";

export const DESIGNER_BRAND = {
  accentColor: "#0f8fb8",
  darkColor: "#101820",
  mutedColor: "#64748b",
  canvasColor: "#ffffff",
  backdropColor: "#f3f8fa",
  fontFamily: "Inter, Arial, sans-serif",
};

export const DEFAULT_DESIGNER_MJML = `<mjml>
  <mj-head>
    <mj-font name="Inter" href="https://fonts.googleapis.com/css?family=Inter:400,500,600,700" />
    <mj-attributes>
      <mj-all font-family="${DESIGNER_BRAND.fontFamily}" />
      <mj-text color="${DESIGNER_BRAND.darkColor}" font-size="16px" line-height="1.6" />
      <mj-button background-color="${DESIGNER_BRAND.accentColor}" color="#ffffff" border-radius="4px" font-weight="600" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="${DESIGNER_BRAND.backdropColor}" width="640px">
    ${buildBrandHeaderMjml()}
    <mj-section background-color="${DESIGNER_BRAND.canvasColor}" padding="28px 32px 12px">
      <mj-column>
        <mj-text font-size="24px" font-weight="700" line-height="1.3">Hello {{ contact.name }}</mj-text>
        <mj-text>Use this space to write a visually polished update, invitation, or outreach message.</mj-text>
        <mj-button href="https://behind-the-mask.com" align="left">View details</mj-button>
      </mj-column>
    </mj-section>
    ${buildBrandFooterMjml()}
  </mj-body>
</mjml>`;

export function buildBrandHeaderMjml() {
  return `<mj-section background-color="${DESIGNER_BRAND.darkColor}" padding="24px 32px">
    <mj-column>
      <mj-text color="#ffffff" font-size="22px" font-weight="700" letter-spacing="1px">Behind The Mask</mj-text>
      <mj-text color="#b7dce8" font-size="13px" padding-top="0">Ocean stories, education, and community</mj-text>
    </mj-column>
  </mj-section>`;
}

export function buildHeroMjml() {
  return `<mj-hero mode="fluid-height" height="260px" background-width="640px" background-height="260px" background-color="${DESIGNER_BRAND.darkColor}" padding="56px 32px">
    <mj-text color="#ffffff" font-size="28px" font-weight="700" line-height="1.25" align="center">A new Behind The Mask update</mj-text>
    <mj-text color="#d7eef5" font-size="15px" align="center">Add a strong visual lead for campaigns, announcements, or personal outreach.</mj-text>
  </mj-hero>`;
}

export function buildTextBlockMjml() {
  return `<mj-section background-color="${DESIGNER_BRAND.canvasColor}" padding="20px 32px">
    <mj-column>
      <mj-text>Write a focused paragraph here. You can use personalization like {{ contact.name }} when it helps the message feel direct.</mj-text>
    </mj-column>
  </mj-section>`;
}

export function buildButtonBlockMjml() {
  return `<mj-section background-color="${DESIGNER_BRAND.canvasColor}" padding="8px 32px 24px">
    <mj-column>
      <mj-button href="https://behind-the-mask.com" align="left">Open link</mj-button>
    </mj-column>
  </mj-section>`;
}

export function buildDividerBlockMjml() {
  return `<mj-section background-color="${DESIGNER_BRAND.canvasColor}" padding="8px 32px">
    <mj-column>
      <mj-divider border-color="#d9e7ec" border-width="1px" />
    </mj-column>
  </mj-section>`;
}

export function buildBrandFooterMjml() {
  return `<mj-section background-color="#e8f2f5" padding="22px 32px">
    <mj-column>
      <mj-text color="${DESIGNER_BRAND.mutedColor}" font-size="12px" line-height="1.5">
        You are receiving this email because you are connected with Behind The Mask.
      </mj-text>
      <mj-text color="${DESIGNER_BRAND.mutedColor}" font-size="12px" padding-top="0">
        Behind The Mask · Ocean community and education
      </mj-text>
    </mj-column>
  </mj-section>`;
}

export function buildAssetImageBlockMjml(asset: EmailAsset) {
  return `<mj-section background-color="${DESIGNER_BRAND.canvasColor}" padding="18px 32px">
    <mj-column>
      <mj-image src="${asset.public_url}" alt="${asset.original_filename}" fluid-on-mobile="true" padding="0" />
    </mj-column>
  </mj-section>`;
}

export function normalizeGrapesMjml(value: string) {
  let mjml = value.trim();
  const bodyMatch = mjml.match(/^<body[^>]*>([\s\S]*)<\/body>$/i);
  if (bodyMatch?.[1]) {
    mjml = bodyMatch[1].trim();
  }

  if (!/^<mjml[\s>]/i.test(mjml)) {
    mjml = `<mjml><mj-body>${mjml}</mj-body></mjml>`;
  }

  return mjml;
}

export function getAssetIdsForMjml(mjml: string, assets: EmailAsset[]) {
  const ids = new Set<string>();
  for (const asset of assets) {
    if (asset.public_url && mjml.includes(asset.public_url)) {
      ids.add(asset.id);
    }
  }
  return Array.from(ids);
}
