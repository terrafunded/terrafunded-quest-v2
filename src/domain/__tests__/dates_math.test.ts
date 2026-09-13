import { describe, expect, it } from "vitest";
import { addMonths, daysBetween, monthKey, monthsBetween, parseDate, toIsoDate } from "../dates";
import { groupBy, indexBy, mean, median, round2, sum, toPercent } from "../math";

describe("dates", () => {
  it("parses dates and timestamps to UTC midnight", () => {
    expect(parseDate("2026-09-11")?.toISOString()).toBe("2026-09-11T00:00:00.000Z");
    expect(parseDate("2026-09-08T21:04:49.952507+00:00")?.toISOString()).toBe("2026-09-08T00:00:00.000Z");
    expect(parseDate(null)).toBeNull();
    expect(parseDate("nope")).toBeNull();
  });

  it("counts whole days and months", () => {
    const a = parseDate("2026-09-11")!;
    expect(daysBetween(a, parseDate("2027-12-31")!)).toBe(476);
    expect(daysBetween(parseDate("2027-12-31")!, a)).toBe(-476);
    expect(round2(monthsBetween(a, parseDate("2027-12-31")!))).toBe(15.64);
  });

  it("adds fractional months and buckets by month", () => {
    expect(toIsoDate(addMonths(parseDate("2026-01-31")!, 1))).toBe("2026-03-03");
    expect(toIsoDate(addMonths(parseDate("2026-09-11")!, 0.5))).toBe("2026-09-26");
    expect(monthKey(parseDate("2026-09-11")!)).toBe("2026-09");
  });
});

describe("math", () => {
  it("rounds to cents and sums nullable values", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(8986794.299999)).toBe(8986794.3);
    expect(sum([1, null, undefined, 2.5])).toBe(3.5);
  });

  it("mean and median handle empties", () => {
    expect(mean([])).toBeNull();
    expect(mean([2, 4])).toBe(3);
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("normalizes percents", () => {
    expect(toPercent(20)).toBe(20);
    expect(toPercent(0.0699)).toBeCloseTo(6.99);
    expect(toPercent(null)).toBe(0);
  });

  it("groups and indexes, skipping null keys", () => {
    const items = [{ k: "a", v: 1 }, { k: "a", v: 2 }, { k: null, v: 3 }];
    expect(groupBy(items, (i) => i.k).get("a")).toHaveLength(2);
    expect(groupBy(items, (i) => i.k).size).toBe(1);
    expect(indexBy(items, (i) => i.k).get("a")?.v).toBe(2);
  });
});
