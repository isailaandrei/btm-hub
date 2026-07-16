import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { AcademyPanel } from "./AcademyPanels"

vi.mock("next/image", () => ({
  default: (props: { src?: string; alt?: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt ?? ""} className={props.className} />
  ),
}))

const { AcademyPanels } = await import("./AcademyPanels")

const cmsImage = {
  _type: "image" as const,
  asset: { _ref: "image-panelcms-2000x2500-jpg", _type: "reference" as const },
}

const basePanel: AcademyPanel = {
  slug: "photography",
  name: "Photography",
  tag: "Shoot beneath the surface",
  href: "/academy/photography",
  isOpen: true,
}

describe("AcademyPanels", () => {
  it("renders the panel name, tag, link and enrolling marker", () => {
    const html = renderToStaticMarkup(<AcademyPanels panels={[basePanel]} />)

    expect(html).toContain("Photography")
    expect(html).toContain("Shoot beneath the surface")
    expect(html).toContain('href="/academy/photography"')
    expect(html).toContain("Now enrolling")
    // No image set → the dark tile shows through, no photo of any kind.
    expect(html).not.toContain("cdn.sanity.io")
    expect(html).not.toContain("/images/academy/photography.jpg")
  })

  it("renders the Sanity image (from the CDN) when a panel image is set", () => {
    const html = renderToStaticMarkup(
      <AcademyPanels panels={[{ ...basePanel, image: cmsImage }]} />,
    )

    expect(html).toContain("cdn.sanity.io")
  })

  it("renders the hero eyebrow + heading when provided", () => {
    const html = renderToStaticMarkup(
      <AcademyPanels
        panels={[basePanel]}
        eyebrow="Behind the Mask Academy"
        heading="Four ways to create"
      />,
    )

    expect(html).toContain("Behind the Mask Academy")
    expect(html).toContain("Four ways to create")
  })

  it("omits the eyebrow, heading, name and tag when cleared", () => {
    const html = renderToStaticMarkup(
      <AcademyPanels
        panels={[{ ...basePanel, name: null, tag: null }]}
      />,
    )

    expect(html).not.toContain("Behind the Mask Academy")
    expect(html).not.toContain("Photography")
    expect(html).not.toContain("Shoot beneath the surface")
    // The structural chrome — the link and the "Explore" affordance — remains.
    expect(html).toContain('href="/academy/photography"')
    expect(html).toContain("Explore")
  })
})
