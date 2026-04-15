import { formatTimestamp } from "./dateFormat";

describe("formatTimestamp", () => {
  it("returns — for null", () => {
    expect(formatTimestamp(null)).toBe("—");
  });

  it("returns — for undefined", () => {
    expect(formatTimestamp(undefined)).toBe("—");
  });

  it("returns — for empty string", () => {
    expect(formatTimestamp("")).toBe("—");
  });

  it("returns formatted string for valid ISO date string", () => {
    const isoString = "2024-01-15T10:30:00.000Z";
    const result = formatTimestamp(isoString);
    expect(typeof result).toBe("string");
    expect(result).not.toBe("—");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns formatted string for valid date string", () => {
    const dateString = "Mon Jan 15 2024 10:30:00";
    const result = formatTimestamp(dateString);
    expect(typeof result).toBe("string");
    expect(result).not.toBe("—");
  });

  it("returns the value as string for invalid date strings", () => {
    const invalid = "not-a-date-at-all";
    const result = formatTimestamp(invalid);
    expect(result).toBe(String(invalid));
  });

  it("handles numeric timestamps", () => {
    const ts = 1705312200000;
    const result = formatTimestamp(ts);
    expect(typeof result).toBe("string");
    expect(result).not.toBe("—");
  });
});
