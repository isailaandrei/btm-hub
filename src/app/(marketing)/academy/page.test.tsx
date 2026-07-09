import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/academy/AcademyPanels", () => ({
  AcademyPanels: ({
    panels,
  }: {
    panels: Array<{ slug: string; href: string }>
  }) => (
    <div data-testid="academy-panels" data-count={panels.length}>
      {panels.map((panel) => (
        <a key={panel.slug} data-testid="academy-panel" data-href={panel.href} />
      ))}
    </div>
  ),
}))
vi.mock("@/components/academy/AcademyCTABand", () => ({
  AcademyCTABand: () => <div data-testid="academy-cta" />,
}))
vi.mock("@/components/academy/AcademyProgramSection", () => ({
  AcademyProgramSection: ({
    name,
    slug,
    applyHref,
  }: {
    name: string
    slug: string
    applyHref: string
  }) => (
    <div
      data-testid="academy-program"
      data-name={name}
      data-slug={slug}
      data-apply={applyHref}
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

const { default: AcademyPage } = await import("./page")

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
})
