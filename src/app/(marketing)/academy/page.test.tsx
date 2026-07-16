import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProgramCmsSummary, AcademyPageSettings } from "@/lib/data/sanity"

// The child components are exercised in their own tests; here we mock them to
// surface the props the page passes down, so we can assert the Sanity content
// flows through (and that cleared/undefined fields arrive as absent).
vi.mock("@/components/academy/AcademyPanels", () => ({
  AcademyPanels: ({
    panels,
    eyebrow,
    heading,
  }: {
    panels: Array<{ slug: string; href: string; name?: string | null; tag?: string | null }>
    eyebrow?: string | null
    heading?: string | null
  }) => (
    <div
      data-testid="academy-panels"
      data-count={panels.length}
      data-eyebrow={eyebrow ?? ""}
      data-heading={heading ?? ""}
    >
      {panels.map((panel) => (
        <a
          key={panel.slug}
          data-testid="academy-panel"
          data-href={panel.href}
          data-name={panel.name ?? ""}
          data-tag={panel.tag ?? ""}
        />
      ))}
    </div>
  ),
}))
vi.mock("@/components/academy/AcademyCTABand", () => ({
  AcademyCTABand: ({
    heading,
    body,
    buttonLabel,
  }: {
    heading?: string | null
    body?: string | null
    buttonLabel?: string | null
  }) => (
    <div
      data-testid="academy-cta"
      data-heading={heading ?? ""}
      data-body={body ?? ""}
      data-button={buttonLabel ?? ""}
    />
  ),
}))
vi.mock("@/components/academy/AcademyProgramSection", () => ({
  AcademyProgramSection: ({
    name,
    slug,
    applyHref,
    applyLabel,
    overline,
    description,
    highlights,
  }: {
    name?: string | null
    slug: string
    applyHref: string
    applyLabel: string
    overline?: string | null
    description?: string | null
    highlights: string[]
  }) => (
    <div
      data-testid="academy-program"
      data-name={name ?? ""}
      data-slug={slug}
      data-apply={applyHref}
      data-apply-label={applyLabel}
      data-overline={overline ?? ""}
      data-description={description ?? ""}
      data-highlights={highlights.length}
    />
  ),
}))
vi.mock("@/components/home/reveal-on-scroll", () => ({
  RevealOnScroll: () => null,
}))
vi.mock("@/lib/data/sanity", () => ({
  getAllProgramsCms: vi.fn().mockResolvedValue([]),
  getAcademyPageSettings: vi.fn().mockResolvedValue(null),
}))

import { getAllProgramsCms, getAcademyPageSettings } from "@/lib/data/sanity"
const { default: AcademyPage } = await import("./page")

const photographyCms = {
  _id: "program-photography",
  slug: "photography",
  name: "Photography",
  tag: "Shoot beneath the surface",
  overline: "Mentorship programme",
  description: "Learn to capture life beneath the surface.",
  highlights: ["One-to-one mentorship", "Underwater lighting", "Portfolio"],
  heroImage: null,
  panelImage: null,
  overviewImage: null,
  applicationOpen: true,
} satisfies ProgramCmsSummary

const settings = {
  heroEyebrow: "Behind the Mask Academy",
  heroHeading: "Four ways to create",
  ctaImage: null,
  ctaHeading: "Not sure which path is yours?",
  ctaBody: "Every programme is mentorship-based.",
  ctaButtonLabel: "Get in touch",
  detailApplyHeading: "Ready to join {name}?",
  detailApplyBody: "Send your application and we'll be in touch.",
  applyButtonLabel: "Start your application",
} satisfies AcademyPageSettings

beforeEach(() => {
  vi.mocked(getAllProgramsCms).mockResolvedValue([])
  vi.mocked(getAcademyPageSettings).mockResolvedValue(null)
})

describe("AcademyPage", () => {
  it("renders the cinematic dark page with a four-panel hero, four programmes, and a closing CTA", async () => {
    const html = renderToStaticMarkup(await AcademyPage())

    expect(html).toContain("dark min-h-screen bg-[#020306] text-white")
    expect(html).toContain('id="programmes"')
    expect(html).toContain('data-testid="academy-panels"')
    expect(html).toContain('data-testid="academy-cta"')

    // The hero surfaces all four programmes as panels linking to their pages.
    expect(html).toContain('data-count="4"')
    expect(html).toContain('data-href="/academy/photography"')
    expect(html).toContain('data-href="/academy/internship"')

    const programmeCount = (html.match(/data-testid="academy-program"/g) ?? [])
      .length
    expect(programmeCount).toBe(4)

    // Deep-dive sections carry the slug anchor + apply route for each programme.
    expect(html).toContain('data-slug="photography"')
    expect(html).toContain('data-apply="/academy/photography/apply"')
    expect(html).toContain('data-apply="/academy/internship/apply"')
  })

  it("passes the Sanity content down when the CMS provides it", async () => {
    vi.mocked(getAllProgramsCms).mockResolvedValue([photographyCms])
    vi.mocked(getAcademyPageSettings).mockResolvedValue(settings)

    const html = renderToStaticMarkup(await AcademyPage())

    // Hero + CTA chrome flows from academyPageSettings.
    expect(html).toContain('data-eyebrow="Behind the Mask Academy"')
    expect(html).toContain('data-heading="Four ways to create"')
    expect(html).toContain('data-heading="Not sure which path is yours?"')
    expect(html).toContain('data-body="Every programme is mentorship-based."')
    expect(html).toContain('data-button="Get in touch"')

    // Per-programme copy flows from the matching program doc (photography only).
    expect(html).toContain('data-name="Photography"')
    expect(html).toContain('data-tag="Shoot beneath the surface"')
    expect(html).toContain('data-overline="Mentorship programme"')
    expect(html).toContain(
      'data-description="Learn to capture life beneath the surface."',
    )
    expect(html).toContain('data-highlights="3"')

    // The site-wide editable Apply label flows to every programme section.
    expect(html).toContain('data-apply-label="Start your application"')
  })

  it("omits every content field when Sanity has none (cleared → absent, no crash)", async () => {
    // Defaults from beforeEach: no program docs, null settings.
    const html = renderToStaticMarkup(await AcademyPage())

    // Still structurally four panels + four programmes (the four are fixed).
    expect(html).toContain('data-count="4"')
    expect(
      (html.match(/data-testid="academy-program"/g) ?? []).length,
    ).toBe(4)

    // Every editable field arrives empty rather than a baked-in fallback.
    expect(html).toContain('data-eyebrow=""')
    expect(html).toContain('data-heading=""')
    expect(html).toContain('data-name=""')
    expect(html).toContain('data-tag=""')
    expect(html).toContain('data-overline=""')
    expect(html).toContain('data-description=""')
    expect(html).toContain('data-highlights="0"')
    expect(html).toContain('data-button=""')
    // The Apply button can't be blank — it defaults to "Apply" when unset.
    expect(html).toContain('data-apply-label="Apply"')
  })
})
