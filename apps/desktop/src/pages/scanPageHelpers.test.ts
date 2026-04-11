import { describe, expect, it } from "vitest";
import { formatScanDuration } from "./scanPageHelpers";

describe("formatScanDuration", () => {
  it("returns 'In progress' for null", () => {
    expect(formatScanDuration(null)).toBe("In progress");
  });

  it("returns 'In progress' for undefined", () => {
    expect(formatScanDuration(undefined)).toBe("In progress");
  });

  it("returns 'In progress' for negative values", () => {
    expect(formatScanDuration(-1)).toBe("In progress");
  });

  it("returns '< 1 sec' for 0 ms (sub-second scan)", () => {
    expect(formatScanDuration(0)).toBe("< 1 sec");
  });

  it("returns '< 1 sec' for any value that rounds to 0 seconds", () => {
    expect(formatScanDuration(1)).toBe("< 1 sec");
    expect(formatScanDuration(499)).toBe("< 1 sec");
  });

  it("returns seconds for values under 60 seconds", () => {
    expect(formatScanDuration(1000)).toBe("1 sec");
    expect(formatScanDuration(30000)).toBe("30 sec");
    expect(formatScanDuration(59000)).toBe("59 sec");
  });

  it("returns minutes only when seconds remainder is 0", () => {
    expect(formatScanDuration(60000)).toBe("1 min");
    expect(formatScanDuration(120000)).toBe("2 min");
  });

  it("returns minutes and seconds when remainder exists", () => {
    expect(formatScanDuration(90000)).toBe("1 min 30 sec");
    expect(formatScanDuration(150000)).toBe("2 min 30 sec");
  });
});
