import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deadlineForHorizon } from "../../config/goal";
import { ENGINE_DEFAULT_COST_PER_RESERVATION } from "../../config/engine";
import { engineDefaultsFromRealm, runEngine } from "../engine";
import { buildRealm } from "../realm";
import { reservationsPerFarmPerMonth } from "../oracle";
import {
  demandLotsPerMonth,
  inferredAdSpendPerMonth,
  runAllPresets,
  runPreset,
  runSimulator,
  simulatorContextFromRealm,
  todayLevers,
  todayPaceFreedomDate,
  type SimulatorContext,
  type SimulatorLevers,
} from "../simulator";
import { projectedExitAtCurrentPace } from "../pathToGoal";
import type { PaymentsSnapshot } from "../types";

const snap = JSON.parse(
  readFileSync(new URL("../__fixtures__/payments.json", import.meta.url), "utf8"),
) as PaymentsSnapshot;
const ASOF = new Date("2026-09-11T12:00:00Z");

function realmFor(year: 2027 | 2028 | 2029) {
  return buildRealm(snap, ASOF, { deadline: deadlineForHorizon(year) });
}

function ctxFor(year: 2027 | 2028 | 2029): SimulatorContext {
  return simulatorContextFromRealm(realmFor(year));
}

function pin(result: ReturnType<typeof runPreset>) {
  return {
    freedomDate: result.freedomDate,
    peakCapitalOwed: result.peakCapitalOwed,
    inventoryZeroDate: result.inventoryZeroDate,
    activeFarmsToday: result.activeFarmsToday,
  };
}

describe("simulator — per-farm selling model", () => {
  it("converts the shared daily budget to reservations through the CPR assumption", () => {
    expect(ENGINE_DEFAULT_COST_PER_RESERVATION).toBe(2_000);
    expect(reservationsPerFarmPerMonth(250, 2_000)).toBe(3.75);
    expect(demandLotsPerMonth(10_000, 2_000, 50)).toBe(2.5);
    expect(inferredAdSpendPerMonth(4.73, 2_000, 100)).toBe(9_460);
  });

  it("freedom date and the chart share the after-cost series", () => {
    const today = runPreset("today", ctxFor(2027), true);
    expect(today.freedomDate).toBe(today.simulatedFreedomDate);
    expect(today.freedomDate).toBe("2028-04-23");
    expect(today.series.some((s) => today.freedomDate !== null && s.date >= today.freedomDate)).toBe(true);
    const before = today.series.filter((s) => s.date < (today.freedomDate as string));
    expect(before.every((s) => s.cumulativeNetProfit < 10_000_000)).toBe(true);
    const crossing = today.series.find((s) => s.date >= (today.freedomDate as string));
    expect(crossing).toBeDefined();
    expect(crossing!.cumulativeNetProfit).toBeGreaterThanOrEqual(10_000_000);
  });

  it("today's-pace freedom date is not the Overview era exit — that date stays a labeled comparison", () => {
    for (const year of [2027, 2028, 2029] as const) {
      const realm = realmFor(year);
      const ctx = simulatorContextFromRealm(realm);
      const today = runPreset("today", ctx, true);
      expect(todayPaceFreedomDate(realm.pathToGoal)).toBe("2028-10-22");
      expect(todayPaceFreedomDate(realm.pathToGoal)).toBe(projectedExitAtCurrentPace(realm.goal));
      expect(today.freedomDate).not.toBe(realm.pathToGoal.projectedExitAtCurrentPace);
      expect(today.freedomDate).toBe(today.simulatedFreedomDate);
      expect(today.vsTodayPace?.direction).toBe("same");
      expect(today.vsTodayPace?.comparator).toBe("today_pace");
      expect(today.vsDeadline?.comparator).toBe("deadline");
    }
  });

  it("peak owed is a monthly max, near the Engine peak, and never above land deployed plus starting outstanding", () => {
    const realm = realmFor(2027);
    const ctx = simulatorContextFromRealm(realm);
    const today = runPreset("today", ctx, true);
    const engine = runEngine(engineDefaultsFromRealm(realm, realm.rotation.benchmark?.farmName ?? null).inputs, {
      ...realm,
      referencePace: engineDefaultsFromRealm(realm, realm.rotation.benchmark?.farmName ?? null).referencePace,
    });
    const seriesMax = today.series.reduce((p, s) => Math.max(p, s.capitalOwed), 0);
    expect(today.peakCapitalOwed).toBeGreaterThanOrEqual(seriesMax);
    expect(today.peakCapitalOwed).toBeLessThanOrEqual(today.landCapitalDeployed + ctx.owedStart + 0.01);
    expect(today.peakCapitalOwed).toBeLessThanOrEqual(today.landCapitalDeployed + 0.01);
    expect(today.peakCapitalOwed).toBeCloseTo(3_944_509.48, 2);
    expect(engine.figures.peakOutstanding).toBeCloseTo(3_995_739.78, 2);
    expect(Math.abs(today.peakCapitalOwed - engine.figures.peakOutstanding)).toBeLessThan(100_000);
  });

  it("does not subtract interest a second time — after-cost net is booked minus ads", () => {
    const today = runPreset("today", ctxFor(2027), true);
    expect(today.interestPaid).toBeGreaterThan(0);
    for (const s of today.series) {
      expect(s.cumulativeNetProfit).toBeCloseTo(s.cumulativeBookedProfit - s.cumulativeAdSpend, 2);
    }
  });

  it("every day-delta names its comparator", () => {
    const required = runPreset("required", ctxFor(2027), true);
    expect(required.vsTodayPace?.comparator).toBe("today_pace");
    expect(required.vsDeadline?.comparator).toBe("deadline");
    expect(required.vsTodayPace).not.toBeNull();
    expect(required.vsDeadline).not.toBeNull();
  });

  it("closings are min(demand, inventory) — extra budget with no new farms does not add lots once inventory binds", () => {
    const ctx = ctxFor(2027);
    const baseLevers: SimulatorLevers = {
      ...todayLevers(ctx),
      farmsPerQuarter: 0,
      capitalAvailable: 0,
      adBudgetPerFarmPerDay: 800,
    };
    const low = runSimulator(baseLevers, ctx, { skipMarginals: true });
    const high = runSimulator({ ...baseLevers, adBudgetPerFarmPerDay: 1_600 }, ctx, { skipMarginals: true });
    expect(high.lotsSold).toBeLessThanOrEqual(low.lotsSold + 0.05);
    expect(high.totalAdSpend).toBeGreaterThan(low.totalAdSpend);
  });

  it("farms beyond available capital are unfunded and do not add inventory", () => {
    const ctx = ctxFor(2027);
    const levers: SimulatorLevers = {
      ...todayLevers(ctx),
      farmsPerQuarter: 4,
      capitalAvailable: 0,
      sellNotes: false,
    };
    const result = runSimulator(levers, ctx, { skipMarginals: true });
    expect(result.farmsBought).toBe(0);
    expect(result.farmsUnfunded).toBeGreaterThan(0);
    expect(result.bottleneck.kind).toBe("capital");
    expect(result.bottleneck.fundByDate).toBe(ctx.pathToGoal.nextFarmFundByDate);
  });

  it("pins freedom date, peak owed, inventory-zero month and active-farm count for the four presets at all three horizons", () => {
    const rows = ([2027, 2028, 2029] as const).map((year) => {
      const all = runAllPresets(ctxFor(year), true);
      return {
        year,
        today: pin(all.today),
        required: pin(all.required),
        plus_one_farm: pin(all.plus_one_farm),
        aggressive: pin(all.aggressive),
      };
    });
    expect(rows).toEqual([
      {
        year: 2027,
        today: { freedomDate: "2028-04-23", peakCapitalOwed: 3944509.48, inventoryZeroDate: "2028-12-31", activeFarmsToday: 8 },
        required: { freedomDate: "2029-12-24", peakCapitalOwed: 3320955.48, inventoryZeroDate: "2030-06-30", activeFarmsToday: 8 },
        plus_one_farm: { freedomDate: "2027-12-26", peakCapitalOwed: 5119842.14, inventoryZeroDate: "2028-08-31", activeFarmsToday: 8 },
        aggressive: { freedomDate: "2027-09-11", peakCapitalOwed: 6086093.17, inventoryZeroDate: "2028-03-31", activeFarmsToday: 8 },
      },
      {
        year: 2028,
        today: { freedomDate: "2028-04-23", peakCapitalOwed: 3944509.48, inventoryZeroDate: "2028-12-31", activeFarmsToday: 8 },
        required: { freedomDate: "2032-03-24", peakCapitalOwed: 3320955.48, inventoryZeroDate: "2027-03-31", activeFarmsToday: 8 },
        plus_one_farm: { freedomDate: "2027-12-26", peakCapitalOwed: 5119842.14, inventoryZeroDate: "2028-08-31", activeFarmsToday: 8 },
        aggressive: { freedomDate: "2027-09-11", peakCapitalOwed: 6086093.17, inventoryZeroDate: "2028-03-31", activeFarmsToday: 8 },
      },
      {
        year: 2029,
        today: { freedomDate: "2028-04-23", peakCapitalOwed: 3944509.48, inventoryZeroDate: "2028-12-31", activeFarmsToday: 8 },
        required: { freedomDate: "2036-04-23", peakCapitalOwed: 3320955.48, inventoryZeroDate: "2027-03-31", activeFarmsToday: 8 },
        plus_one_farm: { freedomDate: "2027-12-26", peakCapitalOwed: 5119842.14, inventoryZeroDate: "2028-08-31", activeFarmsToday: 8 },
        aggressive: { freedomDate: "2027-09-11", peakCapitalOwed: 6086093.17, inventoryZeroDate: "2028-03-31", activeFarmsToday: 8 },
      },
    ]);
  });
});
