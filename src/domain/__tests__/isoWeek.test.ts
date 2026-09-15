import { describe, expect, it } from "vitest";
import { chicagoIsoWeek, isoWeekOf } from "../isoWeek";

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

describe("chicagoIsoWeek", () => {
  it("uses America/Chicago's calendar date, not UTC", () => {
    // Sunday 2026-09-13 23:30 Chicago is Monday 2026-09-14 04:30 UTC.
    const stillSunday = chicagoIsoWeek(new Date("2026-09-14T04:30:00Z"));
    expect(stillSunday.week).toBe("2026-W37");
    expect(stillSunday.weekOf).toBe("2026-09-07");
    const mondayChicago = chicagoIsoWeek(new Date("2026-09-14T05:30:00Z"));
    expect(mondayChicago.week).toBe("2026-W38");
    expect(mondayChicago.weekOf).toBe("2026-09-14");
  });
});
