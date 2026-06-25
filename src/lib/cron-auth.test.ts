import { afterEach, describe, expect, it } from "vitest";
import { authorizeCronRequest } from "./cron-auth";

const original = process.env.CRON_SECRET;
afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

describe("authorizeCronRequest", () => {
  it("returns 500 when CRON_SECRET is not configured", () => {
    delete process.env.CRON_SECRET;
    const res = authorizeCronRequest(new Request("http://x/cron"));
    expect(res?.status).toBe(500);
  });

  it("returns 401 for a missing or wrong bearer token", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(authorizeCronRequest(new Request("http://x/cron"))?.status).toBe(401);
    expect(
      authorizeCronRequest(
        new Request("http://x/cron", {
          headers: { authorization: "Bearer nope" },
        }),
      )?.status,
    ).toBe(401);
  });

  it("returns null (authorized) when the bearer token matches", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(
      authorizeCronRequest(
        new Request("http://x/cron", {
          headers: { authorization: "Bearer s3cret" },
        }),
      ),
    ).toBeNull();
  });
});
