import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/image", () => ({
  default: (props: { src?: string; alt?: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt ?? ""} className={props.className} />
  ),
}))

const { AcademyCTABand } = await import("./AcademyCTABand")

const cmsImage = {
  _type: "image" as const,
  asset: { _ref: "image-ctacms-2400x1350-jpg", _type: "reference" as const },
}

describe("AcademyCTABand", () => {
  it("renders the shipped local background when no Sanity image is set", () => {
    const html = renderToStaticMarkup(<AcademyCTABand />)

    expect(html).toContain("Not sure which path is yours?")
    expect(html).toContain('href="/contact"')
    expect(html).toContain("/images/academy/cta-wide.jpg")
    expect(html).not.toContain("cdn.sanity.io")
  })

  it("renders the Sanity background (from the CDN) when one is provided", () => {
    const html = renderToStaticMarkup(
      <AcademyCTABand backgroundImage={cmsImage} />,
    )

    expect(html).toContain("cdn.sanity.io")
    expect(html).not.toContain("/images/academy/cta-wide.jpg")
  })
})
