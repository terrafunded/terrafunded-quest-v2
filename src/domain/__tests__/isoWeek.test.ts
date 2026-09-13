import { describe, expect, it } from "vitest";
import { isoWeekOf } from "../isoWeek";

describe("isoWeekOf", () => {
  it("puts a Thursday in the week that contains it, Monday-dated", () => {
    const w = isoWeekOf(new Date("2026-09-10T12:00:00Z")); // Thursday
    expect(w.week).toBe("2026-W37");
    expect(w.weekOf).toBe("2026-09-07");
    expect(w.weekNumber).toBe(37);
  });

  it("assigns 1 Jan 2027 (Friday) to week 53 of 2026", () => {
    const w = isoWeekOf(new Date("2027-01-01T00:00:00Z"));
    expect(w.week).toBe("2026-W53");
    expect(w.weekOf).toBe("2026-12-28");
  });
});
