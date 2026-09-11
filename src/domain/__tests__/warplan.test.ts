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
  solveWarPlan,
  sponsorLedger,
  usdCompact,
  warPlanMonthLabel,
  type WarPlanInputs,
} from "../warplan";
import { ASOF, farm, fileCase, investor, note, noteSale, property, snapshot } from "./builders";

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
  const inputs: WarPlanInputs = { ...realm.warPlanDefaults.inputs, target: 3_000_000 };
  const plan = solveWarPlan(inputs, realm);
  const oracleOpts = { calendarMonths: true, cashStart: plan.ledger.cashKept, owedStart: plan.ledger.owedToday };

  it("derives every default from the realm and prefills the sponsor mix, named sponsors first", () => {
    const d = realm.warPlanDefaults;
    expect(d.inputs).toMatchObject({
      target: 10_000_000,
      deadline: "2027-12-31",
      targetMode: "profit_at_closing",
      lotsPerFarm: 10,
      farmCost: 500_000,
      adSpendPerClosing: 2_500,
      conversionPct: 100,
      farmToFirstCloseMonths: 5.11,
      noteSaleLagMonths: realm.oracleDefaults.avgMonthsToSellNote,
    });
    expect(d.real).toMatchObject({ lotsPerFarm: 13.33, landCostPerLot: 50_000, conversionPct: 100, farmToFirstCloseMonths: 5.11, farmToFirstCloseFarms: 2, medianDaysToClose: 87.5, closingsPerMonth: 3.38, inventory: 30 });
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
    expect(r.funding).toEqual([{ mixIndex: 0, investorId: kevin.id, name: "Kevin Concua", amount: 1_000_000 }]);
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
    expect(c.params.farmsToBuy).toEqual(cadenceSchedule(realm.oracleDefaults.newFarmEveryMonths));
    expect(c.rows).toHaveLength(16);
    expect(c.daysEarlierThanCurrent).toBe(0);
    expect(c.rows.filter((r) => r.flags.includes("too_late")).map((r) => r.monthIndex)).toEqual([12, 13, 15, 16]);
    expect(c.flaggedMonths).toBe(4);
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
