/**
 * Phase 2 "Epic" numbers reproduced from the live snapshot (src/domain/__fixtures__/payments.json,
 * 2026-09-11). If the fixture is regenerated these change; document the drift in PROGRESS.md.
 */
import { describe, expect, it } from "vitest";
import raw from "../__fixtures__/payments.json";
import type { PaymentsSnapshot } from "../types";
import { buildRealm } from "../realm";
import { round2 } from "../math";
import { solveWarPlan } from "../warplan";

const fixture = raw as unknown as PaymentsSnapshot & { snapshotAt: string };
const ASOF = new Date("2026-09-11T00:00:00Z");
const realm = buildRealm(fixture, ASOF);

describe("fixture: THE DEBT", () => {
  it("owes $3,579,399.48 to sponsors on 7 open positions, with $790,000 of own capital tied up", () => {
    expect(realm.debt.capitalOwed).toBe(3_579_399.48);
    expect(realm.debt.openPositions).toBe(7);
    expect(realm.debt.ownCapitalOutstanding).toBe(790_000);
    // sponsor debt + own capital = the goal's capitalOutstanding over all subdivided farms
    expect(round2(realm.debt.capitalOwed + realm.debt.ownCapitalOutstanding)).toBe(realm.goal.capitalOutstanding);
  });

  it("has 476 days left and needs $16,234.65 of net profit per day", () => {
    expect(realm.debt.daysLeft).toBe(476);
    expect(realm.debt.requiredNetProfitPerDay).toBe(16_234.65);
    expect(realm.debt.requiredNetProfitPerDay).toBe(round2(realm.goal.remaining / 476));
    expect(realm.debt.actualNetProfitPerDay).toBe(6_762.81);
    expect(realm.debt.interestPerDay).toBe(1_253);
  });
});

describe("fixture: OXYGEN", () => {
  it("scores all 38 closed lots for 547 days gained in total", () => {
    expect(realm.oxygen.perLot.size).toBe(38);
    expect(realm.oxygen.totalDaysGained).toBe(547);
    expect(realm.oxygen.netProfitPerDayAtPace).toBe(8_644.24);
  });

  it("the latest closing (Promised Valley Lot 3, 2026-08-19) gained 5 days", () => {
    expect(realm.oxygen.latest?.lotName).toBe("Promised Valley — Lot 3");
    expect(realm.oxygen.latest?.daysGained).toBe(5);
    expect(realm.oxygen.latest?.paceThatDay).toBe(14_616.62);
  });

  it("the first closing in the realm (Lamar Lot 6) is worth the most days because the pace was slowest", () => {
    expect(realm.oxygen.best?.lotName).toBe("Lamar — Lot 6");
    expect(realm.oxygen.best?.daysGained).toBe(91);
    expect(realm.oxygen.best?.closeDate).toBe("2025-10-10");
  });

  it("the undated Eastland Lot 6 is measured at asOf", () => {
    const lot = realm.lots.find((l) => l.name === "Eastland — Lot 6");
    const o = realm.oxygen.perLot.get(lot?.propertyId ?? "");
    expect(o?.measuredOn).toBe("2026-09-11");
    expect(o?.daysGained).toBe(3);
  });
});

describe("fixture: INVESTOR LIBERATION", () => {
  it("has 8 hostage positions worth $4,197,648, 14.73 % returned", () => {
    expect(realm.liberation.hostages).toHaveLength(8);
    expect(realm.liberation.totalCapital).toBe(4_197_648);
    expect(realm.liberation.totalReturned).toBe(618_248.52);
    expect(realm.liberation.pctReturned).toBe(14.73);
  });

  it("Townson Family is freed of Lamar on 2026-05-19 after 271 days, but still held by Wichita (11.97 %)", () => {
    const lamar = realm.liberation.hostages.find((h) => h.farmName === "Lamar");
    expect(lamar?.investorName).toBe("Townson Family");
    expect(lamar?.freed).toBe(true);
    expect(lamar?.freedAt).toBe("2026-05-19");
    expect(lamar?.daysHeld).toBe(271);
    expect(lamar?.paidOnTop).toBe(175_741.94);
    const wichita = realm.liberation.hostages.find((h) => h.farmName === "Wichita");
    expect(wichita?.pctReturned).toBe(11.97);
    const townson = realm.liberation.sponsors.find((s) => s.name === "Townson Family");
    expect(townson?.freed).toBe(false);
    expect(townson?.pctReturned).toBe(36.98);
    expect(realm.liberation.freedSponsors).toHaveLength(0);
    expect(realm.liberation.moments.map((m) => m.date)).toEqual(["2026-05-19"]);
  });

  it("the chronicle carries exactly one liberation event", () => {
    const ev = realm.events.filter((e) => e.kind === "liberation");
    expect(ev).toHaveLength(1);
    expect(ev[0]?.title).toBe("Townson Family freed");
    expect(ev[0]?.cumulativeNetProfit).toBe(784_793.14);
  });
});

describe("fixture: FARM CAMPAIGNS", () => {
  const byName = Object.fromEntries(realm.campaigns.map((c) => [c.farmName, c]));

  it("classifies the nine farms", () => {
    expect(Object.fromEntries(realm.campaigns.map((c) => [c.farmName, c.state]))).toEqual({
      Lamar: "conquered",
      Eastland: "conquered",
      Freestone: "conquered",
      "Promised Valley": "under_siege",
      Titus: "under_siege",
      Wichita: "under_siege",
      "Franklin 2": "under_siege",
      Avery: "losing_ground",
      Franklin: "losing_ground",
    });
  });

  it("sizes each campaign goal in lots", () => {
    expect(byName["Wichita"]?.lotsLeftToCover).toBe(3);
    expect(byName["Promised Valley"]?.lotsLeftToCover).toBe(2);
    expect(byName["Titus"]?.lotsLeftToCover).toBe(2);
    expect(byName["Avery"]?.lotsLeftToCover).toBe(5);
    expect(byName["Avery"]?.avgSalePriceSource).toBe("realm");
    expect(byName["Avery"]?.target).toBe(538_322.81);
    expect(byName["Franklin"]?.reason).toBe("interest accruing at 25% with no closing yet");
    expect(byName["Eastland"]?.recovered).toBe(1_097_950.8);
  });
});

describe("fixture: STREAKS", () => {
  it("best run is 3 consecutive weeks ending 2026-07-19; the streak is currently broken", () => {
    expect(realm.streaks.bestWeeks).toBe(3);
    expect(realm.streaks.bestWeeksEndedOn).toBe("2026-07-19");
    expect(realm.streaks.currentWeeks).toBe(0);
    expect(realm.streaks.closedThisWeek).toBe(false);
    expect(realm.streaks.weeks).toHaveLength(15);
  });

  it("best week is W22 2026 with 7 closings; best month May 2026 with 13", () => {
    expect(realm.streaks.bestWeek).toEqual({ week: "2026-W22", weekStart: "2026-05-25", count: 7, netProfit: 553_411.03 });
    expect(realm.streaks.bestMonth).toEqual({ month: "2026-05", count: 13, netProfit: 1_006_874.4 });
    expect(realm.streaks.bestMonths).toBe(5);
    expect(realm.streaks.currentMonths).toBe(5);
  });
});

describe("fixture: trophies with rarity", () => {
  it("has 25 trophies, 17 earned, every one with a rarity", () => {
    expect(realm.trophies).toHaveLength(25);
    expect(realm.trophies.filter((t) => t.earned)).toHaveLength(17);
    expect(realm.trophies.every((t) => ["common", "rare", "epic", "legendary"].includes(t.rarity))).toBe(true);
    const byId = Object.fromEntries(realm.trophies.map((t) => [t.id, t]));
    expect(byId["streak_weeks_3"]?.earned).toBe(true);
    expect(byId["busy_week_3"]?.earned).toBe(true);
    expect(byId["first_liberation"]?.earned).toBe(true);
    expect(byId["first_liberation"]?.earnedAt).toBe("2026-05-19");
    expect(byId["streak_weeks_6"]?.earned).toBe(false);
    expect(byId["all_free"]?.earned).toBe(false);
  });
});

describe("fixture: ORACLE futures", () => {
  it("three futures with exit dates, the required pace landing on the deadline month", () => {
    const f = realm.futures;
    expect(f.current.exitDate).toBe("2029-03-11");
    expect(f.current.hitsDeadline).toBe(false);
    expect(f.required.exitDate).toBe("2027-12-11");
    expect(f.required.hitsDeadline).toBe(true);
    expect(f.oneMoreFarm.exitDate).toBe("2028-11-11");
    expect(f.oneMoreFarm.daysEarlierThanCurrent).toBe(120);
    expect(f.oneMoreFarm.params.lotsPerMonth).toBe(5.03);
    expect(f.oneMoreFarm.startInventory).toBe(round2(71 + realm.oracleDefaults.avgLotsPerFarm));
  });
});

describe("fixture: NARRATED CHRONICLE and STORY", () => {
  it("narrates every event", () => {
    expect(realm.narrative.size).toBe(realm.events.length);
    const latest = realm.oxygen.latest as NonNullable<typeof realm.oxygen.latest>;
    expect(realm.narrative.get(`closing:${latest.propertyId}`)).toBe(
      "On August 19, Daniel Carrasquillo claimed Lot 3 of Promised Valley for $116,500. The realm gained 5 days.",
    );
    expect(realm.narrative.get("liberation:" + realm.liberation.moments[0]?.hostage.farmId)).toBe(
      "On May 19, Townson Family was freed: every coin of Lamar repaid ($475,000).",
    );
  });

  it("tells the story in six cards with the real figures", () => {
    const lines = realm.story.cards.map((c) => c.line);
    expect(lines).toEqual([
      "9 farms across 9 counties, cut into 109 lots.",
      "$4,197,648 lent by 5 sponsors. $3,579,399 still owed.",
      "38 lots closed for $2,272,304 of net profit — 22.7% of the ten million.",
      "Every closing bought time. 547 days gained toward the exit.",
      "Townson Family walked free of Lamar. 7 remain in chains.",
      "476 days left. $16,235 of net profit needed every single day.",
    ]);
  });
});

describe("fixture: PIPELINE (reservations layer)", () => {
  const p = realm.pipeline;

  it("33 reserved lots carry $2,222,188.97 of net profit — the same pipeline figure the goal reports", () => {
    expect(p.reserved).toBe(33);
    expect(p.pipelineNetProfit).toBe(2_222_188.97);
    expect(p.pipelineNetProfit).toBe(realm.goal.netProfitInPipeline);
  });

  it("21 reservations in the trailing 90 days are still waiting: 7.1/month vs 4.4 closings/month", () => {
    expect(p.newReservationsTrailing).toBe(21);
    expect(p.reservationsPerMonth).toBe(7.1);
    expect(p.reservationsMadeTrailing).toBe(22);
    expect(p.closedLotsPerMonth).toBe(4.4);
    expect(p.closedLotsPerMonth).toBe(realm.goal.closedLotsPerMonth);
  });

  it("of the 47 reservations made on or before 2026-06-13, 35 closed (74.47%)", () => {
    expect(p.conversion).toMatchObject({ cutoff: "2026-06-13", cohort: 47, closed: 35, stillReserved: 12, pct: 74.47 });
  });

  it("16 reservations are stuck past 60 days, trapping $1,116,862.67 of net profit on $2,024,531 of sales", () => {
    expect(p.stuckCount).toBe(16);
    expect(p.netProfitTrapped).toBe(1_116_862.67);
    expect(p.salePriceTrapped).toBe(2_024_531);
    expect(p.netProfitTrapped).toBe(round2(p.stuck.reduce((a, s) => a + s.netProfitAtStake, 0)));
    expect(p.stuck[0]).toMatchObject({ lotName: "Titus — Lot 2", buyerName: "Crystal Thompson", daysWaiting: 132, salePrice: 135_412, netProfitAtStake: 61_723.32, reservationDate: "2026-05-02" });
    expect(p.stuck.at(-1)).toMatchObject({ lotName: "Avery — Lot 5", daysWaiting: 67 });
    for (let i = 1; i < p.stuck.length; i++) expect(p.stuck[i - 1]!.daysWaiting).toBeGreaterThanOrEqual(p.stuck[i]!.daysWaiting);
    for (const s of p.stuck) expect(realm.lots.find((l) => l.propertyId === s.propertyId)?.stage).toBe("reserved");
  });

  it("Avery traps the most: 7 stuck lots, $616,838.59; Franklin 5, $314,478.15", () => {
    const byName = new Map(p.farms.map((f) => [f.farmName, f]));
    expect(byName.get("Avery")).toMatchObject({ reserved: 12, stuck: 7, netProfitTrapped: 616_838.59, medianDaysToClose: null });
    expect(byName.get("Franklin")).toMatchObject({ reserved: 5, stuck: 5, netProfitTrapped: 314_478.15 });
    expect(byName.get("Wichita")).toMatchObject({ reserved: 8, stuck: 3, netProfitTrapped: 123_822.61, medianDaysToClose: 63 });
    expect(byName.get("Titus")).toMatchObject({ stuck: 1, netProfitTrapped: 61_723.32 });
    expect(p.farms[0]?.farmName).toBe("Avery");
  });

  it("median reservation-to-closing is 63 days over 35 closed lots; Lamar 41.5, Promised Valley 90", () => {
    expect(p.medianDaysToClose).toBe(63);
    expect(p.closedWithBothDates).toBe(35);
    const byName = new Map(p.farms.map((f) => [f.farmName, f]));
    expect(byName.get("Lamar")?.medianDaysToClose).toBe(41.5);
    expect(byName.get("Promised Valley")?.medianDaysToClose).toBe(90);
    expect(byName.get("Freestone")?.medianDaysToClose).toBe(70);
    expect(byName.get("Eastland")?.medianDaysToClose).toBe(63);
  });

  it("changes nothing in the goal, pace, oxygen or debt", () => {
    expect(realm.goal.netProfitToDate).toBe(2_272_304.32);
    expect(realm.goal.closedLotsPerMonth).toBe(4.4);
    expect(realm.oxygen.totalDaysGained).toBe(547);
    expect(realm.debt.requiredNetProfitPerDay).toBe(16_234.65);
  });
});

describe("fixture: WAR PLAN (the Oracle in reverse)", () => {
  const d = realm.warPlanDefaults;
  const profit = solveWarPlan(d.inputs, realm);

  it("prefills every input from the realm: 10-lot farms at $482,320, 74.47 % conversion, 2.63 months to first close, five sponsors", () => {
    expect(d.inputs).toMatchObject({
      target: 10_000_000,
      deadline: "2027-12-31",
      targetMode: "profit_at_closing",
      lotsPerFarm: 10,
      farmCost: 482_320,
      adSpendPerClosing: 2_500,
      conversionPct: 74.47,
      farmToFirstCloseMonths: 2.63,
      noteSaleLagMonths: 3.17,
    });
    expect(d.real).toMatchObject({
      lotsPerFarm: 12.11,
      landCostPerLot: 48_232,
      conversionPct: 74.47,
      farmToFirstCloseMonths: 2.63,
      farmToFirstCloseFarms: 6,
      medianDaysToClose: 63,
      noteSaleLagMonths: 3.17,
      closingsPerMonth: 4.4,
      inventory: 71,
    });
    expect(d.inputs.investorMix.map((e) => [e.name, e.dealType, e.ratePct, e.capital])).toEqual([
      ["Kevin Concua", "fixed_interest", 20, 1_398_628],
      ["Townson Family", "profit_share", 50, 1_672_000],
      ["Julio Arriola", "fixed_interest", 25, 383_500],
      ["Rony Schumann", "fixed_interest", 18, 364_520],
      ["Doctores Motta", "fixed_interest", 20, 379_000],
    ]);
    expect(d.inputs.investorMix.every((e) => e.investorId !== null)).toBe(true);
    expect(round2(d.inputs.investorMix.reduce((a, e) => a + e.capital, 0))).toBe(realm.liberation.totalCapital);
  });

  it("owes sponsors $4,235,797.47 today ($3,579,399.48 of capital + $656,397.99 of unpaid take) and has kept $1,362,503.84 of cash", () => {
    expect(profit.ledger).toEqual({ capitalOwed: 3_579_399.48, paidOut: 793_990.46, unpaidTake: 656_397.99, cashKept: 1_362_503.84, owedToday: 4_235_797.47 });
    expect(profit.ledger.capitalOwed).toBe(realm.debt.capitalOwed);
  });

  it("profit mode: ≈8.3 closings/month and ≈130 lots still needed — 7 farms of 10 lots, the last by Jul 2027, $3.4M to raise", () => {
    expect(profit.feasible).toBe(true);
    expect(profit).toMatchObject({ deadlineMonthIndex: 16, monthsToDeadline: 15.63, landLag: 3, closeLag: 2, noteLag: 3, maxPurchaseMonth: 11, lastClosingDate: null, startInventory: 71 });
    const r = profit.required;
    expect(r.closingsPerMonth).toBeCloseTo(8.3, 0);
    expect(r.closingsPerMonth).toBe(8.44);
    expect(r.lotsNeeded).toBeCloseTo(130, -1);
    expect(r.lotsNeeded).toBe(131.95);
    expect(r.farmsToBuy).toBe(7);
    expect(r.lastPurchaseDate).toBe("2027-07-31");
    expect(r.capitalToRaise).toBe(7 * 482_320);
    expect(r.funding.map((f) => [f.name, f.amount])).toEqual([
      ["Kevin Concua", 1_398_628],
      ["Townson Family", 1_672_000],
      ["Julio Arriola", 305_612],
    ]);
    expect(r.unfunded).toBe(0);
    expect(r.adSpendPerMonth).toBe(28_333.56);
    expect(r.adSpendPerMonth).toBe(round2((8.44 / 0.7447) * 2_500));
    expect(r.noteSalesPerMonth).toBe(8.44);
    expect(r.exitDate).toBe("2027-12-31");
    expect(r.hitsDeadline).toBe(true);
    expect(r.targetAtDeadline).toBeGreaterThanOrEqual(10_000_000);
    expect(r.flaggedMonths).toBe(0);
    expect(r.rows).toHaveLength(16);
    expect(r.rows[0]).toMatchObject({ date: "2026-09-30", lotsClosed: 5.35, farmsBought: 0 });
    expect(r.rows.at(-1)).toMatchObject({ date: "2027-12-31", lotsClosed: 8.44, notesSold: 8.44, cumulativeNet: 10_008_439.6, inventory: 9.05 });
    expect(r.rows.at(-1)?.capitalReturned).toEqual([1_398_628, 1_511_996.8, 28_890.52, 0, 0]);
    expect(profit.verdict).toBe(
      "Buy 7 farms, the last one no later than Jul 2027, raise $3.4M (Kevin Concua $1.4M, Townson Family $1.7M, Julio Arriola $306K), close 8.4 lots/month, sell 8.4 notes/month and spend at least $28K/month on ads.",
    );
    expect(profit.verdict).toMatch(/\$[\d.,]+[KM]?/);
    expect(profit.verdict).toMatch(/\b\d+ farms?\b/);
  });

  it("with the blended 24.41 % take on new lots the answer is exactly the brief's 8.3 / 130 (8.27 lots/month, 129.29 lots); Townson's 50 % share costs the extra 0.17", () => {
    const blended = solveWarPlan(
      { ...d.inputs, investorMix: [{ investorId: null, name: "Blended", dealType: "profit_share", ratePct: realm.oracleDefaults.investorTakePct, capital: 1e9 }] },
      realm,
    );
    expect(realm.oracleDefaults.investorTakePct).toBe(24.41);
    expect(blended.required.closingsPerMonth).toBe(8.27);
    expect(blended.required.lotsNeeded).toBe(129.29);
    expect(blended.required.farmsToBuy).toBe(6);
    expect(blended.required.closingsPerMonth).toBeLessThan(profit.required.closingsPerMonth);
  });

  it("the buffer column adds one farm ($482,320) at the last purchase and still exits on the deadline", () => {
    const b = profit.buffer;
    expect(b.farmsToBuy).toBe(8);
    expect(b.capitalToRaise).toBe(profit.required.capitalToRaise + 482_320);
    expect(b.lastPurchaseDate).toBe("2027-07-31");
    expect(b.exitDate).toBe("2027-12-31");
    expect(b.inventoryAtDeadline).toBe(19.05);
    expect(b.unfunded).toBe(0);
  });

  it("the current pace (4.4/month, a farm every 1.72 months) lands at $6.4M on the deadline and exits 2029-04-22, its last two farms too late to convert", () => {
    const c = profit.current;
    expect(c.closingsPerMonth).toBe(4.4);
    expect(c.hitsDeadline).toBe(false);
    expect(c.exitDate).toBe("2029-04-22");
    expect(c.targetAtDeadline).toBe(6_385_331.52);
    expect(c.farmsToBuy).toBe(9);
    expect(c.unfunded).toBe(143_232);
    expect(c.rows.filter((r) => r.flags.includes("too_late")).map((r) => r.monthIndex)).toEqual([14, 15]);
    expect(c.flaggedMonths).toBe(2);
    expect(profit.required.daysEarlierThanCurrent).toBe(478);
  });

  it("cash mode needs materially more lots (258 vs 132): every note sells at 80 % and every sponsor is paid out first", () => {
    const cash = solveWarPlan({ ...d.inputs, targetMode: "cash_in_bank" }, realm);
    expect(cash.feasible).toBe(true);
    expect(cash.maxPurchaseMonth).toBe(8);
    expect(cash.lastClosingDate).toBe("2027-09-30");
    const r = cash.required;
    expect(r.lotsNeeded).toBe(258.1);
    expect(r.lotsNeeded).toBeGreaterThan(profit.required.lotsNeeded * 1.5);
    expect(r.closingsPerMonth).toBe(20.43);
    expect(r.farmsToBuy).toBe(19);
    expect(r.lastPurchaseDate).toBe("2027-04-30");
    expect(r.capitalToRaise).toBe(19 * 482_320);
    expect(r.unfunded).toBe(4_966_432);
    expect(r.funding).toHaveLength(5);
    expect(r.hitsDeadline).toBe(true);
    expect(r.targetAtDeadline).toBeGreaterThanOrEqual(10_000_000);
    expect(r.rows[0]?.cumulativeNet).toBeLessThan(0);
    // October to December 2027 only harvest notes
    expect(r.rows.slice(13).map((row) => row.lotsClosed)).toEqual([0, 0, 0]);
    expect(cash.verdict).toContain("until Sep 2027 (then only note sales)");
    expect(cash.verdict).toContain("unfunded $5.0M");
    // the buffer farm's unsold lots are land, not cash: the cushion costs its price at the deadline
    expect(cash.buffer.targetAtDeadline).toBe(round2(r.targetAtDeadline - 482_320));
  });

  it("10-lot farms need at least as many farms as the real 12.1-lot average (7 vs 6)", () => {
    const big = solveWarPlan({ ...d.inputs, lotsPerFarm: 12.1, farmCost: Math.round(12.1 * d.real.landCostPerLot) }, realm);
    expect(big.inputs.farmCost).toBe(583_607);
    expect(big.required.farmsToBuy).toBe(6);
    expect(profit.required.farmsToBuy).toBeGreaterThanOrEqual(big.required.farmsToBuy);
    expect(big.required.closingsPerMonth).toBeCloseTo(profit.required.closingsPerMonth, 1);
  });

  it("changing the deadline changes the verdict: by 2028-12-31 it is 4.78 lots/month with the last farm in Jul 2028", () => {
    const later = solveWarPlan({ ...d.inputs, deadline: "2028-12-31" }, realm);
    expect(later.verdict).not.toBe(profit.verdict);
    expect(later.deadlineMonthIndex).toBe(28);
    expect(later.required.closingsPerMonth).toBe(4.78);
    expect(later.required.farmsToBuy).toBe(7);
    expect(later.required.lastPurchaseDate).toBe("2028-07-31");
    expect(later.verdict).toContain("Jul 2028");
  });

  it("a cash target by 2027-03-31 is out of reach and says so", () => {
    const soon = solveWarPlan({ ...d.inputs, targetMode: "cash_in_bank", deadline: "2027-03-31" }, realm);
    expect(soon.feasible).toBe(false);
    expect(soon.verdict).toBe(
      "No pace reaches $10.0M by 2027-03-31: even 12.1 lots/month with 0 farms and $0 raised lands at $860K. Push the deadline or lower the target.",
    );
  });

  it("changes nothing in the Oracle's futures", () => {
    expect(realm.futures.current.exitDate).toBe("2029-03-11");
    expect(realm.futures.required.exitDate).toBe("2027-12-11");
    expect(realm.futures.oneMoreFarm.exitDate).toBe("2028-11-11");
  });
});
