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

const copy = {
  heading: "Not sure which path is yours?",
  body: "Every programme is mentorship-based.",
  buttonLabel: "Get in touch",
}

describe("AcademyCTABand", () => {
  it("renders the heading, body and button when provided", () => {
    const html = renderToStaticMarkup(<AcademyCTABand {...copy} />)

    expect(html).toContain("Not sure which path is yours?")
    expect(html).toContain("Every programme is mentorship-based.")
    expect(html).toContain("Get in touch")
    expect(html).toContain('href="/contact"')
  })

  it("renders the Sanity background (from the CDN) when one is provided", () => {
    const html = renderToStaticMarkup(
      <AcademyCTABand {...copy} backgroundImage={cmsImage} />,
    )

    expect(html).toContain("cdn.sanity.io")
  })

  it("shows only the #020306 wash when no background image is set", () => {
    const html = renderToStaticMarkup(<AcademyCTABand {...copy} />)

    // No baked-in local fallback still — the wash carries the band alone.
    expect(html).not.toContain("cdn.sanity.io")
    expect(html).not.toContain("/images/academy/cta-wide.jpg")
    expect(html).toContain("bg-[#020306]/80")
  })

  it("omits the heading, body and button (with its link) when cleared", () => {
    const html = renderToStaticMarkup(<AcademyCTABand />)

    expect(html).not.toContain("Not sure which path is yours?")
    expect(html).not.toContain("Every programme is mentorship-based.")
    expect(html).not.toContain("Get in touch")
    // With no label there is no button — hence no /contact link either.
    expect(html).not.toContain('href="/contact"')
  })
})
