/**
 * The exit horizon only changes WHICH deadline the existing math runs against.
 * Historical facts stay put; required / projected / at-the-deadline figures move.
 */
import { describe, expect, it } from "vitest";
import raw from "../__fixtures__/payments.json";
import type { PaymentsSnapshot } from "../types";
import { buildRealm } from "../realm";
import { deadlineForHorizon, DEFAULT_EXIT_HORIZON, EXIT_HORIZONS, type ExitHorizon } from "../../config/goal";
import { pulseRatioPct } from "../pulse";
import { round2 } from "../math";

const fixture = raw as unknown as PaymentsSnapshot;
const ASOF = new Date("2026-09-11T00:00:00Z");

const at = (h: ExitHorizon) => buildRealm(fixture, ASOF, { deadline: deadlineForHorizon(h) });

describe("deadlineForHorizon", () => {
  it("is always December 31 of that year", () => {
    expect(deadlineForHorizon(2027)).toBe("2027-12-31");
    expect(deadlineForHorizon(2028)).toBe("2028-12-31");
    expect(deadlineForHorizon(2029)).toBe("2029-12-31");
    expect(EXIT_HORIZONS).toEqual([2027, 2028, 2029]);
    expect(DEFAULT_EXIT_HORIZON).toBe(2027);
  });
});

describe("buildRealm at each exit horizon", () => {
  const r2027 = at(2027);
  const r2028 = at(2028);
  const r2029 = at(2029);
  const rDefault = buildRealm(fixture, ASOF);

  it("defaults to 2027-12-31 when no deadline is passed", () => {
    expect(rDefault.goal.deadline).toBe("2027-12-31");
    expect(rDefault.goal.daysToDeadline).toBe(r2027.goal.daysToDeadline);
    expect(rDefault.goal.requiredLotsPerMonthToHitDeadline).toBe(r2027.goal.requiredLotsPerMonthToHitDeadline);
  });

  it("leaves historical facts identical across 2027 / 2028 / 2029", () => {
    // These are facts already on the books. Changing the exit year must not rewrite them.
    for (const r of [r2028, r2029]) {
      expect(r.goal.netProfitToDate).toBe(r2027.goal.netProfitToDate);
      expect(r.goal.cashRealized).toBe(r2027.goal.cashRealized);
      expect(r.goal.capitalOutstanding).toBe(r2027.goal.capitalOutstanding);
      expect(r.debt.capitalOwed).toBe(r2027.debt.capitalOwed);
      expect(r.debt.interestPerDay).toBe(r2027.debt.interestPerDay);
      expect(r.expected.liveReservations).toBe(r2027.expected.liveReservations);
      expect(r.trophies.length).toBe(r2027.trophies.length);
      expect(r.investors.map((i) => i.interestAccrued)).toEqual(r2027.investors.map((i) => i.interestAccrued));
      expect(r.events.filter((e) => e.kind !== "milestone").map((e) => e.id)).toEqual(
        r2027.events.filter((e) => e.kind !== "milestone").map((e) => e.id),
      );
    }
  });

  it("moves required / at-deadline figures in the expected direction as the horizon lengthens", () => {
    expect(r2027.goal.deadline).toBe("2027-12-31");
    expect(r2028.goal.deadline).toBe("2028-12-31");
    expect(r2029.goal.deadline).toBe("2029-12-31");

    expect(r2027.goal.daysToDeadline).toBeLessThan(r2028.goal.daysToDeadline);
    expect(r2028.goal.daysToDeadline).toBeLessThan(r2029.goal.daysToDeadline);

    const req = (r: typeof r2027) => r.goal.requiredLotsPerMonthToHitDeadline as number;
    expect(req(r2029)).toBeLessThan(req(r2028));
    expect(req(r2028)).toBeLessThan(req(r2027));

    // farmsStillNeeded is inventory-gap ÷ avg lots per farm — the existing formula does not
    // read the deadline, so the number is the same on all three horizons. The War Plan's
    // last purchase date is the figure that slides later when there is more time.
    expect(r2028.goal.farmsStillNeeded).toBe(r2027.goal.farmsStillNeeded);
    expect(r2029.goal.farmsStillNeeded).toBe(r2027.goal.farmsStillNeeded);
    expect(r2027.goal.farmsStillNeeded).toBeGreaterThan(0);
    expect(r2029.warPlan.required.lastPurchaseDate! > r2027.warPlan.required.lastPurchaseDate!).toBe(true);

    expect(r2029.warPlan.required.closingsPerMonth).toBeLessThan(r2028.warPlan.required.closingsPerMonth);
    expect(r2028.warPlan.required.closingsPerMonth).toBeLessThan(r2027.warPlan.required.closingsPerMonth);

    // More calendar days of interest on the same outstanding fixed-interest capital.
    const interestToDeadline = (r: typeof r2027) => round2(r.debt.interestPerDay * r.debt.daysLeft);
    expect(interestToDeadline(r2029)).toBeGreaterThan(interestToDeadline(r2028));
    expect(interestToDeadline(r2028)).toBeGreaterThan(interestToDeadline(r2027));

    // The War Plan's last month is the deadline; capital still owed then is not today's debt.
    expect(r2027.warPlan.required.rows.at(-1)?.date).toBe("2027-12-31");
    expect(r2028.warPlan.required.rows.at(-1)?.date).toBe("2028-12-31");
    expect(r2029.warPlan.required.rows.at(-1)?.date).toBe("2029-12-31");
    const owedAtDeadline = (r: typeof r2027) => r.warPlan.required.rows.at(-1)?.capitalOwed as number;
    expect(owedAtDeadline(r2027)).not.toBe(r2027.debt.capitalOwed);
    expect(owedAtDeadline(r2027)).not.toBe(owedAtDeadline(r2028));
    expect(owedAtDeadline(r2028)).not.toBe(owedAtDeadline(r2029));
  });

  it("THE PULSE: PRODUCING is identical across horizons; NEEDED and the percentage move", () => {
    // PRODUCING is today's trailing pace — historical, not a function of the deadline.
    expect(r2027.oxygen.netProfitPerDayAtPace).not.toBeNull();
    expect(r2028.oxygen.netProfitPerDayAtPace).toBe(r2027.oxygen.netProfitPerDayAtPace);
    expect(r2029.oxygen.netProfitPerDayAtPace).toBe(r2027.oxygen.netProfitPerDayAtPace);

    // NEEDED is remaining ÷ days left — a longer horizon lowers the daily requirement.
    const needed = (r: typeof r2027) => r.debt.requiredNetProfitPerDay as number;
    expect(needed(r2029)).toBeLessThan(needed(r2028));
    expect(needed(r2028)).toBeLessThan(needed(r2027));

    const producing = r2027.oxygen.netProfitPerDayAtPace as number;
    for (const r of [r2027, r2028, r2029]) {
      expect(pulseRatioPct(producing, needed(r))).toBe(round2((producing / needed(r)) * 100));
    }
    expect(pulseRatioPct(producing, needed(r2029))).toBeGreaterThan(pulseRatioPct(producing, needed(r2027)) as number);
  });
});
