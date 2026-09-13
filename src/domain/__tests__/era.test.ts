import { describe, expect, it } from "vitest";
import { ERA_START } from "../../config/goal";
import { eraStartOf, inEra, resolveEra, trailingWindow, trailingWindowLabel, wholeMonthsBetween } from "../era";
import { ASOF } from "./builders";

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("the era: ERA_START and the windows measured from it", () => {
  it("is configured to March 2026 and resolves to 'since Mar 2026' with six whole months of history on the snapshot day", () => {
    expect(ERA_START).toBe("2026-03-01");
    const era = resolveEra(ASOF);
    expect(era).toMatchObject({ start: "2026-03-01", label: "Mar 2026", since: "since Mar 2026", monthsOfHistory: 6 });
    expect(era?.startDate.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("undefined takes the configured start, null switches the era off, and an era that has not begun does not apply", () => {
    expect(eraStartOf(undefined)).toBe(ERA_START);
    expect(eraStartOf(null)).toBeNull();
    expect(eraStartOf("2025-01-01")).toBe("2025-01-01");
    expect(resolveEra(ASOF, null)).toBeNull();
    expect(resolveEra(ASOF, "not a date")).toBeNull();
    expect(resolveEra(ASOF, "2027-01-01")).toBeNull();
    expect(resolveEra(utc("2026-03-01"))?.monthsOfHistory).toBe(0);
    expect(resolveEra(utc("2026-02-28"))).toBeNull();
  });

  it("counts whole calendar months, so twelve months of history arrive on the anniversary day and not the day before", () => {
    expect(wholeMonthsBetween(utc("2026-03-01"), utc("2026-09-11"))).toBe(6);
    expect(wholeMonthsBetween(utc("2026-03-01"), utc("2027-02-28"))).toBe(11);
    expect(wholeMonthsBetween(utc("2026-03-01"), utc("2027-03-01"))).toBe(12);
    expect(wholeMonthsBetween(utc("2026-03-31"), utc("2026-04-30"))).toBe(0);
    expect(wholeMonthsBetween(utc("2026-09-11"), utc("2026-03-01"))).toBe(0);
  });

  it("inEra keeps dates on or after the start and everything when there is no era", () => {
    const era = resolveEra(ASOF);
    expect(inEra("2026-03-01", era)).toBe(true);
    expect(inEra("2026-02-28", era)).toBe(false);
    expect(inEra(null, era)).toBe(false);
    expect(inEra("2025-01-01", null)).toBe(true);
  });

  it("a trailing window inside the era is untouched, one reaching back before it is clipped and divides by the days it really covers", () => {
    const ninety = trailingWindow(ASOF, 90);
    expect(ninety).toMatchObject({ days: 90, requestedDays: 90, eraClipped: false, since: "2026-06-14" });
    expect(trailingWindowLabel(ninety)).toBe("last 90 days");

    // Mar 1 through Sep 11 inclusive, the same convention as the 90-day window (Jun 14 through Sep 11)
    const year = trailingWindow(ASOF, 365);
    expect(year).toMatchObject({ days: 195, requestedDays: 365, eraClipped: true, since: "2026-03-01" });
    expect(year.from.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(trailingWindowLabel(year)).toBe("since Mar 2026 (195 days)");

    const early = trailingWindow(utc("2026-03-01"), 90);
    expect(early).toMatchObject({ days: 1, eraClipped: true, since: "2026-03-01" });
    expect(trailingWindowLabel(early)).toBe("since Mar 2026 (1 day)");

    expect(trailingWindow(ASOF, 365, null)).toMatchObject({ days: 365, eraClipped: false, era: null, since: "2025-09-12" });
  });
});
