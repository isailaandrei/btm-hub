import { describe, it, expect } from "vitest";
import { projectId, dataset, apiVersion } from "./env";

describe("sanity env", () => {
  it("exports projectId from env", () => {
    expect(projectId).toBe("test-project");
  });

  it("exports dataset from env", () => {
    expect(dataset).toBe("test");
  });

  it("exports a valid API version string", () => {
    expect(apiVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
