import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortfolioGallery } from "./portfolio-gallery";
import type { ProfilePortfolioItemWithUrl } from "@/types/database";

const baseItem: ProfilePortfolioItemWithUrl = {
  id: "item-1",
  profile_id: "profile-1",
  storage_path: "profile-1/file.jpg",
  original_filename: "file.jpg",
  mime_type: "image/jpeg",
  size_bytes: 123,
  title: "Reef wall",
  caption: "Coral wall",
  sort_order: 0,
  created_at: "2026-05-06T00:00:00.000Z",
  updated_at: "2026-05-06T00:00:00.000Z",
  signedUrl: "http://signed/file.jpg",
  imageError: null,
};

describe("PortfolioGallery", () => {
  it("renders signed thumbnails as in-app gallery controls", () => {
    const html = renderToStaticMarkup(
      <PortfolioGallery items={[baseItem]} compact />,
    );

    expect(html).toContain("Open Reef wall in gallery");
    expect(html).toContain("<button");
    expect(html).not.toContain('target="_blank"');
  });

  it("does not render a full-size link when an image is unavailable", () => {
    const html = renderToStaticMarkup(
      <PortfolioGallery
        items={[
          {
            ...baseItem,
            signedUrl: null,
            imageError: "Image unavailable",
          },
        ]}
        compact
      />,
    );

    expect(html).not.toContain('target="_blank"');
    expect(html).toContain("Image unavailable");
  });
});
