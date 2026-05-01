import { describe, expect, it } from "vitest";
import { parseSocialLinkText } from "./social-links";

function linkHrefs(input: string): string[] {
  return parseSocialLinkText(input)
    .filter((part) => part.type === "link")
    .map((part) => part.href);
}

describe("parseSocialLinkText", () => {
  it("normalizes a bare Instagram handle when it is the whole field", () => {
    expect(linkHrefs("ocean_alice")).toEqual([
      "https://www.instagram.com/ocean_alice",
    ]);
  });

  it("normalizes at-mentions to Instagram links inside mixed text", () => {
    expect(linkHrefs("Instagram: @ocean.alice")).toEqual([
      "https://www.instagram.com/ocean.alice",
    ]);
  });

  it("normalizes handles after an Instagram cue", () => {
    expect(linkHrefs("IG: ocean.alice")).toEqual([
      "https://www.instagram.com/ocean.alice",
    ]);
  });

  it("normalizes Instagram URLs with or without protocol", () => {
    expect(linkHrefs("instagram.com/ocean_alice and https://www.instagram.com/btm/")).toEqual([
      "https://www.instagram.com/ocean_alice",
      "https://www.instagram.com/btm",
    ]);
  });

  it("links non-instagram URLs without assuming they are Instagram handles", () => {
    expect(linkHrefs("Portfolio: www.example.com and youtube.com/@ocean")).toEqual([
      "https://www.example.com",
      "https://youtube.com/@ocean",
    ]);
  });

  it("does not link arbitrary prose", () => {
    expect(parseSocialLinkText("I have a small page but no links yet")).toEqual([
      { type: "text", text: "I have a small page but no links yet" },
    ]);
  });
});
