import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deadlineForHorizon } from "../../config/goal";
import { ENGINE_DEFAULT_COST_PER_RESERVATION } from "../../config/engine";
import { buildRealm } from "../realm";
import type { PaymentsSnapshot } from "../types";
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
    simulatedFreedomDate: result.simulatedFreedomDate,
    netProfitAtDeadline: result.netProfitAtDeadline,
    totalAdSpend: result.totalAdSpend,
    landCapitalDeployed: result.landCapitalDeployed,
    peakCapitalOwed: result.peakCapitalOwed,
    interestPaid: result.interestPaid,
    lotsSold: result.lotsSold,
    farmsBought: result.farmsBought,
    farmsUnfunded: result.farmsUnfunded,
    bottleneck: result.bottleneck.kind,
    demandPerMonth: result.demandPerMonth,
    vsTodayPace: result.vsTodayPace
      ? { days: result.vsTodayPace.days, comparator: result.vsTodayPace.comparator, direction: result.vsTodayPace.direction }
      : null,
    vsDeadline: result.vsDeadline
      ? { days: result.vsDeadline.days, comparator: result.vsDeadline.comparator, direction: result.vsDeadline.direction }
      : null,
  };
}

describe("simulator — one engine", () => {
  it("converts ad spend to demand through the CPR assumption and conversion", () => {
    expect(ENGINE_DEFAULT_COST_PER_RESERVATION).toBe(2_000);
    expect(demandLotsPerMonth(10_000, 2_000, 50)).toBe(2.5);
    expect(inferredAdSpendPerMonth(4.73, 2_000, 100)).toBe(9_460);
  });

  it("today's-pace freedom date matches Throne Room at every horizon", () => {
    for (const year of [2027, 2028, 2029] as const) {
      const realm = realmFor(year);
      const ctx = simulatorContextFromRealm(realm);
      const today = runPreset("today", ctx, true);
      expect(todayPaceFreedomDate(realm.pathToGoal)).toBe("2028-10-22");
      expect(today.freedomDate).toBe(realm.pathToGoal.projectedExitAtCurrentPace);
      expect(today.freedomDate).toBe(projectedExitAtCurrentPace(realm.goal));
      expect(today.freedomDate).toBe(realm.goal.projectedDateRecent);
      expect(today.vsTodayPace?.direction).toBe("same");
      expect(today.vsTodayPace?.comparator).toBe("today_pace");
      expect(today.vsDeadline?.comparator).toBe("deadline");
    }
  });

  it("every day-delta names its comparator", () => {
    const required = runPreset("required", ctxFor(2027), true);
    expect(required.vsTodayPace?.comparator).toBe("today_pace");
    expect(required.vsDeadline?.comparator).toBe("deadline");
    expect(required.vsTodayPace).not.toBeNull();
    expect(required.vsDeadline).not.toBeNull();
  });

  it("closings are min(demand, inventory) — extra ads with no new farms do not move the freedom date once inventory binds", () => {
    const ctx = ctxFor(2027);
    const baseLevers: SimulatorLevers = {
      ...todayLevers(ctx),
      farmsPerQuarter: 0,
      capitalAvailable: 0,
      adSpendPerMonth: 80_000,
    };
    const low = runSimulator(baseLevers, ctx, { skipMarginals: true });
    expect(low.bindingByMonth.some((b) => b === "inventory")).toBe(true);
    const high = runSimulator({ ...baseLevers, adSpendPerMonth: 160_000 }, ctx, { skipMarginals: true });
    expect(high.bindingByMonth.some((b) => b === "inventory")).toBe(true);
    const lowDate = low.simulatedFreedomDate;
    const highDate = high.simulatedFreedomDate;
    if (lowDate && highDate) {
      expect(highDate >= lowDate).toBe(true);
    } else {
      expect(highDate).toBe(lowDate);
    }
    expect(high.lotsSold).toBeLessThanOrEqual(low.lotsSold + 0.05);
    expect(high.totalAdSpend).toBeGreaterThan(low.totalAdSpend);
  });

  it("farms beyond available capital are unfunded and do not add inventory", () => {
    const ctx = ctxFor(2027);
    const levers: SimulatorLevers = {
      ...todayLevers(ctx),
      farmsPerQuarter: 4,
      capitalAvailable: 0,
    };
    const result = runSimulator(levers, ctx, { skipMarginals: true });
    expect(result.farmsBought).toBe(0);
    expect(result.farmsUnfunded).toBeGreaterThan(0);
    expect(result.bottleneck.kind).toBe("capital");
    expect(result.bottleneck.fundByDate).toBe(ctx.pathToGoal.nextFarmFundByDate);
  });

  it("charges ad spend and interest against net profit at the deadline", () => {
    const today = runPreset("today", ctxFor(2027), true);
    expect(today.totalAdSpend).toBeGreaterThan(0);
    expect(today.interestPaid).toBeGreaterThan(0);
    const last = today.series.find((s) => s.monthIndex === today.series.find((p) => p.date >= "2027-12-31")?.monthIndex);
    const sample = today.series[Math.min(6, today.series.length - 1)];
    expect(sample).toBeDefined();
    expect(sample!.cumulativeNetProfit).toBe(
      Math.round((sample!.cumulativeBookedProfit - sample!.cumulativeAdSpend - sample!.cumulativeInterest) * 100) / 100,
    );
    void last;
  });

  it("pins the four presets at all three horizons", () => {
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
        today: {
          freedomDate: "2028-10-22",
          simulatedFreedomDate: null,
          netProfitAtDeadline: 4107454.99,
          totalAdSpend: 147891.33,
          landCapitalDeployed: 8106202,
          peakCapitalOwed: 17616791.9,
          interestPaid: 1766694.94,
          lotsSold: 64.33,
          farmsBought: 13,
          farmsUnfunded: 0,
          bottleneck: "demand",
          demandPerMonth: 4.73,
          vsTodayPace: { days: 0, comparator: "today_pace", direction: "same" },
          vsDeadline: { days: 296, comparator: "deadline", direction: "behind" },
        },
        required: {
          freedomDate: "2028-07-29",
          simulatedFreedomDate: "2028-07-29",
          netProfitAtDeadline: 7974500.98,
          totalAdSpend: 265766.67,
          landCapitalDeployed: 3117770,
          peakCapitalOwed: 3740450.77,
          interestPaid: 740838.89,
          lotsSold: 115.6,
          farmsBought: 5,
          farmsUnfunded: 0,
          bottleneck: "demand",
          demandPerMonth: 8.5,
          vsTodayPace: { days: 85, comparator: "today_pace", direction: "ahead" },
          vsDeadline: { days: 211, comparator: "deadline", direction: "behind" },
        },
        plus_one_farm: {
          freedomDate: null,
          simulatedFreedomDate: null,
          netProfitAtDeadline: 3723497.67,
          totalAdSpend: 147891.33,
          landCapitalDeployed: 9976864,
          peakCapitalOwed: 18535116.88,
          interestPaid: 2150652.26,
          lotsSold: 64.33,
          farmsBought: 16,
          farmsUnfunded: 2,
          bottleneck: "capital",
          demandPerMonth: 4.73,
          vsTodayPace: { days: 3650, comparator: "today_pace", direction: "behind" },
          vsDeadline: { days: 3650, comparator: "deadline", direction: "behind" },
        },
        aggressive: {
          freedomDate: "2029-02-03",
          simulatedFreedomDate: "2029-02-03",
          netProfitAtDeadline: 7069468.03,
          totalAdSpend: 295782.67,
          landCapitalDeployed: 12471080,
          peakCapitalOwed: 13485463.22,
          interestPaid: 2220434.49,
          lotsSold: 128.66,
          farmsBought: 20,
          farmsUnfunded: 4,
          bottleneck: "capital",
          demandPerMonth: 9.46,
          vsTodayPace: { days: 104, comparator: "today_pace", direction: "behind" },
          vsDeadline: { days: 400, comparator: "deadline", direction: "behind" },
        },
      },
      {
        year: 2028,
        today: {
          freedomDate: "2028-10-22",
          simulatedFreedomDate: null,
          netProfitAtDeadline: 4756656.94,
          totalAdSpend: 261411.33,
          landCapitalDeployed: 13718188,
          peakCapitalOwed: 17616791.9,
          interestPaid: 3966398.78,
          lotsSold: 121.09,
          farmsBought: 22,
          farmsUnfunded: 0,
          bottleneck: "demand",
          demandPerMonth: 4.73,
          vsTodayPace: { days: 0, comparator: "today_pace", direction: "same" },
          vsDeadline: { days: 70, comparator: "deadline", direction: "ahead" },
        },
        required: {
          freedomDate: "2029-10-21",
          simulatedFreedomDate: "2029-10-21",
          netProfitAtDeadline: 7618842.34,
          totalAdSpend: 248147.33,
          landCapitalDeployed: 3117770,
          peakCapitalOwed: 3320955.48,
          interestPaid: 1202277.85,
          lotsSold: 114.94,
          farmsBought: 5,
          farmsUnfunded: 0,
          bottleneck: "demand",
          demandPerMonth: 4.49,
          vsTodayPace: { days: 364, comparator: "today_pace", direction: "behind" },
          vsDeadline: { days: 294, comparator: "deadline", direction: "behind" },
        },
        plus_one_farm: {
          freedomDate: null,
          simulatedFreedomDate: null,
          netProfitAtDeadline: 3728681.27,
          totalAdSpend: 261411.33,
          landCapitalDeployed: 17459512,
          peakCapitalOwed: 18535116.88,
          interestPaid: 4986628.21,
          lotsSold: 121.09,
          farmsBought: 28,
          farmsUnfunded: 4,
          bottleneck: "capital",
          demandPerMonth: 4.73,
          vsTodayPace: { days: 3650, comparator: "today_pace", direction: "behind" },
          vsDeadline: { days: 3650, comparator: "deadline", direction: "behind" },
        },
        aggressive: {
          freedomDate: "2029-02-03",
          simulatedFreedomDate: "2029-02-03",
          netProfitAtDeadline: 9870860.58,
          totalAdSpend: 522822.67,
          landCapitalDeployed: 21200836,
          peakCapitalOwed: 13485463.22,
          interestPaid: 4773635.46,
          lotsSold: 242.18,
          farmsBought: 34,
          farmsUnfunded: 6,
          bottleneck: "capital",
          demandPerMonth: 9.46,
          vsTodayPace: { days: 104, comparator: "today_pace", direction: "behind" },
          vsDeadline: { days: 34, comparator: "deadline", direction: "behind" },
        },
      },
      {
        year: 2029,
        today: {
          freedomDate: "2028-10-22",
          simulatedFreedomDate: null,
          netProfitAtDeadline: 4303636.27,
          totalAdSpend: 374931.33,
          landCapitalDeployed: 19953728,
          peakCapitalOwed: 17616791.9,
          interestPaid: 6804785.33,
          lotsSold: 177.85,
          farmsBought: 32,
          farmsUnfunded: 0,
          bottleneck: "demand",
          demandPerMonth: 4.73,
          vsTodayPace: { days: 0, comparator: "today_pace", direction: "same" },
          vsDeadline: { days: 435, comparator: "deadline", direction: "ahead" },
        },
        required: {
          freedomDate: "2032-09-12",
          simulatedFreedomDate: "2032-09-12",
          netProfitAtDeadline: 7347363.75,
          totalAdSpend: 240970.67,
          landCapitalDeployed: 2494216,
          peakCapitalOwed: 3320955.48,
          interestPaid: 1450052.73,
          lotsSold: 114.3,
          farmsBought: 4,
          farmsUnfunded: 0,
          bottleneck: "demand",
          demandPerMonth: 3.04,
          vsTodayPace: { days: 1421, comparator: "today_pace", direction: "behind" },
          vsDeadline: { days: 986, comparator: "deadline", direction: "behind" },
        },
        plus_one_farm: {
          freedomDate: null,
          simulatedFreedomDate: null,
          netProfitAtDeadline: 2369712.3,
          totalAdSpend: 374931.33,
          landCapitalDeployed: 22447944,
          peakCapitalOwed: 18535116.88,
          interestPaid: 8669720.87,
          lotsSold: 177.85,
          farmsBought: 36,
          farmsUnfunded: 4,
          bottleneck: "capital",
          demandPerMonth: 4.73,
          vsTodayPace: { days: 3650, comparator: "today_pace", direction: "behind" },
          vsDeadline: { days: 3650, comparator: "deadline", direction: "behind" },
        },
        aggressive: {
          freedomDate: "2029-02-03",
          simulatedFreedomDate: "2029-02-03",
          netProfitAtDeadline: 12946990.98,
          totalAdSpend: 749862.67,
          landCapitalDeployed: 21200836,
          peakCapitalOwed: 13485463.22,
          interestPaid: 6848734.83,
          lotsSold: 355.7,
          farmsBought: 34,
          farmsUnfunded: 6,
          bottleneck: "capital",
          demandPerMonth: 9.46,
          vsTodayPace: { days: 104, comparator: "today_pace", direction: "behind" },
          vsDeadline: { days: 331, comparator: "deadline", direction: "ahead" },
        },
      },
    ]);
  });
});
