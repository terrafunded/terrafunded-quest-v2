import { describe, expect, it } from "vitest";
import { buildMonthGrid, runOracle, type InvestorMixEntry, type OracleParams } from "../oracle";
import { computeGoal } from "../goal";
import { buildRealm } from "../realm";
import { round2 } from "../math";
import {
  cadenceSchedule,
  deriveWarPlanDefaults,
  farmToFirstCloseMonths,
  justInTimeSchedule,
  computeRotationBenchmark,
  recentLandCostPerLot,
  solveWarPlan,
  sponsorLedger,
  usdCompact,
  warPlanMonthLabel,
  type WarPlanInputs,
} from "../warplan";
import { computeSeasonality, normalizeSeasonality } from "../seasonality";
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
const goal = computeGoal([], [], ASOF, { goal: 1_200_000 });
const iso = (d: Date | undefined) => d?.toISOString().slice(0, 10);

const profitShare: InvestorMixEntry[] = [{ investorId: "b", name: "B", dealType: "profit_share", ratePct: 50, capital: 600_000 }];
const fixedInterest: InvestorMixEntry[] = [{ investorId: "a", name: "A", dealType: "fixed_interest", ratePct: 20, capital: 600_000 }];

describe("runOracle — War Plan extensions", () => {
  it("with neutral extension fields reproduces the original simulation exactly", () => {
    const legacy = runOracle(params, goal, 100, ASOF);
    const extended = runOracle(
      { ...params, adSpendPerClosing: 0, conversionPct: 100, farmToFirstCloseMonths: 0, investorMix: [], targetMode: "profit_at_closing" },
      goal,
      100,
      ASOF,
    );
    expect(extended.goalDate).toBe(legacy.goalDate);
    expect(extended.monthsToGoal).toBe(legacy.monthsToGoal);
    expect(extended.netProfitAtDeadline).toBe(legacy.netProfitAtDeadline);
    expect(extended.series.map((p) => p.cumulativeNetProfit)).toEqual(legacy.series.map((p) => p.cumulativeNetProfit));
    expect(extended.series.map((p) => p.cumulativeCash)).toEqual(legacy.series.map((p) => p.cumulativeCash));
    expect(legacy.targetMode).toBe("profit_at_closing");
    expect(legacy.farms).toEqual([]);
    expect(legacy.series[0]).toMatchObject({ adSpend: 0, cumulativeNet: 300_000, capitalReturned: [], shortfall: false, farmsBought: 0 });
    // the cadence farm of month 3 is reported as a purchase
    expect(legacy.series[2]).toMatchObject({ farmsBought: 1, capitalDeployed: 600_000 });
  });

  it("buys explicit farms on schedule and lands their lots only after farmToFirstCloseMonths", () => {
    const r = runOracle({ ...params, farmsToBuy: [2], farmToFirstCloseMonths: 3, farmCost: 600_000 }, goal, 0, ASOF);
    expect(r.farmsBought).toBe(1);
    expect(r.farms).toHaveLength(1);
    expect(r.farms[0]).toMatchObject({ purchaseMonth: 2, landMonth: 5, lots: 12, cost: 600_000, unfunded: 600_000, funding: [] });
    expect(r.series[1]).toMatchObject({ farmsBought: 1, capitalDeployed: 600_000, lotsClosed: 0, inventory: 0 });
    expect(r.series[3]?.lotsClosed).toBe(0);
    expect(r.series[4]).toMatchObject({ lotsClosed: 5, inventory: 7, shortfall: false });
    expect(r.series[5]?.lotsClosed).toBe(5);
    expect(r.series[6]).toMatchObject({ lotsClosed: 2, inventory: 0, shortfall: true });
    // months with no inventory are shortfalls
    expect(r.series[0]?.shortfall).toBe(true);
    // the unfunded share of a farm pays the blended take: (130k − 50k) × 75 % = 60k per lot
    expect(r.series[4]?.cumulativeNetProfit).toBe(300_000);
    // ad spend follows closings ÷ conversion × spend per closing
    const ads = runOracle({ ...params, newFarmEveryMonths: 0, adSpendPerClosing: 2_500, conversionPct: 50 }, goal, 100, ASOF);
    expect(ads.series[0]?.adSpend).toBe(25_000);
  });

  it("funds each farm from the investor mix in order and flags the remainder as unfunded", () => {
    const mix: InvestorMixEntry[] = [
      { investorId: "a", name: "A", dealType: "fixed_interest", ratePct: 20, capital: 900_000 },
      { investorId: "b", name: "B", dealType: "profit_share", ratePct: 50, capital: 500_000 },
    ];
    const r = runOracle({ ...params, farmsToBuy: [1, 1, 1], farmCost: 600_000, investorMix: mix }, goal, 0, ASOF);
    expect(r.farms.map((f) => f.funding.map((s) => [s.name, s.amount]))).toEqual([
      [["A", 600_000]],
      [["A", 300_000], ["B", 300_000]],
      [["B", 200_000]],
    ]);
    expect(r.farms.map((f) => f.unfunded)).toEqual([0, 0, 400_000]);
    // five lots of the first farm close in month 1: A gets 5 × 50k of capital back, nothing else is owed yet
    expect(r.series[0]).toMatchObject({
      farmsBought: 3,
      capitalDeployed: 1_800_000,
      lotsClosed: 5,
      cumulativeNetProfit: 400_000,
      capitalOwed: 1_150_000,
      capitalReturned: [250_000, 0],
    });
  });

  it("charges each new lot its own farm's deal instead of the blended take", () => {
    // 50 % profit share: gross 80k → take 40k → net 40k per lot
    const share = runOracle({ ...params, farmsToBuy: [1], farmCost: 600_000, investorMix: profitShare }, goal, 0, ASOF);
    expect(share.series[0]).toMatchObject({ lotsClosed: 5, cumulativeNetProfit: 200_000, cumulativeNet: 200_000, capitalReturned: [250_000], capitalOwed: 350_000 });

    // 20 % fixed interest on 50k of land per lot, one lot a month: 10k × (m − 1)/12 of interest per lot
    const fixed = runOracle({ ...params, lotsPerMonth: 1, farmsToBuy: [1], farmCost: 600_000, investorMix: fixedInterest }, goal, 0, ASOF);
    expect(fixed.series[0]?.cumulativeNetProfit).toBe(80_000);
    expect(fixed.series[1]?.cumulativeNetProfit).toBe(159_166.67);
    expect(fixed.series[6]?.cumulativeNetProfit).toBe(7 * 80_000 - 17_500);

    // own capital: no take, nothing owed, nothing returned
    const own = runOracle(
      { ...params, farmsToBuy: [1], farmCost: 600_000, investorMix: [{ investorId: null, name: "Fund", dealType: "own_capital", ratePct: 0, capital: 600_000 }] },
      goal,
      0,
      ASOF,
    );
    expect(own.series[0]).toMatchObject({ cumulativeNetProfit: 400_000, capitalOwed: 0, capitalReturned: [0] });
  });

  it("measures cash mode on cash kept minus what is owed, farm outlays and take paid", () => {
    const r = runOracle(
      { ...params, farmsToBuy: [1], farmCost: 600_000, investorMix: profitShare, targetMode: "cash_in_bank" },
      goal,
      0,
      ASOF,
      { cashStart: 100_000, owedStart: 250_000 },
    );
    expect(r.targetMode).toBe("cash_in_bank");
    expect(r.targetStart).toBe(-150_000);
    // month 1: 5 down payments of 6.5k in, 600k out for the farm, 200k of profit share owed
    expect(r.series[0]).toMatchObject({ cumulativeCash: 32_500, cumulativeNet: -917_500 });
    // lots needed count the down payment and the discounted note, less the blended take
    expect(r.lotsNeeded).toBe(Math.ceil(1_350_000 / (6_500 + 98_800 - 20_000)));
    // profit mode ignores cashStart/owedStart entirely
    const p = runOracle({ ...params, farmsToBuy: [1], farmCost: 600_000, investorMix: profitShare }, goal, 0, ASOF, { cashStart: 100_000, owedStart: 250_000 });
    expect(p.targetStart).toBe(0);
    expect(p.series[0]?.cumulativeNet).toBe(200_000);
  });

  it("builds calendar months anchored to month ends, the first one prorated", () => {
    const deadline = new Date("2027-12-31T00:00:00Z");
    const cal = buildMonthGrid(ASOF, deadline, true);
    expect(cal.calendar).toBe(true);
    expect(cal.months[0]).toMatchObject({ index: 1, fraction: 19 / 30 });
    expect(iso(cal.months[0]?.open)).toBe("2026-09-11");
    expect(iso(cal.months[0]?.end)).toBe("2026-09-30");
    expect(cal.months[1]).toMatchObject({ index: 2, fraction: 1 });
    expect(iso(cal.months[1]?.end)).toBe("2026-10-31");
    expect(iso(cal.months[15]?.end)).toBe("2027-12-31");
    expect(cal.deadlineIndex).toBe(16);
    expect(cal.deadlineFraction).toBe(1);
    expect(cal.monthsToDeadline).toBeCloseTo(15 + 19 / 30, 6);

    const legacy = buildMonthGrid(ASOF, deadline, false);
    expect(legacy.calendar).toBe(false);
    expect(iso(legacy.months[0]?.end)).toBe("2026-10-11");
    expect(legacy.months[0]?.fraction).toBe(1);
    expect(legacy.deadlineIndex).toBe(16);
    expect(legacy.deadlineFraction).toBeCloseTo(20 / 31, 6);

    // asOf on a month end: the first period is the next full month
    const eom = buildMonthGrid(new Date("2026-09-30T00:00:00Z"), deadline, true);
    expect(iso(eom.months[0]?.end)).toBe("2026-10-31");
    expect(eom.months[0]?.fraction).toBe(1);

    // a deadline that is not in the future has no month
    expect(buildMonthGrid(ASOF, ASOF, true)).toMatchObject({ deadlineIndex: 0, monthsToDeadline: 0 });
  });

  it("in calendar mode prorates the first month and interpolates the goal date inside the crossing month", () => {
    const r = runOracle({ ...params, lotsPerMonth: 6, newFarmEveryMonths: 0 }, goal, 100, ASOF, { calendarMonths: true });
    expect(r.series[0]).toMatchObject({ date: "2026-09-30", lotsClosed: 3.8, cumulativeNetProfit: 228_000 });
    expect(r.series[1]?.date).toBe("2026-10-31");
    expect(r.series[2]?.cumulativeNetProfit).toBe(948_000);
    // 1.2M is crossed 70 % of the way through December: ceil(0.7 × 31) = 22 days after Nov 30
    expect(r.goalDate).toBe("2026-12-22");
    expect(r.monthsToGoal).toBe(3.33);
    expect(r.hitsDeadline).toBe(true);
    expect(r.deadlineMonthIndex).toBe(16);
    expect(r.monthsToDeadline).toBe(15.63);
    expect(r.targetAtDeadline).toBe(228_000 + 15 * 360_000);
  });

  it("pauses closings inside pauseClosings without flagging a shortfall", () => {
    const r = runOracle({ ...params, newFarmEveryMonths: 0, pauseClosings: [2, 3] }, goal, 100, ASOF);
    expect(r.series.slice(0, 4).map((p) => p.lotsClosed)).toEqual([5, 0, 0, 5]);
    expect(r.series[1]?.shortfall).toBe(false);
    expect(r.series[1]?.notesSold).toBe(0);
    // month 4 sells the notes of month 1
    expect(r.series[3]?.notesSold).toBe(5);
  });

  it("reports each farm's conversion before the deadline and flags farms bought too late", () => {
    const r = runOracle({ ...params, farmsToBuy: [10, 15], farmToFirstCloseMonths: 3, farmCost: 600_000 }, goal, 0, ASOF, { calendarMonths: true });
    expect(r.farms[0]).toMatchObject({ purchaseMonth: 10, landMonth: 13, lotsClosedByDeadline: 12, notesSoldByDeadline: 5, tooLate: false });
    expect(r.farms[1]).toMatchObject({ purchaseMonth: 15, landMonth: 18, lotsClosedByDeadline: 0, notesSoldByDeadline: 0, tooLate: true });
    // in cash mode the notes must sell before the deadline too
    const c = runOracle(
      { ...params, farmsToBuy: [10, 11], farmToFirstCloseMonths: 3, farmCost: 600_000, targetMode: "cash_in_bank" },
      goal,
      0,
      ASOF,
      { calendarMonths: true },
    );
    expect(c.farms.map((f) => f.tooLate)).toEqual([false, true]);
  });
});

describe("War Plan helpers", () => {
  it("justInTimeSchedule buys each farm as late as the pace allows", () => {
    const cum = [0, 0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
    // 4 lots/month over 5.5 months = 22 lots; 10 in stock → 3 farms of 5, each landing the month the stock runs out
    expect(justInTimeSchedule(4, cum, 6, 10, 5, 2, 4)).toEqual([2, 3, 4]);
    expect(justInTimeSchedule(4, cum, 6, 10, 5, 2, 2)).toEqual([2, 2, 2]);
    expect(justInTimeSchedule(4, cum, 6, 10, 5, 6, 4)).toEqual([1, 1, 1]);
    expect(justInTimeSchedule(4, cum, 6, 100, 5, 2, 4)).toEqual([]);
    expect(justInTimeSchedule(0, cum, 6, 0, 5, 2, 4)).toEqual([]);
    expect(justInTimeSchedule(4, cum, 0, 0, 5, 2, 4)).toEqual([]);
  });

  it("cadenceSchedule turns 'a farm every N months' into purchase months", () => {
    expect(cadenceSchedule(3)).toHaveLength(40);
    expect(cadenceSchedule(3).slice(0, 3)).toEqual([3, 6, 9]);
    expect(cadenceSchedule(1.48, 6)).toEqual([1, 3, 4, 6]);
    expect(cadenceSchedule(0)).toEqual([]);
  });

  it("formats compact dollars and month labels", () => {
    expect(usdCompact(3_576_240)).toBe("$3.6M");
    expect(usdCompact(28_333.56)).toBe("$28K");
    expect(usdCompact(500)).toBe("$500");
    expect(usdCompact(0)).toBe("$0");
    expect(usdCompact(-1_260_000)).toBe("-$1.3M");
    expect(warPlanMonthLabel("2027-03-31")).toBe("Mar 2027");
    expect(warPlanMonthLabel("nope")).toBe("nope");
  });
});

describe("solveWarPlan on a synthetic realm", () => {
  const kevin = investor({ name: "Kevin Concua" });
  const townson = investor({ name: "Townson Family" });
  const grace = investor({ name: "Grace Hopper" });
  const alpha = farm({
    farm_name: "Alpha",
    total_lots: 20,
    investor_id: kevin.id,
    investor_capital: 1_000_000,
    deal_type: "fixed_interest",
    annual_interest_rate: 20,
    funding_date: "2026-01-01",
    closing_date: "2026-01-01",
  });
  const beta = farm({
    farm_name: "Beta",
    total_lots: 10,
    investor_id: townson.id,
    investor_capital: 500_000,
    deal_type: "profit_share",
    annual_interest_rate: 0,
    profit_share_pct: 50,
    funding_date: "2026-03-01",
    closing_date: "2026-03-01",
  });
  const gamma = farm({
    farm_name: "Gamma",
    total_lots: 10,
    investor_id: grace.id,
    investor_capital: 400_000,
    deal_type: "fixed_interest",
    annual_interest_rate: 15,
    funding_date: "2026-04-01",
    closing_date: "2026-04-01",
  });
  const closes = ["2026-06-20", "2026-07-01", "2026-07-15", "2026-07-30", "2026-08-10", "2026-08-20", "2026-08-30", "2026-09-05"];
  const properties = [];
  const fileCases = [];
  const notes = [];
  const noteSales = [];
  for (let i = 1; i <= 20; i++) {
    const p = property(alpha.id, i, { name: `Alpha — Lot ${i}` });
    properties.push(p);
    if (i <= 8) {
      const close = closes[i - 1] as string;
      fileCases.push(fileCase(p.id, { status: "completed", reservation_date: "2026-05-01", closing_date: close }));
      const n = note(p.id, { start_date: close, is_sold: i <= 4 });
      notes.push(n);
      if (i <= 4) noteSales.push(noteSale(n.id, { sale_date: "2026-09-01", sale_price: 91_200 }));
    }
  }
  for (let i = 1; i <= 10; i++) {
    const p = property(beta.id, i, { name: `Beta — Lot ${i}` });
    properties.push(p);
    if (i <= 2) fileCases.push(fileCase(p.id, { status: "completed", reservation_date: "2026-06-01", closing_date: i === 1 ? "2026-07-20" : "2026-08-25" }));
  }
  for (let i = 1; i <= 10; i++) properties.push(property(gamma.id, i, { name: `Gamma — Lot ${i}` }));

  const realm = buildRealm(
    snapshot({ farmAcquisitions: [alpha, beta, gamma], properties, fileCases, notes, noteSales, investors: [kevin, townson, grace] }),
    ASOF,
  );
  // The plan the earlier pins were written against: the all-time land cost, no capital cycle, flat pace.
  const inputs: WarPlanInputs = { ...realm.warPlanDefaults.inputs, target: 3_000_000, farmCost: 500_000, cycleMonths: null, seasonal: false };
  const plan = solveWarPlan(inputs, realm);
  const oracleOpts = { calendarMonths: true, cashStart: plan.ledger.cashKept, owedStart: plan.ledger.owedToday };

  it("derives every default from the realm and prefills the sponsor mix, named sponsors first", () => {
    const d = realm.warPlanDefaults;
    expect(d.inputs).toMatchObject({
      target: 10_000_000,
      deadline: "2027-12-31",
      targetMode: "profit_at_closing",
      lotsPerFarm: 10,
      // the land-cost trend since Mar 2026: Gamma ($40,000/lot) and Beta ($50,000/lot); Alpha (Jan 2026) predates the era
      farmCost: 450_000,
      adSpendPerClosing: 2_500,
      conversionPct: 100,
      farmToFirstCloseMonths: 5.11,
      noteSaleLagMonths: realm.oracleDefaults.avgMonthsToSellNote,
      cycleMonths: 9.3,
      // six months since Mar 2026: no seasonal profile is applied, so the toggle starts off
      seasonal: false,
    });
    expect(d.real).toMatchObject({
      lotsPerFarm: 13.33,
      landCostPerLot: 50_000,
      recentLandCostPerLot: 45_000,
      recentFarms: ["Gamma", "Beta"],
      defaultLandCostPerLot: 45_000,
      eraSince: "since Mar 2026",
      conversionPct: 100,
      conversionWithCancellationsPct: 100,
      cancellationRatePct: 0,
      farmToFirstCloseMonths: 5.11,
      farmToFirstCloseFarms: 2,
      medianDaysToClose: 87.5,
      closingsPerMonth: 3.38,
      inventory: 30,
      // nobody is freed yet, so the cycle is projected from the campaigns at the current pace — Beta and Gamma only
      cycleDays: 283,
      cycleMonths: 9.3,
      cycleSource: "projected",
      cycleFarms: 2,
      cycleExcludedFarms: [],
      seasonalityApplied: false,
      seasonalityReason: "not enough history for seasonality",
    });
    // Over the whole history Alpha joins the land-cost trend and the projected cycle.
    const allTime = buildRealm(realm.snapshot, ASOF, { eraStart: null }).warPlanDefaults;
    expect(allTime.inputs).toMatchObject({ farmCost: 466_670, cycleMonths: 9.69, seasonal: false });
    expect(allTime.real).toMatchObject({ recentLandCostPerLot: 46_667, recentFarms: ["Gamma", "Beta", "Alpha"], eraSince: null, cycleDays: 295, cycleFarms: 3 });
    expect(d.inputs.investorMix.map((e) => [e.name, e.dealType, e.ratePct, e.capital])).toEqual([
      ["Kevin Concua", "fixed_interest", 20, 1_000_000],
      ["Townson Family", "profit_share", 50, 500_000],
      ["Julio Arriola", "fixed_interest", 25, 0],
      ["Rony Schumann", "fixed_interest", 18, 0],
      ["Doctores Motta", "fixed_interest", 20, 0],
      ["Grace Hopper", "fixed_interest", 15, 400_000],
    ]);
    expect(d.inputs.investorMix[0]?.investorId).toBe(kevin.id);
    expect(d.inputs.investorMix[2]?.investorId).toBeNull();
    expect(d.inputs.investorMix[5]?.investorId).toBe(grace.id);
    expect(deriveWarPlanDefaults(realm)).toEqual(d);
  });

  it("farmToFirstCloseMonths is the median from acquisition to the first closing", () => {
    expect(farmToFirstCloseMonths(realm.farms)).toEqual({ months: 5.11, farms: 2 });
    expect(farmToFirstCloseMonths([])).toEqual({ months: null, farms: 0 });
    const alphaEconomics = realm.farms.find((f) => f.name === "Alpha");
    expect(alphaEconomics).toBeDefined();
    // 90 days before Alpha's first closing on 2026-06-20
    expect(farmToFirstCloseMonths([{ ...(alphaEconomics as NonNullable<typeof alphaEconomics>), closingDate: "2026-03-22", fundingDate: null }])).toEqual({ months: 2.96, farms: 1 });
  });

  it("the sponsor ledger says what is owed today and what cash the fund kept", () => {
    const ledger = sponsorLedger(realm);
    expect(ledger.capitalOwed).toBe(1_900_000);
    expect(ledger.paidOut).toBe(0);
    expect(ledger.cashKept).toBe(424_800);
    expect(ledger.unpaidTake).toBeGreaterThan(70_000); // Townson's 2 × 35k of profit share plus interest accrued
    expect(ledger.owedToday).toBe(round2(ledger.capitalOwed + ledger.unpaidTake));
    expect(plan.ledger).toEqual(ledger);
  });

  it("finds the minimum pace that hits the target by the deadline, buying farms just in time", () => {
    expect(plan.feasible).toBe(true);
    expect(plan).toMatchObject({ deadlineMonthIndex: 16, monthsToDeadline: 15.63, landLag: 5, closeLag: 3, noteLag: 2, maxPurchaseMonth: 8, lastClosingDate: null, startInventory: 30 });
    const r = plan.required;
    expect(r.hitsDeadline).toBe(true);
    expect(r.targetAtDeadline).toBeGreaterThanOrEqual(3_000_000);
    expect(r.closingsPerMonth).toBe(2.63);
    expect(r.farmsToBuy).toBe(2);
    expect(r.schedule.map((f) => [f.purchaseMonth, f.landMonth])).toEqual([[7, 12], [8, 13]]);
    expect(r.lastPurchaseMonth).toBe(8);
    expect(r.lastPurchaseDate).toBe("2027-04-30");
    expect(r.capitalToRaise).toBe(1_000_000);
    expect(r.funding).toEqual([{ mixIndex: 0, investorId: kevin.id, name: "Kevin Concua", amount: 1_000_000, deployed: 1_000_000 }]);
    expect(r.totalDeployed).toBe(1_000_000);
    expect(r.peakOutstanding).toBe(1_000_000);
    expect(r.reservationsPerMonth).toBe(2.63);
    expect(r.unfunded).toBe(0);
    expect(r.adSpendPerMonth).toBe(6_575);
    expect(r.noteSalesPerMonth).toBe(2.63);
    expect(r.lotsNeeded).toBe(41.12);
    expect(r.flaggedMonths).toBe(0);
    expect(r.daysEarlierThanCurrent).not.toBeNull();
  });

  it("is minimal: a slower pace or one farm fewer misses the target", () => {
    const slower = runOracle({ ...plan.required.params, lotsPerMonth: plan.required.closingsPerMonth - 0.05 }, plan.goal, plan.startInventory, realm.asOf, oracleOpts);
    expect(slower.targetAtDeadline).toBeLessThan(3_000_000);
    const fewer = runOracle({ ...plan.required.params, farmsToBuy: (plan.required.params.farmsToBuy ?? []).slice(0, -1) }, plan.goal, plan.startInventory, realm.asOf, oracleOpts);
    expect(fewer.targetAtDeadline).toBeLessThan(3_000_000);
  });

  it("the buffer column is the required plan plus one farm bought with the last", () => {
    const { required, buffer } = plan;
    expect(buffer.id).toBe("required_plus_buffer");
    expect(buffer.closingsPerMonth).toBe(required.closingsPerMonth);
    expect(buffer.farmsToBuy).toBe(required.farmsToBuy + 1);
    expect(buffer.capitalToRaise).toBe(required.capitalToRaise + inputs.farmCost);
    expect(buffer.lastPurchaseMonth).toBe(required.lastPurchaseMonth);
    expect(buffer.exitDate).toBe(required.exitDate);
    expect(buffer.inventoryAtDeadline).toBe(round2(required.inventoryAtDeadline + inputs.lotsPerFarm));
    expect(buffer.funding.map((f) => [f.name, f.amount])).toEqual([["Kevin Concua", 1_000_000], ["Townson Family", 500_000]]);
    expect(plan.all.map((c) => c.id)).toEqual(["current_pace", "required_plan", "required_plus_buffer"]);
  });

  it("the current-pace column runs the trailing averages with the real farm cadence and flags farms bought too late", () => {
    const c = plan.current;
    expect(c.closingsPerMonth).toBe(realm.oracleDefaults.lotsPerMonth);
    // the cadence since Mar 2026: Beta (Mar 1) to Gamma (Apr 1), one gap of 31 days; Alpha's January funding is out
    expect(realm.farmCadence).toMatchObject({ months: 1.02, farms: 2, excluded: 1, fundingDates: ["2026-03-01", "2026-04-01"], sinceLabel: "since Mar 2026" });
    expect(realm.oracleDefaults.newFarmEveryMonths).toBe(1.02);
    expect(c.params.farmsToBuy).toEqual(cadenceSchedule(realm.oracleDefaults.newFarmEveryMonths));
    expect(c.premise).toContain("a farm every 1.02 months (since Mar 2026)");
    expect(c.rows).toHaveLength(16);
    expect(c.daysEarlierThanCurrent).toBe(0);
    expect(c.rows.filter((r) => r.flags.includes("too_late")).map((r) => r.monthIndex)).toEqual([12, 13, 14, 15, 16]);
    expect(c.flaggedMonths).toBe(5);
    // over the whole history the January funding stretches the cadence to 1.48 months and one flagged month drops out
    const allTime = buildRealm(realm.snapshot, ASOF, { eraStart: null });
    expect(allTime.farmCadence).toMatchObject({ months: 1.48, farms: 3, excluded: 0, sinceLabel: null });
    const allTimeCurrent = solveWarPlan({ ...inputs, cycleMonths: null }, allTime).current;
    expect(allTimeCurrent.premise).toContain("a farm every 1.48 months —");
    expect(allTimeCurrent.rows.filter((r) => r.flags.includes("too_late")).map((r) => r.monthIndex)).toEqual([12, 13, 15, 16]);
  });

  it("rows run month by month from today to the deadline with cumulative figures in the chosen mode", () => {
    const rows = plan.required.rows;
    expect(rows).toHaveLength(16);
    expect(rows[0]?.date).toBe("2026-09-30");
    expect(rows[1]?.date).toBe("2026-10-31");
    expect(rows.at(-1)?.date).toBe("2027-12-31");
    expect(rows.reduce((a, r) => a + r.farmsBought, 0)).toBe(2);
    expect(rows.reduce((a, r) => a + r.capitalDeployed, 0)).toBe(1_000_000);
    expect(rows[6]).toMatchObject({ farmsBought: 1, capitalDeployed: 500_000 });
    expect(rows[0]?.cumulativeNet).toBe(plan.required.result.series[0]?.cumulativeNetProfit);
    expect(rows.at(-1)?.cumulativeNet).toBeGreaterThanOrEqual(3_000_000);
    expect(rows.at(-1)?.capitalReturned).toHaveLength(inputs.investorMix.length);
    expect(rows.at(-1)?.capitalReturned[0]).toBeGreaterThan(0);
    expect(rows.at(-1)?.capitalOwed).toBeLessThan(rows[0]?.capitalOwed ?? 0);
    expect(rows.every((r) => r.flags.length === 0)).toBe(true);
    for (let i = 1; i < rows.length; i++) expect(rows[i]?.cumulativeNet).toBeGreaterThanOrEqual(rows[i - 1]?.cumulativeNet ?? 0);
  });

  it("cash mode needs materially more lots than profit mode and stops closing before the deadline", () => {
    const cash = solveWarPlan({ ...inputs, targetMode: "cash_in_bank" }, realm);
    expect(cash.feasible).toBe(true);
    expect(cash.noteLag).toBe(2);
    expect(cash.maxPurchaseMonth).toBe(plan.maxPurchaseMonth - cash.noteLag);
    expect(cash.lastClosingDate).toBe("2027-10-31");
    expect(cash.required.lotsNeeded).toBeGreaterThan(plan.required.lotsNeeded * 1.5);
    expect(cash.required.closingsPerMonth).toBeGreaterThan(plan.required.closingsPerMonth);
    expect(cash.required.farmsToBuy).toBeGreaterThan(plan.required.farmsToBuy);
    expect(cash.required.hitsDeadline).toBe(true);
    expect(cash.required.rows.at(-1)?.cumulativeNet).toBeGreaterThanOrEqual(3_000_000);
    // November and December 2027 only harvest notes
    expect(cash.required.rows.slice(14).map((r) => r.lotsClosed)).toEqual([0, 0]);
    expect(cash.required.rows.slice(14).every((r) => r.notesSold > 0)).toBe(true);
    // cash mode starts below profit mode: sponsors are still owed their capital
    expect(cash.required.rows[0]?.cumulativeNet).toBeLessThan(plan.required.rows[0]?.cumulativeNet ?? 0);
    expect(cash.verdict).toContain("until Oct 2027 (then only note sales)");
    // months where the pace outruns the inventory before the first farm lands are flagged
    expect(cash.required.rows.filter((r) => r.flags.includes("shortfall")).length).toBeGreaterThan(0);
  });

  it("smaller farms mean more of them, never fewer", () => {
    const small = solveWarPlan({ ...inputs, lotsPerFarm: 5, farmCost: 250_000 }, realm);
    expect(small.required.farmsToBuy).toBe(3);
    expect(small.required.farmsToBuy).toBeGreaterThanOrEqual(plan.required.farmsToBuy);
    expect(small.required.capitalToRaise).toBe(750_000);
  });

  it("funds farms in the order of the mix and flags what the mix cannot cover", () => {
    const reversed = solveWarPlan({ ...inputs, investorMix: [...inputs.investorMix].reverse() }, realm);
    expect(reversed.required.funding.map((f) => [f.name, f.amount])).toEqual([["Grace Hopper", 400_000], ["Townson Family", 500_000], ["Kevin Concua", 100_000]]);
    expect(reversed.required.funding.reduce((a, f) => a + f.amount, 0)).toBe(reversed.required.capitalToRaise);
    // the deal mix changes the pace: Townson's 50 % share leaves less net per lot than Kevin's interest
    expect(reversed.required.closingsPerMonth).toBeGreaterThan(plan.required.closingsPerMonth);

    const tiny = solveWarPlan({ ...inputs, investorMix: inputs.investorMix.map((e) => ({ ...e, capital: 100_000 })) }, realm);
    expect(tiny.required.funding).toHaveLength(6);
    expect(tiny.required.unfunded).toBe(400_000);
    expect(tiny.required.funding.reduce((a, f) => a + f.amount, 0) + tiny.required.unfunded).toBe(tiny.required.capitalToRaise);
    expect(tiny.verdict).toContain("unfunded $400K");
  });

  it("the verdict names the farms, the last purchase, the money, the pace and the ads", () => {
    expect(plan.verdict).toBe(
      "Buy 2 farms, the last one no later than Apr 2027, raise $1.0M (Kevin Concua $1.0M), close 2.6 lots/month, sell 2.6 notes/month and spend at least $7K/month on ads.",
    );
    expect(plan.verdict).toMatch(/\$[\d.,]+[KM]?/);
    expect(plan.verdict).toMatch(/\b\d+ farms?\b/);
  });

  it("changing the deadline changes the verdict", () => {
    const later = solveWarPlan({ ...inputs, deadline: "2028-12-31" }, realm);
    expect(later.verdict).not.toBe(plan.verdict);
    expect(later.deadlineMonthIndex).toBe(28);
    expect(later.required.closingsPerMonth).toBeLessThan(plan.required.closingsPerMonth);
    expect(later.required.lastPurchaseDate).toBe("2028-04-30");
    expect(later.required.rows).toHaveLength(28);
  });

  it("speaks plainly when the deadline has passed, the target is met, or nothing reaches it", () => {
    const past = solveWarPlan({ ...inputs, deadline: "2026-01-01" }, realm);
    expect(past.feasible).toBe(false);
    expect(past.deadlineMonthIndex).toBe(0);
    expect(past.verdict).toBe("The deadline 2026-01-01 is not in the future: no plan can add closings before it, so buy 0 farms and raise $0.");
    expect(past.required.farmsToBuy).toBe(0);
    expect(past.buffer.farmsToBuy).toBe(0);
    expect(past.required.rows).toHaveLength(1);
    expect(past.all.every((c) => c.flaggedMonths === 0)).toBe(true);

    const met = solveWarPlan({ ...inputs, target: 100_000 }, realm);
    expect(met.feasible).toBe(true);
    expect(met.verdict).toBe("The target is already met: $100K is in hand, buy 0 farms and raise $0.");
    expect(met.required.closingsPerMonth).toBe(0);
    expect(met.required.capitalToRaise).toBe(0);
    expect(met.buffer.farmsToBuy).toBe(0);

    const impossible = solveWarPlan({ ...inputs, target: 50_000_000 }, realm);
    expect(impossible.feasible).toBe(false);
    expect(impossible.required.closingsPerMonth).toBe(60);
    expect(impossible.required.hitsDeadline).toBe(false);
    expect(impossible.verdict).toMatch(
      /^No pace reaches \$50\.0M by 2027-12-31: even 60\.0 lots\/month with \d+ farms and \$[\d.]+M raised \(.*unfunded \$[\d.]+M\) lands at \$[\d.]+M\. Push the deadline or lower the target\.$/,
    );
  });
});

describe("rotation engine: the capital cycle", () => {
  const kevin = investor({ name: "Kevin Concua" });
  const townson = investor({ name: "Townson Family" });
  // Delta: $300,000 funded 2026-01-01, every dollar back by 2026-06-30 (181 days) — the benchmark.
  const delta = farm({ farm_name: "Delta", total_lots: 6, investor_id: kevin.id, investor_capital: 300_000, deal_type: "fixed_interest", annual_interest_rate: 20, funding_date: "2026-01-01", closing_date: "2026-01-01" });
  // Echo: $600,000 funded 2026-03-01, a third back so far.
  const echo = farm({ farm_name: "Echo", total_lots: 12, investor_id: townson.id, investor_capital: 600_000, deal_type: "profit_share", annual_interest_rate: 0, profit_share_pct: 50, funding_date: "2026-03-01", closing_date: "2026-03-01" });
  // Foxtrot: $400,000 funded 2026-08-01, nothing back yet.
  const foxtrot = farm({ farm_name: "Foxtrot", total_lots: 8, investor_id: kevin.id, investor_capital: 400_000, deal_type: "fixed_interest", annual_interest_rate: 20, funding_date: "2026-08-01", closing_date: "2026-08-01" });
  const properties: ReturnType<typeof property>[] = [];
  const fileCases: ReturnType<typeof fileCase>[] = [];
  for (let i = 1; i <= 6; i++) {
    const p = property(delta.id, i, { name: `Delta — Lot ${i}` });
    properties.push(p);
    fileCases.push(fileCase(p.id, { status: "completed", reservation_date: "2026-02-01", closing_date: `2026-0${Math.min(9, 2 + i)}-15`, sale_price: 120_000 }));
  }
  for (let i = 1; i <= 12; i++) {
    const p = property(echo.id, i, { name: `Echo — Lot ${i}` });
    properties.push(p);
    if (i <= 4) fileCases.push(fileCase(p.id, { status: "completed", reservation_date: "2026-04-01", closing_date: "2026-07-10", sale_price: 120_000 }));
  }
  for (let i = 1; i <= 8; i++) properties.push(property(foxtrot.id, i, { name: `Foxtrot — Lot ${i}` }));
  const distributions = [
    distribution(delta.id, { investor_id: kevin.id, distribution_date: "2026-03-01", amount: 100_000 }),
    distribution(delta.id, { investor_id: kevin.id, distribution_date: "2026-05-01", amount: 120_000 }),
    distribution(delta.id, { investor_id: kevin.id, distribution_date: "2026-06-30", amount: 80_000 }),
    distribution(delta.id, { investor_id: kevin.id, distribution_date: "2026-06-30", amount: 15_000, kind: "interest" }),
    distribution(echo.id, { investor_id: townson.id, distribution_date: "2026-08-01", amount: 200_000 }),
  ];
  const snap = snapshot({ farmAcquisitions: [delta, echo, foxtrot], properties, fileCases, investorDistributions: distributions, investors: [kevin, townson] });
  // The engine's mechanics, measured over the whole history (Delta was funded before the era; see "the era" below).
  const realm = buildRealm(snap, ASOF, { eraStart: null });
  const b = realm.rotation;

  it("derives the cycle from funding_date to the day cumulative capital_return reached 100 % on the freed farm — never a constant", () => {
    expect(realm.liberation.freedHostages.map((h) => [h.farmName, h.freedAt, h.daysHeld])).toEqual([["Delta", "2026-06-30", 180]]);
    expect(b.source).toBe("freed_farms");
    expect(b.cycleDays).toBe(180);
    expect(b.cycleMonths).toBe(5.91);
    expect(b.benchmark).toMatchObject({ farmName: "Delta", investorName: "Kevin Concua", fundingDate: "2026-01-01", liberationDate: "2026-06-30", days: 180, months: 5.91, projected: false });
    expect(b.cycles).toHaveLength(1);
    expect(b.excludedCycles).toEqual([]);
    expect(b.since).toBeNull();
    expect(b.turnsCompleted).toBe(1);
    expect(b.capitalOutstanding).toBe(400_000 + 400_000);
    expect(realm.warPlanDefaults.inputs.cycleMonths).toBe(5.91);
    expect(realm.warPlanDefaults.real).toMatchObject({ cycleDays: 180, cycleMonths: 5.91, cycleSource: "freed_farms", cycleFarms: 1, cycleExcludedFarms: [], eraSince: null });
  });

  it("the era: a freed farm funded before ERA_START keeps its turn on record but out of the median; the cycle is projected from the captive era farms and nothing is graded", () => {
    const era = buildRealm(snap, ASOF);
    const e = era.rotation;
    expect(era.era?.since).toBe("since Mar 2026");
    expect(e.since).toBe("2026-03-01");
    expect(e.sinceLabel).toBe("since Mar 2026");
    expect(e.excludedCycles.map((c) => [c.farmName, c.days, c.projected])).toEqual([["Delta", 180, false]]);
    expect(e.source).toBe("projected");
    expect(e.cycles.every((c) => c.projected)).toBe(true);
    expect(e.cycles.map((c) => c.farmName).sort()).toEqual(["Echo", "Foxtrot"]);
    expect(e.cycleDays).not.toBeNull();
    expect(e.curve).toEqual([]);
    expect(e.grades.filter((g) => g.verdict !== "benchmark").every((g) => g.verdict === "unrated")).toBe(true);
    // liberation keeps the full history
    expect(e.turnsCompleted).toBe(1);
    expect(era.liberation.freedHostages.map((h) => h.farmName)).toEqual(["Delta"]);
    expect(era.warPlanDefaults.inputs.cycleMonths).toBe(e.cycleMonths);
    expect(era.warPlanDefaults.real).toMatchObject({ cycleSource: "projected", cycleFarms: 2, cycleExcludedFarms: ["Delta"], eraSince: "since Mar 2026" });
    // an era funded farm that is freed is the benchmark again
    const echoFreed = buildRealm(
      snapshot({
        farmAcquisitions: [delta, echo, foxtrot],
        properties,
        fileCases,
        investorDistributions: [...distributions, distribution(echo.id, { investor_id: townson.id, distribution_date: "2026-09-01", amount: 400_000 })],
        investors: [kevin, townson],
      }),
      ASOF,
    );
    expect(echoFreed.rotation).toMatchObject({ source: "freed_farms", cycleDays: 184, since: "2026-03-01" });
    expect(echoFreed.rotation.benchmark?.farmName).toBe("Echo");
    expect(echoFreed.rotation.excludedCycles.map((c) => c.farmName)).toEqual(["Delta"]);
    expect(echoFreed.rotation.curve.length).toBeGreaterThan(0);
    expect(echoFreed.rotation.turnsCompleted).toBe(2);
  });

  it("draws the benchmark curve from the capital_return distributions, interest excluded", () => {
    expect(b.curve).toEqual([
      { day: 59, pct: 33.33, date: "2026-03-01" },
      { day: 120, pct: 73.33, date: "2026-05-01" },
      { day: 180, pct: 100, date: "2026-06-30" },
    ]);
  });

  it("grades every other sponsor farm against the benchmark at the same point in its life", () => {
    const echoGrade = b.grades.find((g) => g.farmName === "Echo");
    // 194 days in, a third returned; Delta had everything back by day 180 and a third by day 59
    expect(echoGrade).toMatchObject({
      verdict: "behind",
      daysElapsed: 194,
      pctReturned: 33.33,
      benchmarkPctAtSameDay: 100,
      pctVsBenchmark: -66.67,
      benchmarkDaysToSamePct: 59,
      daysVsBenchmark: -135,
      freed: false,
    });
    const foxGrade = b.grades.find((g) => g.farmName === "Foxtrot");
    // 41 days in with nothing back — so was Delta at day 41
    expect(foxGrade).toMatchObject({ verdict: "on_pace", daysElapsed: 41, pctReturned: 0, benchmarkPctAtSameDay: 0, pctVsBenchmark: 0, benchmarkDaysToSamePct: null, daysVsBenchmark: null });
    expect(b.grades.find((g) => g.farmName === "Delta")?.verdict).toBe("benchmark");
    // Echo needs one more $120,000 lot to cover its $600,000; Foxtrot needs four (plus interest) — both projected at the current pace
    expect(echoGrade?.lotsLeftToCover).toBe(1);
    expect(echoGrade?.daysToGo).toBeGreaterThan(0);
    expect(foxGrade?.lotsLeftToCover).toBe(4);
    expect(foxGrade?.daysToGo as number).toBeGreaterThan(echoGrade?.daysToGo as number);
    expect(echoGrade?.projectedLiberationDate).toBe(iso(new Date(ASOF.getTime() + (echoGrade?.daysToGo as number) * 86_400_000)));
    expect(b.nextLiberation?.farmName).toBe("Echo");
    expect(b.grades.find((g) => g.farmName === "Delta")).toMatchObject({ daysToGo: 0, projectedLiberationDate: "2026-06-30" });
  });

  it("recycles a sponsor's returned capital into later farms: the peak outstanding is below the total deployed once a turn completes before a later purchase", () => {
    const d = realm.warPlanDefaults.inputs;
    const long = solveWarPlan({ ...d, target: 4_000_000, deadline: "2029-12-31", seasonal: false }, realm);
    expect(long.feasible).toBe(true);
    const rot = long.rotation;
    expect(rot.cycleMonths).toBe(5.91);
    expect(rot.farms).toBeGreaterThan(1);
    expect(rot.recycled).toBeGreaterThan(0);
    expect(rot.peakOutstanding).toBeLessThan(rot.totalDeployed);
    expect(rot.newMoney).toBe(long.required.capitalToRaise);
    expect(round2(rot.newMoney + rot.recycled)).toBe(rot.totalDeployed);
    expect(rot.turnsNeeded).toBe(round2(rot.totalDeployed / rot.peakOutstanding));
    expect(rot.turnsNeeded as number).toBeGreaterThan(1);
    expect(rot.turnsCompleted).toBe(1);
    // every recycled dollar came from a farm whose turn completed before the purchase that reused it
    for (const f of long.required.schedule) {
      if (f.recycled > 0) {
        expect(long.required.schedule.some((g) => g.turnCompletesMonth !== null && g.turnCompletesMonth <= f.purchaseMonth)).toBe(true);
      }
    }
    expect(rot.headline).toMatch(/^With \$[\d.]+[KM] of land capital rotating every 5\.9 months you reach \$4\.0M by the deadline; you need [\d.]+ turns?; the first turn must start by [A-Z][a-z]{2} \d{4}\./);
    expect(rot.headline).toMatch(/\b\d+(\.\d)? turns?\b/);
    expect(rot.perInvestor.every((i) => i.turns >= 1 && i.deployed >= i.fresh)).toBe(true);
    expect(round2(rot.perInvestor.reduce((a, i) => a + i.fresh, 0) + long.required.unfunded)).toBe(rot.newMoney);
  });

  it("without a turn completing before a later purchase the peak equals the total, and every such farm is flagged", () => {
    const d = realm.warPlanDefaults.inputs;
    // a 14-month cycle: no farm bought inside the 16 months to the deadline is back before a later purchase
    const plan = solveWarPlan({ ...d, target: 3_000_000, cycleMonths: 14, seasonal: false }, realm);
    const rot = plan.rotation;
    expect(rot.farms).toBeGreaterThan(0);
    expect(rot.recycled).toBe(0);
    expect(rot.peakOutstanding).toBe(rot.totalDeployed);
    expect(rot.turnsNeeded).toBe(1);
    const incomplete = plan.required.schedule.filter((f) => !f.turnComplete);
    expect(rot.turnsIncomplete).toBe(incomplete.length);
    const flagged = plan.required.rows.filter((r) => r.flags.includes("turn_incomplete")).map((r) => r.monthIndex);
    expect(flagged).toEqual([...new Set(incomplete.map((f) => f.purchaseMonth))].sort((a, b) => a - b));
    if (incomplete.length > 0) expect(rot.headline).toContain(`${incomplete.length} of the ${rot.farms} turns cannot complete before the deadline.`);
  });

  it("with no capital cycle nothing rotates and the headline says the turn length is unknown", () => {
    const d = realm.warPlanDefaults.inputs;
    const plan = solveWarPlan({ ...d, target: 3_000_000, cycleMonths: null, seasonal: false }, realm);
    expect(plan.rotation.recycled).toBe(0);
    expect(plan.rotation.turnsIncomplete).toBe(0);
    expect(plan.required.rows.every((r) => !r.flags.includes("turn_incomplete"))).toBe(true);
    expect(plan.rotation.headline).toMatch(/^The length of a capital turn is unknown/);
    expect(plan.required.schedule.every((f) => f.turnCompletesMonth === null)).toBe(true);
  });

  it("falls back to a projected cycle when no farm is freed, and to null when nothing can be projected", () => {
    const captive = buildRealm(
      snapshot({ farmAcquisitions: [echo, foxtrot], properties: properties.filter((p) => p.farm_acquisition_id !== delta.id), fileCases: fileCases.filter((c) => properties.find((p) => p.id === c.property_id)?.farm_acquisition_id !== delta.id), investorDistributions: distributions.filter((x) => x.farm_acquisition_id !== delta.id), investors: [kevin, townson] }),
      ASOF,
    );
    expect(captive.liberation.freedHostages).toHaveLength(0);
    expect(captive.rotation.source).toBe("projected");
    expect(captive.rotation.cycles.every((c) => c.projected)).toBe(true);
    expect(captive.rotation.cycleDays).not.toBeNull();
    expect(captive.rotation.curve).toEqual([]);
    expect(captive.warPlanDefaults.inputs.cycleMonths).toBe(captive.rotation.cycleMonths);

    const own = buildRealm(snapshot({ farmAcquisitions: [farm({ farm_name: "Solo", total_lots: 5, investor_capital: 200_000 })] }), ASOF);
    expect(own.rotation).toMatchObject({ cycleDays: null, cycleMonths: null, source: null, benchmark: null, turnsCompleted: 0, nextLiberation: null });
    expect(own.warPlanDefaults.inputs.cycleMonths).toBeNull();
    expect(computeRotationBenchmark(own).grades).toEqual([]);
  });

  it("defaults the farm cost to the per-lot cost of the three most recent purchases", () => {
    // Foxtrot $50,000/lot (Aug), Echo $50,000/lot (Mar), Delta $50,000/lot (Jan)
    expect(recentLandCostPerLot(realm.farms, ASOF, 3, null)).toEqual({ perLot: 50_000, farms: ["Foxtrot", "Echo", "Delta"], since: null, sinceLabel: null });
    expect(recentLandCostPerLot(realm.farms, ASOF, 1, null)).toEqual({ perLot: 50_000, farms: ["Foxtrot"], since: null, sinceLabel: null });
    // a farm dated after asOf is not a purchase yet
    const future = { ...(realm.farms[0] as NonNullable<(typeof realm.farms)[0]>), name: "Later", fundingDate: "2026-12-01", closingDate: "2026-12-01", landCostPerLot: 90_000 };
    expect(recentLandCostPerLot([...realm.farms, future], ASOF, 3, null).farms).not.toContain("Later");
    expect(recentLandCostPerLot([], ASOF)).toEqual({ perLot: null, farms: [], since: "2026-03-01", sinceLabel: "since Mar 2026" });
    expect(realm.warPlanDefaults.inputs.farmCost).toBe(500_000);
  });

  it("the era: the land-cost trend only looks at purchases since ERA_START, so Delta (Jan 2026) drops out and a dearer era purchase moves the default", () => {
    expect(recentLandCostPerLot(realm.farms, ASOF)).toEqual({ perLot: 50_000, farms: ["Foxtrot", "Echo"], since: "2026-03-01", sinceLabel: "since Mar 2026" });
    const dear = { ...(realm.farms[0] as NonNullable<(typeof realm.farms)[0]>), name: "Golf", fundingDate: "2026-06-01", closingDate: "2026-06-01", landCostPerLot: 80_000 };
    const cheapOld = { ...dear, name: "Hotel", fundingDate: "2025-12-01", closingDate: "2025-12-01", landCostPerLot: 20_000 };
    expect(recentLandCostPerLot([...realm.farms, dear, cheapOld], ASOF)).toMatchObject({ perLot: 60_000, farms: ["Foxtrot", "Golf", "Echo"] });
    expect(recentLandCostPerLot([...realm.farms, dear, cheapOld], ASOF, 3, null)).toMatchObject({ perLot: 60_000, farms: ["Foxtrot", "Golf", "Echo"] });
    expect(recentLandCostPerLot([...realm.farms, dear, cheapOld], ASOF, 5, null)).toMatchObject({ perLot: 50_000, farms: ["Foxtrot", "Golf", "Echo", "Delta", "Hotel"] });
    expect(recentLandCostPerLot([...realm.farms, dear, cheapOld], ASOF, 5)).toMatchObject({ perLot: 60_000, farms: ["Foxtrot", "Golf", "Echo"] });
    // an era that has not begun by asOf does not apply
    expect(recentLandCostPerLot(realm.farms, ASOF, 3, "2027-01-01")).toMatchObject({ farms: ["Foxtrot", "Echo", "Delta"], since: null });
  });
});

describe("cancellations count against conversion", () => {
  const sponsor = investor({ name: "Kevin Concua" });
  const f = farm({ farm_name: "Hotel", total_lots: 10, investor_id: sponsor.id, investor_capital: 500_000, deal_type: "fixed_interest", annual_interest_rate: 20, funding_date: "2026-01-01", closing_date: "2026-01-01" });
  const properties = Array.from({ length: 10 }, (_, i) => property(f.id, i + 1, { name: `Hotel — Lot ${i + 1}` }));
  const fileCases = [
    // 4 matured reservations closed, 2 still waiting, 2 cancelled (one re-reserved and live, one whose only case was cancelled)
    ...properties.slice(0, 4).map((p) => fileCase(p.id, { status: "completed", reservation_date: "2026-03-01", closing_date: "2026-05-01" })),
    ...properties.slice(4, 6).map((p) => fileCase(p.id, { status: "active", reservation_date: "2026-04-01" })),
    fileCase((properties[6] as NonNullable<(typeof properties)[6]>).id, { status: "cancelled", reservation_date: "2026-02-15" }),
    fileCase((properties[7] as NonNullable<(typeof properties)[7]>).id, { status: "cancelled", reservation_date: "2026-03-10" }),
    fileCase((properties[7] as NonNullable<(typeof properties)[7]>).id, { status: "active", reservation_date: "2026-08-20" }),
    // a young cancellation is a failure too, but not yet in the 90-day cohort
    fileCase((properties[8] as NonNullable<(typeof properties)[8]>).id, { status: "cancelled", reservation_date: "2026-08-01" }),
  ];
  const realm = buildRealm(snapshot({ farmAcquisitions: [f], properties, fileCases, investors: [sponsor] }), ASOF);

  it("a lot whose only file case was cancelled is available again and remembers the failed reservation", () => {
    const lot7 = realm.lots.find((l) => l.name === "Hotel — Lot 7");
    expect(lot7).toMatchObject({ stage: "available", cancelledFileCases: 1, cancelledReservationDate: "2026-02-15", reservationDate: null });
    const lot8 = realm.lots.find((l) => l.name === "Hotel — Lot 8");
    expect(lot8).toMatchObject({ stage: "reserved", cancelledFileCases: 1, cancelledReservationDate: null, reservationDate: "2026-08-20" });
    expect(realm.pipeline.cancelledReservations).toBe(2);
  });

  it("conversion with cancellations divides closings by live, closed and cancelled matured reservations", () => {
    const c = realm.pipeline.conversion;
    expect(c).toMatchObject({ cohort: 6, closed: 4, stillReserved: 2, pct: 66.67, cancelled: 1, cohortWithCancellations: 7, pctWithCancellations: 57.14, cancellationRatePct: 14.29 });
    expect(c.pctWithCancellations).toBe(round2((4 / 7) * 100));
    expect(c.cancellationRatePct).toBe(round2((1 / 7) * 100));
  });

  it("the War Plan spends ads and books reservations against the conversion that includes cancellations", () => {
    const d = realm.warPlanDefaults;
    expect(d.inputs.conversionPct).toBe(57.14);
    expect(d.real).toMatchObject({ conversionPct: 66.67, conversionWithCancellationsPct: 57.14, cancellationRatePct: 14.29, cancelledReservations: 2 });
    const plan = solveWarPlan({ ...d.inputs, target: 1_000_000, seasonal: false }, realm);
    const r = plan.required;
    expect(r.closingsPerMonth).toBeGreaterThan(0);
    expect(r.adSpendPerMonth).toBe(round2((r.closingsPerMonth / 0.5714) * 2_500));
    expect(r.reservationsPerMonth).toBe(round2(r.closingsPerMonth / 0.5714));
    expect(r.reservationsPerMonth).toBeGreaterThan(r.closingsPerMonth);
  });
});

describe("seasonality: the month-of-year shape of closings", () => {
  const sold = (dates: string[]) =>
    dates.map((d, i) => ({ stage: "closed" as const, closeDate: d, propertyId: `p${i}` })) as unknown as Parameters<typeof computeSeasonality>[0];

  it("is flat with no closings", () => {
    const s = computeSeasonality([]);
    expect(s.closings).toBe(0);
    expect(s.factors).toEqual(Array.from({ length: 12 }, () => 1));
    expect(s.peakMonth).toBeNull();
  });

  it("smooths a single busy month over its neighbours, floors the rest at 25 % and keeps the average at 1", () => {
    const s = computeSeasonality(sold(["2026-05-01", "2026-05-10", "2026-05-20", "2026-05-30"]), undefined, { minMonths: 0 });
    expect(s.applied).toBe(true);
    expect(s.closings).toBe(4);
    expect(s.counts[4]).toBe(4);
    expect(s.peakMonth).toBe(4);
    expect(s.factors[4]).toBeGreaterThan(s.factors[3] as number);
    expect(s.factors[3]).toBe(s.factors[5]);
    expect(s.factors[3]).toBeGreaterThan(0.25);
    expect(Math.min(...s.factors)).toBe(0.25);
    expect(round2(s.factors.reduce((a, b) => a + b, 0) / 12)).toBe(1);
    expect(round2(s.shares.reduce((a, b) => a + b, 0))).toBe(1);
    // December wraps to January
    const dec = computeSeasonality(sold(["2026-12-05", "2026-12-15"]), undefined, { minMonths: 0 });
    expect(dec.factors[0]).toBe(dec.factors[10]);
    expect(dec.factors[0]).toBeGreaterThan(0.25);
  });

  it("ignores closings after asOf and unsold lots", () => {
    const lots = [
      ...sold(["2026-05-01", "2026-06-01"]),
      { stage: "reserved", closeDate: null, propertyId: "r" },
      { stage: "closed", closeDate: "2026-10-01", propertyId: "future" },
    ] as unknown as Parameters<typeof computeSeasonality>[0];
    const s = computeSeasonality(lots, ASOF, { minMonths: 0 });
    expect(s.closings).toBe(2);
    expect(s.counts[9]).toBe(0);
  });

  it("the era: closings before ERA_START are left out, and with fewer than 12 months of history since then no profile is applied at all", () => {
    const lots = sold(["2025-08-01", "2025-08-10", "2026-05-01", "2026-06-01"]);
    const s = computeSeasonality(lots, ASOF);
    expect(s.excluded).toBe(2);
    expect(s.closings).toBe(2);
    expect(s.counts[7]).toBe(0);
    expect(s.since).toBe("2026-03-01");
    expect(s.sinceLabel).toBe("since Mar 2026");
    expect(s.monthsOfHistory).toBe(6);
    expect(s.monthsRequired).toBe(12);
    expect(s.applied).toBe(false);
    expect(s.reason).toBe("not enough history for seasonality");
    expect(s.factors).toEqual(Array.from({ length: 12 }, () => 1));
    expect(s.peakMonth).toBeNull();
    // twelve whole months on: applied, from the first day of the anniversary month
    const later = computeSeasonality(lots, new Date("2027-03-01T00:00:00Z"));
    expect(later.monthsOfHistory).toBe(12);
    expect(later.applied).toBe(true);
    expect(later.reason).toBeNull();
    expect(computeSeasonality(lots, new Date("2027-02-28T00:00:00Z")).applied).toBe(false);
    // without an era every closing counts and the history runs from the first closing
    const all = computeSeasonality(lots, ASOF, { eraStart: null });
    expect(all.excluded).toBe(0);
    expect(all.closings).toBe(4);
    expect(all.since).toBeNull();
    expect(all.monthsOfHistory).toBe(13);
    expect(all.applied).toBe(true);
  });

  it("normalises the factors over the plan window so the flat pace stays the average", () => {
    const grid = buildMonthGrid(ASOF, new Date("2027-12-31T00:00:00Z"), true);
    const factors = computeSeasonality(sold(["2026-05-01", "2026-05-10", "2026-07-01"]), undefined, { minMonths: 0 }).factors;
    const scaled = normalizeSeasonality(factors, grid.months, grid.deadlineIndex);
    let weight = 0;
    let weighted = 0;
    for (let m = 1; m <= grid.deadlineIndex; m++) {
      const mo = grid.months[m - 1] as NonNullable<(typeof grid.months)[0]>;
      weight += mo.fraction;
      weighted += mo.fraction * (scaled[mo.end.getUTCMonth()] as number);
    }
    expect(round2(weighted / weight)).toBe(1);
    expect(normalizeSeasonality(factors, [], 0)).toEqual(factors.map(() => 1));
  });

  it("shapes the required plan month by month while the flat average is shown alongside; off, every factor is 1", () => {
    const sponsor = investor({ name: "Kevin Concua" });
    const f = farm({ farm_name: "India", total_lots: 40, investor_id: sponsor.id, investor_capital: 2_000_000, deal_type: "fixed_interest", annual_interest_rate: 20, funding_date: "2026-01-01", closing_date: "2026-01-01" });
    const properties = Array.from({ length: 40 }, (_, i) => property(f.id, i + 1, { name: `India — Lot ${i + 1}` }));
    const summer = ["2026-06-05", "2026-06-15", "2026-07-05", "2026-07-15", "2026-07-25", "2026-08-05"];
    const fileCases = summer.map((d, i) => fileCase((properties[i] as NonNullable<(typeof properties)[0]>).id, { status: "completed", reservation_date: "2026-04-01", closing_date: d }));
    const realm = buildRealm(snapshot({ farmAcquisitions: [f], properties, fileCases, investors: [sponsor] }), ASOF);
    const d = realm.warPlanDefaults.inputs;
    // Six months since ERA_START: the realm's profile is not applied, the default is off and the plan is flat even when asked to shape.
    expect(realm.seasonality.applied).toBe(false);
    expect(realm.seasonality.reason).toBe("not enough history for seasonality");
    expect(d.seasonal).toBe(false);
    expect(realm.warPlanDefaults.real.seasonalityApplied).toBe(false);
    expect(realm.warPlanDefaults.real.seasonalityReason).toBe("not enough history for seasonality");
    const tooShort = solveWarPlan({ ...d, target: 2_000_000, seasonal: true }, realm);
    expect(tooShort.seasonality).toEqual(Array.from({ length: 12 }, () => 1));
    expect(tooShort.required.rows.every((r) => r.seasonalFactor === 1)).toBe(true);
    // With enough history the same closings shape the plan.
    const ctx = { ...realm, seasonality: computeSeasonality(realm.lots, ASOF, { minMonths: 0 }) };
    expect(ctx.seasonality.applied).toBe(true);
    const seasonal = solveWarPlan({ ...d, target: 2_000_000, seasonal: true }, ctx);
    const flat = solveWarPlan({ ...d, target: 2_000_000, seasonal: false }, ctx);
    expect(seasonal.seasonality).toHaveLength(12);
    expect(flat.seasonality).toEqual(Array.from({ length: 12 }, () => 1));
    const rows = seasonal.required.rows;
    expect(rows.every((r) => r.flatLotsClosed === (r.monthIndex === 1 ? r.flatLotsClosed : seasonal.required.closingsPerMonth))).toBe(true);
    const july = rows.find((r) => r.date === "2027-07-31") as NonNullable<(typeof rows)[0]>;
    const january = rows.find((r) => r.date === "2027-01-31") as NonNullable<(typeof rows)[0]>;
    expect(july.seasonalFactor).toBeGreaterThan(1);
    expect(january.seasonalFactor).toBeLessThan(1);
    expect(july.lotsClosed).toBeCloseTo(july.flatLotsClosed * july.seasonalFactor, 1);
    expect(january.lotsClosed).toBeLessThan(january.flatLotsClosed);
    // both plans close the same number of lots by the deadline and both hit the target
    const total = (r: typeof rows) => r.reduce((a, x) => a + x.lotsClosed, 0);
    expect(Math.abs(total(rows) - total(flat.required.rows))).toBeLessThan(0.5);
    expect(seasonal.required.hitsDeadline).toBe(true);
    expect(flat.required.rows.every((r) => r.seasonalFactor === 1 && r.lotsClosed === r.flatLotsClosed)).toBe(true);
    // the current-pace column is never shaped
    expect(seasonal.current.rows.every((r) => r.seasonalFactor === 1)).toBe(true);
  });
});
