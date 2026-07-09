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
  fallbackImage: "/images/academy/photography.jpg",
  href: "/academy/photography",
  isOpen: true,
}

describe("AcademyPanels", () => {
  it("renders the shipped local image when no Sanity panel image is set", () => {
    const html = renderToStaticMarkup(<AcademyPanels panels={[basePanel]} />)

    expect(html).toContain("Photography")
    expect(html).toContain("Shoot beneath the surface")
    expect(html).toContain('href="/academy/photography"')
    expect(html).toContain("/images/academy/photography.jpg")
    expect(html).not.toContain("cdn.sanity.io")
    expect(html).toContain("Now enrolling")
  })

  it("renders the Sanity image (from the CDN) when a panel image is set", () => {
    const html = renderToStaticMarkup(
      <AcademyPanels panels={[{ ...basePanel, image: cmsImage }]} />,
    )

    expect(html).toContain("cdn.sanity.io")
    expect(html).not.toContain("/images/academy/photography.jpg")
  })
})
