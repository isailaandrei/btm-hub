import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/academy/AcademyHero", () => ({
  AcademyHero: () => <div data-testid="academy-hero" />,
}))
vi.mock("@/components/academy/AcademyCTABand", () => ({
  AcademyCTABand: () => <div data-testid="academy-cta" />,
}))
vi.mock("@/components/academy/AcademyProgramSection", () => ({
  AcademyProgramSection: ({
    name,
    applyHref,
  }: {
    name: string
    applyHref: string
  }) => <div data-testid="academy-program" data-name={name} data-apply={applyHref} />,
}))
vi.mock("@/components/home/reveal-on-scroll", () => ({
  RevealOnScroll: () => null,
}))
vi.mock("@/lib/data/sanity", () => ({
  getAllProgramsCms: vi.fn().mockResolvedValue([]),
}))

const { default: AcademyPage } = await import("./page")

describe("AcademyPage", () => {
  it("renders the cinematic dark page with hero, four programmes, and a closing CTA", async () => {
    const html = renderToStaticMarkup(await AcademyPage())

    expect(html).toContain("dark min-h-screen bg-[#020306] text-white")
    expect(html).toContain('id="programmes"')
    expect(html).toContain('data-testid="academy-hero"')
    expect(html).toContain('data-testid="academy-cta"')

    const programmeCount = (html.match(/data-testid="academy-program"/g) ?? [])
      .length
    expect(programmeCount).toBe(4)

    // Apply links are wired to each programme's apply route.
    expect(html).toContain('data-apply="/academy/photography/apply"')
    expect(html).toContain('data-apply="/academy/internship/apply"')
  })
})
