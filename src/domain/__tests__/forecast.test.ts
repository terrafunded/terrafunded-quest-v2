/**
 * The forecast visuals read the domain; these tests hold them to it. Every expected figure is
 * recomputed here by hand from the fixture (or a synthetic realm), never read back from the code
 * under test.
 */
import { describe, expect, it } from "vitest";
import raw from "../__fixtures__/payments.json";
import type { PaymentsSnapshot } from "../types";
import { buildRealm } from "../realm";
import { computeGoal } from "../goal";
import { isSold } from "../lot";
import { actualCurve, buildFarmCalendar, buildGoalCurve, buildReverseFunnel, deviationAtDeadline, lineValueAt } from "../forecast";
import { addMonths, parseDate, toIsoDate } from "../dates";
import { buildMonthGrid } from "../oracle";
import { round2 } from "../math";
import { DAYS_PER_MONTH, ERA_START, GOAL_NET_PROFIT } from "../../config/goal";
import { ASOF, farm, fileCase, property, snapshot } from "./builders";

const fixture = raw as unknown as PaymentsSnapshot;
const realm2027 = buildRealm(fixture, ASOF, { deadline: "2027-12-31" });
const realm2028 = buildRealm(fixture, ASOF, { deadline: "2028-12-31" });

/** Walks any value and returns the paths holding NaN or ±Infinity. */
function nonFinite(value: unknown, path = "$", out: string[] = []): string[] {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) out.push(path);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => nonFinite(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) nonFinite(v, `${path}.${k}`, out);
  }
  return out;
}

describe("computeGoal: the era average next to the ledger average", () => {
  it("prices the remaining lots at both averages, never blended", () => {
    const g = realm2027.goal;
    const sold = realm2027.lots.filter(isSold);
    const era = sold.filter((l) => (l.closeDate ?? "") >= ERA_START);
    const allAvg = round2(sold.reduce((s, l) => s + (l.netProfit ?? 0), 0) / sold.length);
    const eraAvg = round2(era.reduce((s, l) => s + (l.netProfit ?? 0), 0) / era.length);
    expect(g.avgNetProfitPerClosedLot).toBe(allAvg);
    expect(g.recentAvgNetProfitPerClosedLot).toBe(eraAvg);
    expect(g.recentClosedLots).toBe(era.length);
    expect(g.recentSince).toBe(ERA_START);
    expect(g.recentSinceLabel).toBe("since Mar 2026");
    expect(eraAvg).not.toBe(allAvg);
    expect(g.lotsStillNeeded).toBe(Math.ceil(g.remaining / allAvg));
    expect(g.lotsStillNeededRecent).toBe(Math.ceil(g.remaining / eraAvg));
    expect(g.monthsAtCurrentPaceRecent).toBe(round2((g.lotsStillNeededRecent as number) / g.closedLotsPerMonth));
    expect(g.requiredLotsPerMonthToHitDeadlineRecent).toBe(round2((g.lotsStillNeededRecent as number) / g.monthsToDeadline));
    expect(realm2027.expected.requiredReservationsPerMonthRecent).toBe(round2((g.requiredLotsPerMonthToHitDeadlineRecent as number) / (realm2027.expected.conversionPct / 100)));
  });

  it("has no era average without an era", () => {
    const g = computeGoal(realm2027.lots, realm2027.farms, ASOF, { eraStart: null });
    expect(g.recentAvgNetProfitPerClosedLot).toBeNull();
    expect(g.recentClosedLots).toBe(0);
    expect(g.lotsStillNeededRecent).toBeNull();
    expect(g.projectedDateRecent).toBeNull();
    expect(g.recentSinceLabel).toBeNull();
  });
});

describe("the Curve", () => {
  it("draws the required line from (today, netProfitToDate) to (deadline, 10,000,000)", () => {
    const c = buildGoalCurve(realm2027.goal, realm2027.history);
    expect(c.required[0]).toEqual({ t: ASOF.getTime(), iso: "2026-09-11", value: realm2027.goal.netProfitToDate });
    expect(c.required[1]).toEqual({ t: parseDate("2027-12-31")!.getTime(), iso: "2027-12-31", value: GOAL_NET_PROFIT });
    expect(c.goal).toBe(10_000_000);
  });

  it("crosses the goal where an independent calculation says the pace reaches it", () => {
    const g = realm2027.goal;
    const c = buildGoalCurve(g, realm2027.history);
    const lots = Math.ceil(g.remaining / (g.avgNetProfitPerClosedLot as number));
    const months = round2(lots / g.closedLotsPerMonth);
    const expected = toIsoDate(addMonths(ASOF, months));
    expect(c.lifetime?.crossing.iso).toBe(expected);
    expect(c.lifetime?.crossing.iso).toBe(g.projectedDate);
    expect(c.lifetime?.crossing.monthsVsDeadline).toBe(round2(months - g.monthsToDeadline));
    expect(c.lifetime?.line[1]).toEqual({ t: parseDate(expected)!.getTime(), iso: expected, value: 10_000_000 });
    expect(c.lifetime?.line[0]).toEqual(c.required[0]);

    const eraLots = Math.ceil(g.remaining / (g.recentAvgNetProfitPerClosedLot as number));
    const eraMonths = round2(eraLots / g.closedLotsPerMonth);
    expect(c.recent?.crossing.iso).toBe(toIsoDate(addMonths(ASOF, eraMonths)));
    expect(c.recent?.crossing.t).toBeLessThan(c.lifetime?.crossing.t as number);
    expect(c.onTrack).toBe(false);
    expect(c.axis.toIso).toBe(c.lifetime?.crossing.iso);
    expect(c.axis.capped).toBe(false);
  });

  it("anchors the actual curve on the counter: last point today at netProfitToDate, month steps equal to monthly net profit", () => {
    const g = realm2027.goal;
    const h = realm2027.history;
    const a = actualCurve(h, g);
    expect(a.at(-1)).toEqual({ t: ASOF.getTime(), iso: "2026-09-11", value: g.netProfitToDate });
    expect(a[0]?.iso).toBe(h[0]?.month);
    // a.length = 1 baseline + one per month; consecutive differences are the months' net profit
    expect(a.length).toBe(h.length + 1);
    h.forEach((m, i) => expect(round2((a[i + 1]?.value ?? 0) - (a[i]?.value ?? 0))).toBe(m.netProfit));
    expect(a[0]?.value).toBe(0);
    for (let i = 1; i < a.length; i++) expect(a[i]!.t).toBeGreaterThanOrEqual(a[i - 1]!.t);
  });

  it("interpolates a straight line and clamps at its ends", () => {
    const line = [
      { t: 0, iso: "", value: 10 },
      { t: 100, iso: "", value: 110 },
    ] as const;
    expect(lineValueAt(line, 50)).toBe(60);
    expect(lineValueAt(line, -5)).toBe(10);
    expect(lineValueAt(line, 500)).toBe(110);
  });
});

describe("the Gauge", () => {
  it("measures the deadline in lots, dollars and days from one root, agreeing with the Curve's marker", () => {
    const g = realm2027.goal;
    const perDay = realm2027.oxygen.netProfitPerDayAtPace as number;
    const d = deviationAtDeadline(g, perDay);
    const lotsAtDeadline = round2(g.closedLotsPerMonth * g.monthsToDeadline);
    const lots = round2(lotsAtDeadline - (g.lotsStillNeeded as number));
    expect(d.lotsAtDeadline).toBe(lotsAtDeadline);
    expect(d.lots).toBe(lots);
    expect(d.dollars).toBe(round2(lots * (g.avgNetProfitPerClosedLot as number)));
    expect(d.days).toBe(Math.round((d.dollars as number) / perDay));
    expect(d.side).toBe("behind");
    // days of delay == the marker's months past the deadline, in days (rounding on both sides)
    const marker = buildGoalCurve(g, realm2027.history).lifetime!.crossing.monthsVsDeadline;
    expect(Math.abs(-(d.days as number) - marker * DAYS_PER_MONTH)).toBeLessThan(2);
  });
});

describe("the Farm Calendar", () => {
  it("runs inventory out at lots in inventory ÷ the required rate and dates the funding deadlines from the plan", () => {
    const plan = realm2027.warPlan;
    const cal = buildFarmCalendar(plan, realm2027.warPlanDefaults.real);
    const months = round2(plan.startInventory / plan.required.closingsPerMonth);
    expect(cal.inventoryOut.lots).toBe(plan.goal.availableLots + plan.goal.reservedLots);
    expect(cal.inventoryOut.requiredPerMonth).toBe(plan.required.closingsPerMonth);
    expect(cal.inventoryOut.months).toBe(months);
    const runout = addMonths(ASOF, months);
    expect(cal.inventoryOut.iso).toBe(toIsoDate(runout));
    const grid = buildMonthGrid(ASOF, parseDate("2027-12-31")!, true);
    expect(cal.inventoryOut.monthIndex).toBe(grid.months.find((m) => runout <= m.end)?.index);
    expect(cal.inventoryOut.afterDeadline).toBe(false);
    expect(cal.months.length).toBe(plan.deadlineMonthIndex);
    expect(cal.months.at(-1)?.isDeadline).toBe(true);

    expect(cal.farms.map((f) => f.purchaseMonth)).toEqual(plan.required.schedule.map((f) => f.purchaseMonth));
    cal.farms.forEach((f, i) => {
      const o = plan.required.schedule[i]!;
      expect(f.purchaseIso).toBe(plan.required.rows.find((r) => r.monthIndex === o.purchaseMonth)?.date);
      expect(f.landMonth).toBe(o.purchaseMonth + plan.landLag);
      expect(round2(f.recycled + f.fresh + f.unfunded)).toBe(round2(o.cost));
    });
    // The first farm lands (first closing) no later than the month inventory runs out: that is what "just in time" means.
    if (cal.farms.length > 0) expect(cal.farms[0]!.landMonth).toBeLessThanOrEqual(cal.inventoryOut.monthIndex as number);
  });

  it("labels the lag as observed only with two or more funded farms and an untouched input", () => {
    const plan = realm2027.warPlan;
    const real = realm2027.warPlanDefaults.real;
    expect(real.farmToFirstCloseFarms).toBeGreaterThanOrEqual(2);
    expect(buildFarmCalendar(plan, real).lag).toEqual({ months: plan.landLag, source: "observed", observedFarms: real.farmToFirstCloseFarms, observedMonths: real.farmToFirstCloseMonths });
    expect(buildFarmCalendar(plan, { farmToFirstCloseMonths: real.farmToFirstCloseMonths, farmToFirstCloseFarms: 1 }).lag.source).toBe("assumption");
    expect(buildFarmCalendar(plan, { farmToFirstCloseMonths: null, farmToFirstCloseFarms: 0 }).lag.source).toBe("assumption");
    expect(buildFarmCalendar({ ...plan, inputs: { ...plan.inputs, farmToFirstCloseMonths: 5 } }, real).lag.source).toBe("assumption");
  });

  it("marks every sponsor capital return the recycling simulation produces", () => {
    const plan = realm2027.warPlan;
    const cal = buildFarmCalendar(plan, realm2027.warPlanDefaults.real);
    const expected = plan.required.schedule.flatMap((f, i) =>
      f.turnCompletesMonth === null ? [] : f.funding.map((s) => ({ monthIndex: f.turnCompletesMonth as number, farmNumber: i + 1, sponsor: s.name, amount: round2(s.amount) })),
    );
    expect(cal.returns.map(({ monthIndex, farmNumber, sponsor, amount }) => ({ monthIndex, farmNumber, sponsor, amount }))).toEqual(
      expected.sort((a, b) => a.monthIndex - b.monthIndex || a.farmNumber - b.farmNumber),
    );
    for (const r of cal.returns) expect(r.afterDeadline).toBe(r.monthIndex > plan.deadlineMonthIndex);
    expect(cal.recycledTotal).toBe(plan.rotation.recycled);
    expect(cal.capitalToRaise).toBe(plan.required.capitalToRaise);
  });
});

describe("the Reverse Funnel", () => {
  it("walks the remaining dollars back to reservations per week at both averages", () => {
    const g = realm2027.goal;
    const x = realm2027.expected;
    const f = buildReverseFunnel(g, x);
    const conv = x.conversionPct / 100;
    const step = (id: string) => f.steps.find((s) => s.id === id)!;
    expect(f.steps.map((s) => s.id)).toEqual(["remaining", "lots", "reservations", "perMonth", "perWeek"]);
    expect(step("remaining").total.lifetime).toBe(g.remaining);
    expect(step("remaining").perMonth.lifetime).toBe(round2(g.remaining / g.monthsToDeadline));
    expect(step("lots").total).toEqual({ lifetime: g.lotsStillNeeded, recent: g.lotsStillNeededRecent });
    expect(step("lots").perMonth).toEqual({ lifetime: g.requiredLotsPerMonthToHitDeadline, recent: g.requiredLotsPerMonthToHitDeadlineRecent });
    expect(step("reservations").total).toEqual({ lifetime: round2((g.lotsStillNeeded as number) / conv), recent: round2((g.lotsStillNeededRecent as number) / conv) });
    expect(step("perMonth").total).toEqual({ lifetime: x.requiredReservationsPerMonth, recent: x.requiredReservationsPerMonthRecent });
    expect(step("perWeek").total).toEqual({
      lifetime: round2((x.requiredReservationsPerMonth as number) / (DAYS_PER_MONTH / 7)),
      recent: round2((x.requiredReservationsPerMonthRecent as number) / (DAYS_PER_MONTH / 7)),
    });
    expect(step("lots").total.lifetime).not.toBe(step("lots").total.recent);
    expect(f.noHistory).toBe(false);
    expect(f.met).toBe(false);
  });
});

describe("switching the exit horizon moves every line and marker", () => {
  it("2027 → 2028: required line, deadline marker, months against the deadline, gauge, calendar and funnel all move", () => {
    const c27 = buildGoalCurve(realm2027.goal, realm2027.history);
    const c28 = buildGoalCurve(realm2028.goal, realm2028.history);
    expect(c27.required[1].iso).toBe("2027-12-31");
    expect(c28.required[1].iso).toBe("2028-12-31");
    expect(c27.required[0]).toEqual(c28.required[0]);
    // The pace does not depend on the horizon, so the crossing stays; its distance to the deadline shifts by the year.
    expect(c28.lifetime?.crossing.iso).toBe(c27.lifetime?.crossing.iso);
    expect(round2((c27.lifetime!.crossing.monthsVsDeadline - c28.lifetime!.crossing.monthsVsDeadline) / 12)).toBeCloseTo(1, 1);
    expect(c27.actual).toEqual(c28.actual);

    const d27 = deviationAtDeadline(realm2027.goal, realm2027.oxygen.netProfitPerDayAtPace);
    const d28 = deviationAtDeadline(realm2028.goal, realm2028.oxygen.netProfitPerDayAtPace);
    expect(d28.lots).toBeGreaterThan(d27.lots as number);
    expect(d28.dollars).toBeGreaterThan(d27.dollars as number);
    expect(d28.days).toBeGreaterThan(d27.days as number);

    const k27 = buildFarmCalendar(realm2027.warPlan, realm2027.warPlanDefaults.real);
    const k28 = buildFarmCalendar(realm2028.warPlan, realm2028.warPlanDefaults.real);
    expect(k28.months.length).toBe(k27.months.length + 12);
    expect(k28.deadline).toBe("2028-12-31");
    expect(k28.inventoryOut.requiredPerMonth).toBeLessThan(k27.inventoryOut.requiredPerMonth);
    expect(k28.inventoryOut.months).toBeGreaterThan(k27.inventoryOut.months as number);

    const f27 = buildReverseFunnel(realm2027.goal, realm2027.expected);
    const f28 = buildReverseFunnel(realm2028.goal, realm2028.expected);
    expect(f28.monthsToDeadline).toBeGreaterThan(f27.monthsToDeadline);
    expect(f28.steps[3]!.total.lifetime).toBeLessThan(f27.steps[3]!.total.lifetime as number);
    expect(f28.steps[1]!.total).toEqual(f27.steps[1]!.total);
  });
});

describe("a realm with zero closings", () => {
  const f = farm({ farm_name: "Emptyfield", total_lots: 6, closing_date: "2026-05-01", funding_date: "2026-05-01" });
  const props = Array.from({ length: 6 }, (_, i) => property(f.id, i + 1, { name: `Emptyfield — Lot ${i + 1}` }));
  const realm = buildRealm(
    snapshot({ farmAcquisitions: [f], properties: props, fileCases: [fileCase(props[0]!.id, { status: "active", reservation_date: "2026-08-01", sale_price: 120_000 })] }),
    ASOF,
    { deadline: "2027-12-31" },
  );

  it("renders every visual without NaN or Infinity", () => {
    expect(realm.goal.closedLots).toBe(0);
    const curve = buildGoalCurve(realm.goal, realm.history);
    const gauge = deviationAtDeadline(realm.goal, realm.oxygen.netProfitPerDayAtPace);
    const calendar = buildFarmCalendar(realm.warPlan, realm.warPlanDefaults.real);
    const funnel = buildReverseFunnel(realm.goal, realm.expected);
    expect(nonFinite({ curve, gauge, calendar, funnel })).toEqual([]);

    expect(curve.required[0].value).toBe(0);
    expect(curve.required[1].value).toBe(10_000_000);
    expect(curve.lifetime).toBeNull();
    expect(curve.recent).toBeNull();
    expect(curve.onTrack).toBeNull();
    expect(curve.actual.at(-1)).toEqual({ t: ASOF.getTime(), iso: "2026-09-11", value: 0 });
    expect(curve.axis.toIso).toBe("2027-12-31");

    expect(gauge.noHistory).toBe(true);
    expect(gauge.side).toBeNull();
    expect(gauge.lots).toBeNull();

    expect(calendar.lag.source).toBe("assumption");
    expect(calendar.inventoryOut.lots).toBe(6);
    expect(calendar.returns.every((r) => Number.isFinite(r.amount))).toBe(true);

    expect(funnel.noHistory).toBe(true);
    expect(funnel.steps.find((s) => s.id === "lots")?.total).toEqual({ lifetime: null, recent: null });
  });

  it("collapses to the top edge once the goal is met", () => {
    const g = { ...realm2027.goal, netProfitToDate: 10_000_000, remaining: 0 };
    const c = buildGoalCurve(g, realm2027.history);
    expect(c.met).toBe(true);
    expect(c.lifetime).toBeNull();
    expect(c.required[0].value).toBe(10_000_000);
    const d = deviationAtDeadline(g, realm2027.oxygen.netProfitPerDayAtPace);
    expect(d.met).toBe(true);
    expect(d).toMatchObject({ side: "ahead", lots: 0, dollars: 0, days: 0 });
    expect(buildReverseFunnel(g, realm2027.expected).met).toBe(true);
  });
});
