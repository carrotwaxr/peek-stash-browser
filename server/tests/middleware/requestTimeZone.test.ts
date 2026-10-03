/**
 * The viewer's time zone, from the `X-Peek-Time-Zone` header every API
 * request carries (the device's IANA zone): a missing or unknown zone is
 * UTC, so a request from a client that sends none (today's) reads its days
 * in UTC.
 */
import { describe, expect, it, vi } from "vitest";
import { requestTimeZone } from "../../middleware/requestTimeZone.js";
import type { TypedLibraryRequest } from "../../types/api/express.js";
import { reqFor, resFor } from "../helpers/controllerTestUtils.js";

function zoneFor(headers: Record<string, string>): string | undefined {
  const req = reqFor(requestTimeZone, { headers });
  const next = vi.fn<() => void>();
  requestTimeZone(req, resFor(requestTimeZone), next);
  expect(next).toHaveBeenCalledOnce();
  return (req as Partial<TypedLibraryRequest>).timeZone;
}

describe("requestTimeZone", () => {
  it("header absent gives UTC", () => {
    expect(zoneFor({})).toBe("UTC");
  });

  it('"Not/AZone" gives UTC', () => {
    expect(zoneFor({ "X-Peek-Time-Zone": "Not/AZone" })).toBe("UTC");
  });

  it("a value over 64 characters gives UTC", () => {
    expect(zoneFor({ "X-Peek-Time-Zone": `America/${"x".repeat(60)}` })).toBe(
      "UTC"
    );
  });

  it('"America/Chicago" is kept', () => {
    expect(zoneFor({ "X-Peek-Time-Zone": "America/Chicago" })).toBe(
      "America/Chicago"
    );
  });

  it('"america/chicago" is its canonical name, "America/Chicago"', () => {
    expect(zoneFor({ "X-Peek-Time-Zone": "america/chicago" })).toBe(
      "America/Chicago"
    );
  });

  it("an invalid zone in any case gives UTC", () => {
    expect(zoneFor({ "X-Peek-Time-Zone": "NOT/AZONE" })).toBe("UTC");
  });
});
