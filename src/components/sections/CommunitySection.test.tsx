import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mockGetForumTopics = vi.fn();

vi.mock("@/lib/data/forum", () => ({
  getForumTopics: mockGetForumTopics,
}));

const { CommunitySection } = await import("./CommunitySection");

describe("CommunitySection", () => {
  it("uses static homepage labels instead of querying forum topics", () => {
    const html = renderToStaticMarkup(<CommunitySection />);

    expect(mockGetForumTopics).not.toHaveBeenCalled();
    expect(html).toContain("Trip Reports");
    expect(html).toContain("Gear Talk");
    expect(html).toContain("Ask the Community");
  });
});
