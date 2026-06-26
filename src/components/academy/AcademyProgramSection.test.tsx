import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/image", () => ({
  default: (props: { src?: string; alt?: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt ?? ""} className={props.className} />
  ),
}))

const { AcademyProgramSection } = await import("./AcademyProgramSection")

const base = {
  index: 0,
  name: "Photography",
  overline: "Mentorship programme",
  description: "Learn to capture life beneath the surface.",
  highlights: [
    "One-to-one mentorship",
    "Underwater lighting",
    "Publish-ready portfolio",
  ],
  applyHref: "/academy/photography/apply",
  detailHref: "/academy/photography",
  isOpen: true,
  heroImage: null,
  placeholderImage: "/images/home/film-3.jpg",
}

describe("AcademyProgramSection", () => {
  it("renders the programme pitch with apply + learn-more CTAs", () => {
    const html = renderToStaticMarkup(<AcademyProgramSection {...base} />)

    expect(html).toContain("Photography")
    expect(html).toContain("Mentorship programme")
    expect(html).toContain("One-to-one mentorship")
    expect(html).toContain('href="/academy/photography/apply"')
    expect(html).toContain('href="/academy/photography"')
    expect(html).toContain("Learn more")
    expect(html).not.toContain("Applications closed")
  })

  it("falls back to the placeholder image when there is no Sanity hero image", () => {
    const html = renderToStaticMarkup(<AcademyProgramSection {...base} />)
    expect(html).toContain("/images/home/film-3.jpg")
  })

  it("shows 'Applications closed' (no apply link) when the programme is closed", () => {
    const html = renderToStaticMarkup(
      <AcademyProgramSection {...base} isOpen={false} />,
    )
    expect(html).toContain("Applications closed")
    expect(html).not.toContain('href="/academy/photography/apply"')
  })

  it("puts the image first on even rows and mirrors it on odd rows", () => {
    const even = renderToStaticMarkup(<AcademyProgramSection {...base} index={0} />)
    const odd = renderToStaticMarkup(<AcademyProgramSection {...base} index={1} />)

    expect(even).toContain("relative md:order-1")
    expect(odd).toContain("relative md:order-2")
  })
})
