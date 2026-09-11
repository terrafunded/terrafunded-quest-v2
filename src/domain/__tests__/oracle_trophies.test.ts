import { describe, expect, it } from "vitest";
import { runOracle, type OracleParams } from "../oracle";
import { computeTrophies } from "../trophies";
import { computeGoal } from "../goal";
import { buildRealm } from "../realm";
import { ASOF, farm, fileCase, note, noteSale, property, snapshot } from "./builders";

const params: OracleParams = {
  lotsPerMonth: 5,
  avgSalePrice: 130_000,
  avgLandCost: 50_000,
  avgMonthsToSellNote: 3,
  newFarmEveryMonths: 3,
  avgLotsPerFarm: 12,
  investorTakePct: 25,
  downPaymentPct: 5,
  noteSalePct: 80,
};

describe("runOracle", () => {
  const goal = computeGoal([], [], ASOF, { goal: 1_200_000 });

  it("projects the goal date from the sliders and reports lots needed", () => {
    const r = runOracle(params, goal, 100, ASOF);
    expect(r.netProfitPerLot).toBe(60_000);
    expect(r.lotsNeeded).toBe(20);
    expect(r.monthsToGoal).toBe(4); // 5 lots × 60k = 300k/month
    expect(r.goalDate).toBe("2027-01-11");
    expect(r.hitsDeadline).toBe(true);
    expect(r.series[0]?.cumulativeNetProfit).toBe(300_000);
  });

  it("is throttled by inventory and replenished by new farms", () => {
    const r = runOracle({ ...params, newFarmEveryMonths: 6 }, goal, 3, ASOF);
    expect(r.series[0]?.lotsClosed).toBe(3);
    expect(r.series[1]?.lotsClosed).toBe(0);
    expect(r.series[5]?.lotsClosed).toBe(5); // month 6: farm lands, 12 lots
    expect(r.farmsBought).toBeGreaterThanOrEqual(1);
  });

  it("returns null when the goal is out of reach", () => {
    const r = runOracle({ ...params, lotsPerMonth: 0 }, goal, 100, ASOF);
    expect(r.monthsToGoal).toBeNull();
    expect(r.goalDate).toBeNull();
    expect(r.hitsDeadline).toBe(false);
    const loss = runOracle({ ...params, avgLandCost: 200_000 }, goal, 100, ASOF);
    expect(loss.lotsNeeded).toBeNull();
  });

  it("delays note cash by avgMonthsToSellNote", () => {
    const r = runOracle({ ...params, newFarmEveryMonths: 0 }, goal, 100, ASOF);
    const down = 5 * 130_000 * 0.05;
    expect(r.series[0]?.cumulativeCash).toBe(down);
    expect(r.series[2]?.cumulativeCash).toBe(down * 3);
    expect(r.series[3]?.cumulativeCash).toBe(down * 4 + 5 * (130_000 - 6_500) * 0.8);
  });
});

describe("computeTrophies", () => {
  it("yields at least 15 trophies, all unearned on an empty realm", () => {
    const realm = buildRealm(snapshot(), ASOF);
    expect(realm.trophies.length).toBeGreaterThanOrEqual(15);
    expect(realm.trophies.every((t) => !t.earned)).toBe(true);
    expect(realm.trophies.every((t) => t.progress >= 0 && t.progress <= 100)).toBe(true);
  });

  it("earns first blood, first scroll, swift sword and territory conquered on a fully sold farm", () => {
    const f = farm({ total_lots: 1, farm_name: "Solo" });
    // total_lots must be > 1 to be subdivided; use 2 lots both sold
    const f2 = farm({ total_lots: 2, farm_name: "Duo", investor_capital: 100_000, funding_date: "2026-01-01" });
    const p1 = property(f2.id, 1);
    const p2 = property(f2.id, 2);
    const n1 = note(p1.id, { start_date: "2026-02-10", is_sold: true });
    const realm = buildRealm(
      snapshot({
        farmAcquisitions: [f, f2],
        properties: [p1, p2],
        fileCases: [
          fileCase(p1.id, { status: "completed", reservation_date: "2026-02-01", closing_date: "2026-02-10" }),
          fileCase(p2.id, { status: "completed", reservation_date: "2026-03-01", closing_date: "2026-03-20", deal_type: "cash", sale_price: 200_000 }),
        ],
        notes: [n1],
        noteSales: [noteSale(n1.id, { sale_date: "2026-04-01" })],
      }),
      ASOF,
    );
    const earned = new Set(realm.trophies.filter((t) => t.earned).map((t) => t.id));
    expect(earned).toContain("first_blood");
    expect(earned).toContain("first_note_sold");
    expect(earned).toContain("swift_sword");
    expect(earned).toContain("farm_fully_sold");
    expect(earned).toContain("farm_half_sold");
    expect(earned).not.toContain("net_profit_1m");
    expect(realm.trophies.find((t) => t.id === "first_blood")?.earnedAt).toBe("2026-02-10");
    const trophies = computeTrophies({
      lots: realm.lots,
      farms: realm.farms,
      goal: realm.goal,
      events: realm.events,
      treasury: realm.treasury,
      investors: realm.investors,
      streaks: realm.streaks,
      reservationStreaks: realm.reservationStreaks,
      liberation: realm.liberation,
    });
    expect(trophies).toEqual(realm.trophies);
    // reservation trophies exist alongside the closing ones
    expect(realm.trophies.map((t) => t.id)).toEqual(expect.arrayContaining(["streak_weeks_3", "pledge_streak_weeks_3", "pledge_streak_3", "busy_pledge_week_3", "pledge_streak_weeks_6"]));
  });
});
