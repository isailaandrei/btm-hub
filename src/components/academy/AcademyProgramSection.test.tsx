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
  slug: "photography",
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
  applyLabel: "Apply",
  image: null,
}

const cmsImage = {
  _type: "image" as const,
  asset: { _ref: "image-abc123-2000x2500-jpg", _type: "reference" as const },
}

describe("AcademyProgramSection", () => {
  it("renders the programme pitch with apply + learn-more CTAs", () => {
    const html = renderToStaticMarkup(<AcademyProgramSection {...base} />)

    expect(html).toContain('id="photography"')
    expect(html).toContain("Photography")
    expect(html).toContain("Mentorship programme")
    expect(html).toContain("One-to-one mentorship")
    expect(html).toContain('href="/academy/photography/apply"')
    expect(html).toContain('href="/academy/photography"')
    expect(html).toContain("Learn more")
    expect(html).not.toContain("Applications closed")
  })

  it("renders the Sanity image (from the CDN) in a two-column layout", () => {
    const html = renderToStaticMarkup(
      <AcademyProgramSection {...base} image={cmsImage} />,
    )
    expect(html).toContain("cdn.sanity.io")
    // The photo cell + its two-column grid are present when an image is set.
    expect(html).toContain("md:grid-cols-2")
    expect(html).toContain("aspect-[4/5]")
  })

  it("collapses to a single full-width text column when no image is set", () => {
    const html = renderToStaticMarkup(<AcademyProgramSection {...base} />)
    // No photo cell and no two-column grid — the text spans the full width.
    expect(html).not.toContain("md:grid-cols-2")
    expect(html).not.toContain("aspect-[4/5]")
    expect(html).not.toContain("cdn.sanity.io")
  })

  it("omits copy fields that are cleared (no baked-in fallback text)", () => {
    const html = renderToStaticMarkup(
      <AcademyProgramSection
        {...base}
        name={undefined}
        overline={undefined}
        description={undefined}
        highlights={[]}
      />,
    )

    expect(html).not.toContain("Photography")
    expect(html).not.toContain("Mentorship programme")
    expect(html).not.toContain("Learn to capture life beneath the surface.")
    expect(html).not.toContain("<ul")
    // Structural controls survive the empty content state.
    expect(html).toContain('id="photography"')
    expect(html).toContain('href="/academy/photography/apply"')
    expect(html).toContain("Learn more")
  })

  it("uses the editable Apply-button label", () => {
    const html = renderToStaticMarkup(
      <AcademyProgramSection {...base} applyLabel="Start your application" />,
    )
    expect(html).toContain("Start your application")
    expect(html).toContain('href="/academy/photography/apply"')
  })

  it("shows 'Applications closed' (no apply link) when the programme is closed", () => {
    const html = renderToStaticMarkup(
      <AcademyProgramSection {...base} isOpen={false} />,
    )
    expect(html).toContain("Applications closed")
    expect(html).not.toContain('href="/academy/photography/apply"')
  })

  it("puts the image first on even rows and mirrors it on odd rows", () => {
    const even = renderToStaticMarkup(
      <AcademyProgramSection {...base} index={0} image={cmsImage} />,
    )
    const odd = renderToStaticMarkup(
      <AcademyProgramSection {...base} index={1} image={cmsImage} />,
    )

    expect(even).toContain("relative md:order-1")
    expect(odd).toContain("relative md:order-2")
  })
})
