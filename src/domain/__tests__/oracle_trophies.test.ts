import { describe, expect, it } from "vitest";
import { runOracle, type OracleParams } from "../oracle";
import { computeTrophies } from "../trophies";
import { computeGoal } from "../goal";
import { buildRealm } from "../realm";
import { ASOF, distribution, farm, fileCase, investor, note, noteSale, property, snapshot } from "./builders";

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

describe("sponsor_repaid (Debt of Honor) counts sponsors only — own capital is never a debt to a sponsor", () => {
  const portafolio = investor({ name: "Portafolio Diversificado" });
  const percival = investor({ name: "Sir Percival" });
  // Own capital, fully "returned" to ourselves: outstanding 0 for the own-capital investor.
  const promised = farm({ farm_name: "Promised", deal_type: "own_capital", investor_id: portafolio.id, investor_capital: 300_000, total_lots: 2 });
  // Own capital with no investor row at all: only visible through goal.capitalOutstanding.
  const homestead = farm({ farm_name: "Homestead", deal_type: "own_capital", investor_id: null, investor_capital: 200_000, total_lots: 2 });
  // The one real sponsor: $400,000 lent, $100,000 back, $300,000 still owed.
  const eastfield = farm({ farm_name: "Eastfield", deal_type: "profit_share", profit_share_pct: 50, investor_id: percival.id, investor_capital: 400_000, total_lots: 4 });
  const base = () =>
    snapshot({
      farmAcquisitions: [promised, homestead, eastfield],
      properties: [property(promised.id, 1), property(promised.id, 2), property(homestead.id, 1), property(homestead.id, 2), ...[1, 2, 3, 4].map((n) => property(eastfield.id, n))],
      investors: [portafolio, percival],
      investorDistributions: [
        distribution(promised.id, { investor_id: portafolio.id, amount: 300_000, distribution_date: "2026-05-01" }),
        distribution(eastfield.id, { investor_id: percival.id, amount: 100_000, distribution_date: "2026-06-01" }),
      ],
    });

  it("is not earned by repaying our own capital, grades the sponsor's progress and shows Debt.capitalOwed as still outstanding", () => {
    const realm = buildRealm(base(), ASOF);
    const portafolioSummary = realm.investors.find((v) => v.name === "Portafolio Diversificado");
    expect(portafolioSummary?.capitalOutstanding).toBe(0); // the own-capital investor is fully repaid…
    expect(realm.goal.capitalOutstanding).toBe(500_000); // …and the blended figure includes Homestead's $200,000
    expect(realm.debt.capitalOwed).toBe(300_000);
    expect(realm.debt.ownCapitalOutstanding).toBe(200_000);

    const trophy = realm.trophies.find((t) => t.id === "sponsor_repaid");
    expect(trophy?.earned).toBe(false); // …but Debt of Honor is not awarded for it
    expect(trophy?.progress).toBe(25); // Sir Percival: 100,000 ÷ 400,000, not Portafolio's 100 %
    expect(trophy?.detail).toBe("$300,000 still outstanding"); // = debt.capitalOwed, not goal.capitalOutstanding ($500,000)
  });

  it("is earned, and names only the sponsor, once the sponsor's capital is fully returned", () => {
    const snap = base();
    snap.investorDistributions.push(distribution(eastfield.id, { investor_id: percival.id, amount: 300_000, distribution_date: "2026-08-01" }));
    const realm = buildRealm(snap, ASOF);
    const trophy = realm.trophies.find((t) => t.id === "sponsor_repaid");
    expect(realm.debt.capitalOwed).toBe(0);
    expect(trophy?.earned).toBe(true);
    expect(trophy?.progress).toBe(100);
    expect(trophy?.detail).toBe("Sir Percival");
  });

  it("grades a mixed investor on its sponsor positions only", () => {
    // Sir Percival also parks own capital in Homestead (repaid in full); his sponsor position is still owed.
    const snap = base();
    snap.farmAcquisitions = snap.farmAcquisitions.map((f) => (f.id === homestead.id ? { ...f, investor_id: percival.id } : f));
    snap.investorDistributions.push(distribution(homestead.id, { investor_id: percival.id, amount: 200_000, distribution_date: "2026-07-01" }));
    const realm = buildRealm(snap, ASOF);
    expect(realm.investors.find((v) => v.name === "Sir Percival")?.dealType).toBe("mixed");
    const trophy = realm.trophies.find((t) => t.id === "sponsor_repaid");
    expect(trophy?.earned).toBe(false);
    expect(trophy?.progress).toBe(25); // 100,000 ÷ 400,000 on Eastfield; the $200,000 own-capital return does not count
    expect(trophy?.detail).toBe("$300,000 still outstanding");
  });
});
