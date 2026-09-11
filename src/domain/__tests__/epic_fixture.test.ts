/**
 * Phase 2 "Epic" numbers reproduced from the live snapshot (src/domain/__fixtures__/payments.json,
 * refreshed 2026-09-11 19:17 UTC). If the fixture is regenerated these change; document the drift in PROGRESS.md.
 */
import { describe, expect, it } from "vitest";
import raw from "../__fixtures__/payments.json";
import type { PaymentsSnapshot } from "../types";
import { buildRealm } from "../realm";
import { round2 } from "../math";
import { recentLandCostPerLot, solveWarPlan } from "../warplan";
import { computeSeasonality } from "../seasonality";

const fixture = raw as unknown as PaymentsSnapshot & { snapshotAt: string };
const ASOF = new Date("2026-09-11T00:00:00Z");
const realm = buildRealm(fixture, ASOF);

describe("fixture: THE DEBT", () => {
  it("owes $3,655,755.48 to sponsors on 8 open positions, with $800,000 of own capital tied up", () => {
    // sponsor capital now carries the surveys (purchase + survey on every farm since 2026-09-11)
    expect(realm.debt.capitalOwed).toBe(3_655_755.48);
    expect(realm.debt.openPositions).toBe(8);
    expect(realm.debt.ownCapitalOutstanding).toBe(800_000);
    // sponsor debt + own capital = the goal's capitalOutstanding over all subdivided farms
    expect(round2(realm.debt.capitalOwed + realm.debt.ownCapitalOutstanding)).toBe(realm.goal.capitalOutstanding);
  });

  it("has 476 days left and needs $16,310.13 of net profit per day", () => {
    expect(realm.debt.daysLeft).toBe(476);
    expect(realm.debt.requiredNetProfitPerDay).toBe(16_310.13);
    expect(realm.debt.requiredNetProfitPerDay).toBe(round2(realm.goal.remaining / 476));
    expect(realm.debt.interestPerDay).toBe(1_279.96);
  });

  it("has actually earned $10,025.56 per day since Mar 2026 ($1,944,957.82 over 194 days) — the all-time $6,655.89 since 2025-10-10 stays on record", () => {
    expect(realm.era).toMatchObject({ start: "2026-03-01", label: "Mar 2026", since: "since Mar 2026", monthsOfHistory: 6 });
    expect(realm.debt).toMatchObject({
      actualNetProfitPerDay: 10_025.56,
      actualSince: "2026-03-01",
      actualSinceLabel: "since Mar 2026",
      actualEraClipped: true,
      actualDays: 194,
      actualNetProfit: 1_944_957.82,
      actualNetProfitPerDayAllTime: 6_655.89,
      firstCloseDate: "2025-10-10",
    });
    expect(realm.debt.actualNetProfitPerDay).toBe(round2(1_944_957.82 / 194));
    // the eight dated closings of Oct 2025 – Jan 2026 ($291,420.52) are real money in the total, not in the pace
    expect(realm.goal.netProfitToDate).toBe(2_236_378.34);
    expect(round2(realm.goal.netProfitToDate - realm.debt.actualNetProfit)).toBe(291_420.52);
    // Eastland Lot 6 got its closing date (2026-07-09) on 2026-09-11: inside the era, so it now counts in the pace
    const eastland6 = realm.lots.find((l) => l.name === "Eastland — Lot 6");
    expect(eastland6?.closeDate).toBe("2026-07-09");
    expect(eastland6?.netProfit).toBe(27_885.18);
    // the per-day figure with ERA_START is higher than without it
    const allTime = buildRealm(fixture, ASOF, { eraStart: null });
    expect(allTime.era).toBeNull();
    expect(allTime.debt.actualNetProfitPerDay).toBe(6_655.89);
    expect(allTime.debt).toMatchObject({ actualSince: "2025-10-10", actualDays: 336, actualEraClipped: false, actualSinceLabel: null });
    expect(realm.debt.actualNetProfitPerDay as number).toBeGreaterThan(allTime.debt.actualNetProfitPerDay as number);
    // totals are untouched by the era
    expect(allTime.goal.netProfitToDate).toBe(realm.goal.netProfitToDate);
    expect(allTime.goal.cashRealized).toBe(realm.goal.cashRealized);
    expect(allTime.debt.capitalOwed).toBe(realm.debt.capitalOwed);
    expect(allTime.liberation.freedHostages.map((h) => h.farmName)).toEqual(realm.liberation.freedHostages.map((h) => h.farmName));
    expect(allTime.rotation.turnsCompleted).toBe(realm.rotation.turnsCompleted);
  });
});

describe("fixture: OXYGEN", () => {
  it("scores all 38 closed lots for 534 days gained in total", () => {
    expect(realm.oxygen.perLot.size).toBe(38);
    expect(realm.oxygen.totalDaysGained).toBe(534);
    expect(realm.oxygen.netProfitPerDayAtPace).toBe(9_145.63);
  });

  it("the latest closing (Promised Valley Lot 3, 2026-08-19) gained 5 days", () => {
    expect(realm.oxygen.latest?.lotName).toBe("Promised Valley — Lot 3");
    expect(realm.oxygen.latest?.daysGained).toBe(5);
    expect(realm.oxygen.latest?.paceThatDay).toBe(15_042.92);
  });

  it("the first closing in the realm (Lamar Lot 6) is worth the most days because the pace was slowest", () => {
    expect(realm.oxygen.best?.lotName).toBe("Lamar — Lot 6");
    expect(realm.oxygen.best?.daysGained).toBe(90);
    expect(realm.oxygen.best?.closeDate).toBe("2025-10-10");
  });

  it("Eastland Lot 6 is measured on its closing date (2026-07-09) now that it has one", () => {
    const lot = realm.lots.find((l) => l.name === "Eastland — Lot 6");
    const o = realm.oxygen.perLot.get(lot?.propertyId ?? "");
    expect(o?.measuredOn).toBe("2026-07-09");
    expect(o?.daysGained).toBe(2);
  });
});

describe("fixture: INVESTOR LIBERATION", () => {
  it("has 8 hostage positions worth $4,274,004, 14.47 % returned", () => {
    expect(realm.liberation.hostages).toHaveLength(8);
    expect(realm.liberation.totalCapital).toBe(4_274_004);
    expect(realm.liberation.totalReturned).toBe(618_248.52);
    expect(realm.liberation.pctReturned).toBe(14.47);
  });

  it("Townson Family is no longer freed of Lamar: $475,000 returned against $484,000 of capital (98.14 %), $9,000 to go; Wichita at 11.77 %", () => {
    const lamar = realm.liberation.hostages.find((h) => h.farmName === "Lamar");
    expect(lamar?.investorName).toBe("Townson Family");
    // 2026-09-11: Lamar's investor_capital became purchase + survey ($484,000); the $475,000 already returned falls $9,000 short — a data fact
    expect(lamar).toMatchObject({ capital: 484_000, capitalReturned: 475_000, capitalOutstanding: 9_000, pctReturned: 98.14, freed: false, freedAt: null, daysHeld: null });
    expect(lamar?.paidOnTop).toBe(175_741.94);
    const wichita = realm.liberation.hostages.find((h) => h.farmName === "Wichita");
    expect(wichita?.pctReturned).toBe(11.77);
    const townson = realm.liberation.sponsors.find((s) => s.name === "Townson Family");
    expect(townson?.freed).toBe(false);
    expect(townson?.pctReturned).toBe(36.35);
    expect(realm.liberation.freedSponsors).toHaveLength(0);
    expect(realm.liberation.freedHostages).toHaveLength(0);
    expect(realm.liberation.moments).toEqual([]);
  });

  it("the chronicle carries no liberation event any more", () => {
    expect(realm.events.filter((e) => e.kind === "liberation")).toHaveLength(0);
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
      Avery: "closing_pending",
      Franklin: "closing_pending",
    });
  });

  it("sizes each campaign goal in lots", () => {
    expect(byName["Wichita"]?.lotsLeftToCover).toBe(3);
    expect(byName["Promised Valley"]?.lotsLeftToCover).toBe(2);
    expect(byName["Titus"]?.lotsLeftToCover).toBe(2);
    expect(byName["Avery"]?.lotsLeftToCover).toBe(5);
    expect(byName["Avery"]?.avgSalePriceSource).toBe("realm");
    expect(byName["Avery"]?.target).toBe(548_275.69);
    expect(byName["Eastland"]?.recovered).toBe(1_097_950.8);
  });

  it("Avery (12 reservations) and Franklin (5) accrue interest with no closing yet, but are closing pending, not losing ground", () => {
    expect(byName["Avery"]).toMatchObject({ state: "closing_pending", reservedLots: 12, interestAccruing: true, lastClosingDate: null, reason: "12 reservations waiting to close, no closing yet" });
    expect(byName["Franklin"]).toMatchObject({ state: "closing_pending", reservedLots: 5, reason: "5 reservations waiting to close, no closing yet" });
    expect(realm.campaigns.some((c) => c.state === "losing_ground")).toBe(false);
    expect(byName["Wichita"]?.reservedLots).toBe(8);
    expect(byName["Lamar"]?.reservedLots).toBe(1);
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

  it("best week is W22 2026 with 7 closings; best month May 2026 with 13 — measured since Mar 2026, with the 8 earlier closings left out and the runs untouched", () => {
    expect(realm.streaks.bestWeek).toEqual({ week: "2026-W22", weekStart: "2026-05-25", count: 7, netProfit: 543_413.68 });
    expect(realm.streaks.bestMonth).toEqual({ month: "2026-05", count: 13, netProfit: 987_368.88 });
    expect(realm.streaks).toMatchObject({ bestSince: "2026-03-01", bestSinceLabel: "since Mar 2026", bestExcluded: 8 });
    // the runs read the whole history: 15 weeks with a closing, the first in Oct 2025
    expect(realm.streaks.weeks[0]?.weekStart).toBe("2025-10-06");
    expect(realm.streaks.months.map((m) => m.month)).toEqual(["2025-10", "2025-11", "2026-01", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(realm.streaks.bestMonths).toBe(5);
    expect(realm.streaks.currentMonths).toBe(5);
    // the record week and month fall inside the era, so the whole history agrees
    const allTime = buildRealm(fixture, ASOF, { eraStart: null });
    expect(allTime.streaks.bestWeek).toEqual(realm.streaks.bestWeek);
    expect(allTime.streaks.bestMonth).toEqual(realm.streaks.bestMonth);
    expect(allTime.streaks).toMatchObject({ bestSince: null, bestSinceLabel: null, bestExcluded: 0 });
    // reservation pledges: every pledge since Mar 2026, 9 earlier ones left out of the record (Lamar Lot 5's pledge now dated 2025-09-07)
    expect(realm.reservationStreaks).toMatchObject({ bestSinceLabel: "since Mar 2026", bestExcluded: 9 });
  });
});

describe("fixture: trophies with rarity", () => {
  it("has 29 trophies, 20 earned, every one with a rarity", () => {
    expect(realm.trophies).toHaveLength(29);
    expect(realm.trophies.filter((t) => t.earned)).toHaveLength(20);
    expect(realm.trophies.every((t) => ["common", "rare", "epic", "legendary"].includes(t.rarity))).toBe(true);
    const byId = Object.fromEntries(realm.trophies.map((t) => [t.id, t]));
    expect(byId["streak_weeks_3"]?.earned).toBe(true);
    expect(byId["busy_week_3"]?.earned).toBe(true);
    // Lamar stopped at 98.14 % once its capital became $484,000, so the first liberation is not earned any more
    expect(byId["first_liberation"]).toMatchObject({ earned: false, earnedAt: null, detail: "Lamar at 98.14%" });
    expect(byId["streak_weeks_6"]?.earned).toBe(false);
    expect(byId["all_free"]?.earned).toBe(false);
  });

  it("the four reservation trophies are all earned: 6 consecutive weeks of pledges ending 2026-06-21, 7 pledges in W22, 8 consecutive months", () => {
    const byId = Object.fromEntries(realm.trophies.map((t) => [t.id, t]));
    expect(byId["pledge_streak_3"]).toMatchObject({ earned: true, detail: "best 8 consecutive months · current 8" });
    expect(byId["pledge_streak_weeks_3"]).toMatchObject({ earned: true, earnedAt: "2026-06-21", detail: "best 6 weeks · current 3" });
    expect(byId["pledge_streak_weeks_6"]).toMatchObject({ earned: true, earnedAt: "2026-06-21" });
    expect(byId["busy_pledge_week_3"]).toMatchObject({ earned: true, earnedAt: "2026-05-25", detail: "7 in week 2026-W22" });
  });
});

describe("fixture: ORACLE futures", () => {
  it("four futures: reservations close first (2028-07-11), the required pace lands on the deadline month, closings-only is the 2029-01-11 line", () => {
    const f = realm.futures;
    expect(f.all.map((x) => x.id)).toEqual(["current_pace", "required_pace", "one_more_farm", "closings_only"]);
    expect(f.current.exitDate).toBe("2028-07-11");
    expect(f.current.hitsDeadline).toBe(false);
    expect(f.current.params.lotsPerMonth).toBe(5.32);
    expect(f.current.params.lotsPerMonth).toBe(round2(realm.expected.reservationsPerMonth * (realm.expected.conversionPct / 100)));
    expect(f.current.scheduled).toHaveLength(33);
    expect(f.required.exitDate).toBe("2027-12-11");
    expect(f.required.hitsDeadline).toBe(true);
    expect(f.required.daysEarlierThanCurrent).toBe(213);
    expect(f.oneMoreFarm.exitDate).toBe("2028-05-11");
    expect(f.oneMoreFarm.daysEarlierThanCurrent).toBe(61);
    expect(f.oneMoreFarm.params.lotsPerMonth).toBe(6.08);
    expect(f.oneMoreFarm.startInventory).toBe(round2(71 + realm.oracleDefaults.avgLotsPerFarm));
    expect(f.closingsOnly.exitDate).toBe("2029-01-11");
    expect(f.closingsOnly.daysEarlierThanCurrent).toBe(-184);
    expect(f.closingsOnly.params).toEqual(realm.oracleDefaults);
    expect(f.closingsOnly.params.lotsPerMonth).toBe(4.73);
  });

  it("the current pace books 21 of the 33 reservations in the first month (16 overdue + 5 expected by Oct 11), 8 in the second, 4 in the third; the steady pace starts after the 62-day lag", () => {
    const s = realm.futures.current.result.series;
    expect(s[0]).toMatchObject({ date: "2026-10-11", scheduledLotsClosed: 15.75, flatLotsClosed: 0, lotsClosed: 15.75 });
    expect(s[0]?.scheduledLotsClosed).toBe(round2(21 * 0.75));
    expect(s[1]).toMatchObject({ date: "2026-11-11", scheduledLotsClosed: 6, flatLotsClosed: 0 });
    expect(s[2]).toMatchObject({ date: "2026-12-11", scheduledLotsClosed: 3, flatLotsClosed: 5.14 });
    expect(s[3]).toMatchObject({ date: "2027-01-11", scheduledLotsClosed: 0, flatLotsClosed: 5.32, lotsClosed: 5.32 });
    expect(round2((s[0]?.scheduledLotsClosed ?? 0) + (s[1]?.scheduledLotsClosed ?? 0) + (s[2]?.scheduledLotsClosed ?? 0))).toBe(round2(33 * 0.75));
    // the first month books the committed net profit of those 21 reservations, not the average per lot
    const committedFirstMonth = realm.expected.lots.filter((l) => (l.expectedCloseDate ?? "") <= "2026-10-11").reduce((a, l) => a + l.expectedNetProfit, 0);
    expect(s[0]?.cumulativeNetProfit).toBe(round2(realm.goal.netProfitToDate + committedFirstMonth));
    expect(realm.futures.current.premise).toBe(
      "33 live reservations close on their expected dates at 75% conversion (16 already overdue, counted in the first month); after the 62-day lag, new reservations at 7.1/month keep closing at that rate — 5.32 lots/month — with a new farm every 1.51 months (since Mar 2026).",
    );
    expect(realm.futures.closingsOnly.premise).toBe("4.73 closings/month and a new farm every 1.51 months (since Mar 2026) — the trailing closing pace alone, blind to the 33 live reservations.");
  });

  it("farm cadence since Mar 2026: a farm every 1.51 months over the five fundings from Freestone (2026-04-14) to Franklin 2 (2026-10-15); the four 2025 farms are left out (1.72 months over all nine)", () => {
    expect(realm.farmCadence).toEqual({
      months: 1.51,
      measured: true,
      farms: 5,
      fundingDates: ["2026-04-14", "2026-04-15", "2026-06-16", "2026-07-31", "2026-10-15"],
      excluded: 4,
      since: "2026-03-01",
      sinceLabel: "since Mar 2026",
    });
    expect(realm.oracleDefaults.newFarmEveryMonths).toBe(1.51);
    expect(realm.futures.all.filter((f) => f.id !== "required_pace").every((f) => f.params.newFarmEveryMonths === 1.51)).toBe(true);
    // the required pace buys a farm as often as inventory needs it, never less often than the realm does
    expect(realm.futures.required.params.newFarmEveryMonths).toBe(1.38);
    const allTime = buildRealm(fixture, ASOF, { eraStart: null });
    expect(allTime.farmCadence).toMatchObject({ months: 1.72, farms: 9, excluded: 0, since: null, sinceLabel: null });
    expect(allTime.oracleDefaults.newFarmEveryMonths).toBe(1.72);
    // more inventory arrives sooner, but no future exits on a different day: land was never the constraint
    expect(allTime.futures.all.map((f) => f.exitDate)).toEqual(realm.futures.all.map((f) => f.exitDate));
  });
});

describe("fixture: NARRATED CHRONICLE and STORY", () => {
  it("narrates every event", () => {
    expect(realm.narrative.size).toBe(realm.events.length);
    const latest = realm.oxygen.latest as NonNullable<typeof realm.oxygen.latest>;
    expect(realm.narrative.get(`closing:${latest.propertyId}`)).toBe(
      "On August 19, Daniel Carrasquillo claimed Lot 3 of Promised Valley for $116,500, 90 days after Daniel's reservation. The realm gained 5 days.",
    );
    expect(realm.narrative.get(`reservation:${latest.propertyId}`)).toBe("On May 21, Daniel Carrasquillo pledged for Lot 3 of Promised Valley at $116,500.");
    // no liberation has happened: Lamar's $475,000 no longer covers its $484,000
    expect(realm.liberation.moments).toEqual([]);
    expect([...realm.narrative.keys()].some((k) => k.startsWith("liberation:"))).toBe(false);
  });

  it("tells the story in five cards with the real figures — the liberation card is gone with Lamar's freedom", () => {
    const lines = realm.story.cards.map((c) => c.line);
    expect(lines).toEqual([
      "9 farms across 9 counties, cut into 109 lots.",
      "$4,274,004 lent by 5 sponsors. $3,655,755 still owed.",
      "38 lots closed for $2,236,378 of net profit — 22.4% of the ten million.",
      "Every closing bought time. 534 days gained toward the exit.",
      "476 days left. $16,310 of net profit needed every single day.",
    ]);
  });
});

describe("fixture: PIPELINE (reservations layer)", () => {
  const p = realm.pipeline;

  it("33 reserved lots carry $2,197,857.18 of net profit — the same pipeline figure the goal reports", () => {
    expect(p.reserved).toBe(33);
    expect(p.pipelineNetProfit).toBe(2_197_857.18);
    expect(p.pipelineNetProfit).toBe(realm.goal.netProfitInPipeline);
  });

  it("21 reservations in the trailing 90 days are still waiting: 7.1/month vs 4.73 closings/month", () => {
    expect(p.newReservationsTrailing).toBe(21);
    expect(p.reservationsPerMonth).toBe(7.1);
    // Lamar Lot 5's pledge moved from 2026-09-07 to 2025-09-07, out of the trailing window
    expect(p.reservationsMadeTrailing).toBe(21);
    // Eastland Lot 6's closing (2026-07-09) now counts in the trailing 90 days: 14 closings
    expect(p.closedLotsPerMonth).toBe(4.73);
    expect(p.closedLotsPerMonth).toBe(realm.goal.closedLotsPerMonth);
  });

  it("of the 48 reservations made on or before 2026-06-13, 36 closed (75%)", () => {
    // Lamar Lot 5 (pledged 2025-09-07, closed 2025-11-05) joined the cohort
    expect(p.conversion).toMatchObject({ cutoff: "2026-06-13", cohort: 48, closed: 36, stillReserved: 12, pct: 75 });
  });

  it("16 reservations are stuck past 60 days, trapping $1,103,375.31 of net profit on $2,024,531 of sales", () => {
    expect(p.stuckCount).toBe(16);
    expect(p.netProfitTrapped).toBe(1_103_375.31);
    expect(p.salePriceTrapped).toBe(2_024_531);
    expect(p.netProfitTrapped).toBe(round2(p.stuck.reduce((a, s) => a + s.netProfitAtStake, 0)));
    expect(p.stuck[0]).toMatchObject({ lotName: "Titus — Lot 2", buyerName: "Crystal Thompson", daysWaiting: 132, salePrice: 135_412, netProfitAtStake: 60_460.5, reservationDate: "2026-05-02" });
    expect(p.stuck.at(-1)).toMatchObject({ lotName: "Avery — Lot 5", daysWaiting: 67 });
    for (let i = 1; i < p.stuck.length; i++) expect(p.stuck[i - 1]!.daysWaiting).toBeGreaterThanOrEqual(p.stuck[i]!.daysWaiting);
    for (const s of p.stuck) expect(realm.lots.find((l) => l.propertyId === s.propertyId)?.stage).toBe("reserved");
  });

  it("Avery traps the most: 7 stuck lots, $611,862.15; Franklin 5, $308,167.55", () => {
    const byName = new Map(p.farms.map((f) => [f.farmName, f]));
    expect(byName.get("Avery")).toMatchObject({ reserved: 12, stuck: 7, netProfitTrapped: 611_862.15, medianDaysToClose: null });
    expect(byName.get("Franklin")).toMatchObject({ reserved: 5, stuck: 5, netProfitTrapped: 308_167.55 });
    expect(byName.get("Wichita")).toMatchObject({ reserved: 8, stuck: 3, netProfitTrapped: 122_885.11, medianDaysToClose: 63 });
    expect(byName.get("Titus")).toMatchObject({ stuck: 1, netProfitTrapped: 60_460.5 });
    expect(p.farms[0]?.farmName).toBe("Avery");
  });

  it("median reservation-to-closing is 61.5 days over 36 closed lots; Lamar 42, Promised Valley 90", () => {
    expect(p.medianDaysToClose).toBe(61.5);
    expect(p.closedWithBothDates).toBe(36);
    const byName = new Map(p.farms.map((f) => [f.farmName, f]));
    expect(byName.get("Lamar")?.medianDaysToClose).toBe(42);
    expect(byName.get("Promised Valley")?.medianDaysToClose).toBe(90);
    expect(byName.get("Freestone")?.medianDaysToClose).toBe(70);
    expect(byName.get("Eastland")?.medianDaysToClose).toBe(63);
  });

  it("changes nothing in the goal, pace, oxygen or debt", () => {
    expect(realm.goal.netProfitToDate).toBe(2_236_378.34);
    expect(realm.goal.closedLotsPerMonth).toBe(4.73);
    expect(realm.oxygen.totalDaysGained).toBe(534);
    expect(realm.debt.requiredNetProfitPerDay).toBe(16_310.13);
  });
});

describe("fixture: WAR PLAN (the Oracle in reverse)", () => {
  const d = realm.warPlanDefaults;
  const profit = solveWarPlan(d.inputs, realm);
  const allTime = buildRealm(fixture, ASOF, { eraStart: null });

  it("prefills every input from the realm: 10-lot farms at $468,520 (recent land), 75 % conversion, 2.63 months to first close, a 7.21-month cycle projected since Mar 2026, flat pace, five sponsors", () => {
    expect(d.inputs).toMatchObject({
      target: 10_000_000,
      deadline: "2027-12-31",
      targetMode: "profit_at_closing",
      lotsPerFarm: 10,
      farmCost: 468_520,
      adSpendPerClosing: 2_500,
      conversionPct: 75,
      farmToFirstCloseMonths: 2.63,
      noteSaleLagMonths: 3.17,
      cycleMonths: 7.21,
      seasonal: false,
    });
    expect(d.real).toMatchObject({
      lotsPerFarm: 12.11,
      landCostPerLot: 49_244,
      recentLandCostPerLot: 46_852,
      recentFarms: ["Franklin", "Avery", "Wichita"],
      defaultLandCostPerLot: 46_852,
      eraSince: "since Mar 2026",
      conversionPct: 75,
      conversionWithCancellationsPct: 75,
      cancellationRatePct: 0,
      cancelledReservations: 0,
      farmToFirstCloseMonths: 2.63,
      farmToFirstCloseFarms: 6,
      medianDaysToClose: 61.5,
      noteSaleLagMonths: 3.17,
      closingsPerMonth: 4.73,
      inventory: 71,
      cycleDays: 219.5,
      cycleMonths: 7.21,
      cycleSource: "projected",
      cycleFarms: 4,
      cycleExcludedFarms: [],
      seasonalityApplied: false,
      seasonalityReason: "not enough history for seasonality",
    });
    // every sponsor's capital carries its surveys since 2026-09-11
    expect(d.inputs.investorMix.map((e) => [e.name, e.dealType, e.ratePct, e.capital])).toEqual([
      ["Kevin Concua", "fixed_interest", 20, 1_423_128],
      ["Townson Family", "profit_share", 50, 1_701_000],
      ["Julio Arriola", "fixed_interest", 25, 390_861],
      ["Rony Schumann", "fixed_interest", 18, 373_520],
      ["Doctores Motta", "fixed_interest", 20, 385_495],
    ]);
    expect(d.inputs.investorMix.every((e) => e.investorId !== null)).toBe(true);
    expect(round2(d.inputs.investorMix.reduce((a, e) => a + e.capital, 0))).toBe(realm.liberation.totalCapital);
  });

  it("land cost trend since Mar 2026: the three most recent purchases (Franklin, Avery, Wichita) average $46,852 per lot against $49,244 all-time", () => {
    const recent = realm.farms.filter((f) => ["Franklin", "Avery", "Wichita"].includes(f.name));
    expect(recent.map((f) => f.fundingDate).sort()).toEqual(["2026-04-15", "2026-06-16", "2026-07-31"]);
    expect(Math.round(recent.reduce((a, f) => a + f.landCostPerLot, 0) / 3)).toBe(46_852);
    // Franklin 2 closes on 2026-10-15, after asOf, so it is not a purchase yet.
    expect(d.real.recentFarms).not.toContain("Franklin 2");
    expect(d.inputs.farmCost).toBe(46_852 * 10);
    // all three era purchases are the three most recent purchases anyway: the era changes nothing here today
    expect(recentLandCostPerLot(realm.farms, ASOF)).toEqual({ perLot: 46_852, farms: ["Franklin", "Avery", "Wichita"], since: "2026-03-01", sinceLabel: "since Mar 2026" });
    expect(recentLandCostPerLot(realm.farms, ASOF, 3, null)).toEqual({ perLot: 46_852, farms: ["Franklin", "Avery", "Wichita"], since: null, sinceLabel: null });
    // asked for more than the era holds, the trend stops at the era: four purchases since Mar 2026, never Titus (Nov 2025)
    expect(recentLandCostPerLot(realm.farms, ASOF, 5).farms).toEqual(["Franklin", "Avery", "Wichita", "Freestone"]);
    expect(recentLandCostPerLot(realm.farms, ASOF, 5, null).farms).toEqual(["Franklin", "Avery", "Wichita", "Freestone", "Titus"]);
  });

  it("owes sponsors $4,311,591.96 today ($3,655,755.48 of capital + $655,836.48 of unpaid take) and has kept $1,362,503.84 of cash", () => {
    expect(profit.ledger).toEqual({ capitalOwed: 3_655_755.48, paidOut: 793_990.46, unpaidTake: 655_836.48, cashKept: 1_362_503.84, owedToday: 4_311_591.96 });
    expect(profit.ledger.capitalOwed).toBe(realm.debt.capitalOwed);
  });

  it("profit mode: ≈8.4 closings/month and ≈130 lots still needed — 7 farms of 10 lots, the last by Jul 2027, $3.3M to raise", () => {
    expect(profit.feasible).toBe(true);
    expect(profit).toMatchObject({ deadlineMonthIndex: 16, monthsToDeadline: 15.63, landLag: 3, closeLag: 2, noteLag: 3, maxPurchaseMonth: 11, lastClosingDate: null, startInventory: 71 });
    const r = profit.required;
    expect(r.closingsPerMonth).toBeCloseTo(8.4, 0);
    expect(r.closingsPerMonth).toBe(8.43);
    expect(r.lotsNeeded).toBeCloseTo(130, -1);
    expect(r.lotsNeeded).toBe(131.79);
    expect(r.farmsToBuy).toBe(7);
    expect(r.lastPurchaseDate).toBe("2027-07-31");
    expect(r.capitalToRaise).toBe(7 * 468_520);
    expect(r.totalDeployed).toBe(7 * 468_520);
    expect(r.funding.map((f) => [f.name, f.amount])).toEqual([
      ["Kevin Concua", 1_423_128],
      ["Townson Family", 1_701_000],
      ["Julio Arriola", 155_512],
    ]);
    expect(r.unfunded).toBe(0);
    expect(r.adSpendPerMonth).toBe(28_100);
    expect(r.adSpendPerMonth).toBe(round2((8.43 / 0.75) * 2_500));
    expect(r.reservationsPerMonth).toBe(11.24);
    expect(r.noteSalesPerMonth).toBe(8.43);
    expect(r.exitDate).toBe("2027-12-31");
    expect(r.hitsDeadline).toBe(true);
    expect(r.targetAtDeadline).toBeGreaterThanOrEqual(10_000_000);
    expect(r.rows).toHaveLength(16);
    // flat: with under 12 months of history since Mar 2026 no seasonal shape is applied, so every month asks the same 8.43 (the first prorated)
    expect(r.rows[0]).toMatchObject({ date: "2026-09-30", lotsClosed: 5.34, flatLotsClosed: 5.34, seasonalFactor: 1, farmsBought: 0 });
    expect(r.rows.at(-1)).toMatchObject({ date: "2027-12-31", lotsClosed: 8.43, flatLotsClosed: 8.43, seasonalFactor: 1, notesSold: 8.43, cumulativeNet: 10_003_815.08, inventory: 9.21 });
    expect(r.rows.at(-1)?.capitalReturned).toEqual([1_423_128, 1_412_688.33, 12_269.9, 0, 0]);
    expect(profit.verdict).toBe(
      "Buy 7 farms, the last one no later than Jul 2027, raise $3.3M (Kevin Concua $1.4M, Townson Family $1.7M, Julio Arriola $156K), close 8.4 lots/month, sell 8.4 notes/month and spend at least $28K/month on ads.",
    );
    expect(profit.verdict).toMatch(/\$[\d.,]+[KM]?/);
    expect(profit.verdict).toMatch(/\b\d+ farms?\b/);
  });

  it("seasonality: only 6 months of history since Mar 2026 (30 of the 38 dated closings), so no seasonal profile is applied — 'not enough history for seasonality' — and the plan is flat even when asked to be seasonal", () => {
    const s = realm.seasonality;
    expect(s).toMatchObject({
      applied: false,
      reason: "not enough history for seasonality",
      monthsOfHistory: 6,
      monthsRequired: 12,
      closings: 30,
      excluded: 8,
      since: "2026-03-01",
      sinceLabel: "since Mar 2026",
      peakMonth: null,
      troughMonth: null,
    });
    // the eight closings of Oct 2025 – Jan 2026 are out of the counts; Apr–Aug 2026 remain (Eastland Lot 6 now dated in July)
    expect(s.counts).toEqual([0, 0, 0, 1, 13, 2, 10, 4, 0, 0, 0, 0]);
    expect(s.factors).toEqual(Array.from({ length: 12 }, () => 1));
    expect(round2(s.shares.reduce((a, b) => a + b, 0))).toBe(1);
    // the War Plan starts flat and stays flat when the toggle is forced on
    expect(d.inputs.seasonal).toBe(false);
    expect(profit.seasonality).toEqual(Array.from({ length: 12 }, () => 1));
    expect(profit.required.rows.every((r) => r.seasonalFactor === 1 && r.lotsClosed === r.flatLotsClosed)).toBe(true);
    expect(solveWarPlan({ ...d.inputs, seasonal: true }, realm).seasonality).toEqual(Array.from({ length: 12 }, () => 1));
    expect(profit.current.rows.every((r) => r.seasonalFactor === 1)).toBe(true);
    // without the era there are 11 months of history (first closing 2025-10-10): still not enough
    expect(allTime.seasonality).toMatchObject({ applied: false, monthsOfHistory: 11, closings: 38, reason: "not enough history for seasonality", since: null });
    expect(allTime.seasonality.counts).toEqual([1, 0, 0, 1, 13, 2, 10, 4, 0, 4, 3, 0]);
  });

  it("seasonality: the profile becomes available on 2027-03-01 (12 whole months since Mar 2026), not a day earlier; forced today it would peak in May at ×2.56", () => {
    const eve = computeSeasonality(realm.lots, new Date("2027-02-28T00:00:00Z"));
    expect(eve).toMatchObject({ applied: false, monthsOfHistory: 11, reason: "not enough history for seasonality" });
    const anniversary = computeSeasonality(realm.lots, new Date("2027-03-01T00:00:00Z"));
    expect(anniversary).toMatchObject({ applied: true, monthsOfHistory: 12, reason: null, closings: 30, peakMonth: 4 });
    // the shape the era closings would give: May ×2.56, Sep–Mar at the 25 % floor
    const forced = computeSeasonality(realm.lots, ASOF, { minMonths: 0 });
    expect(forced.applied).toBe(true);
    expect(forced.factors).toEqual([0.25, 0.25, 0.25, 1.324, 2.559, 2.382, 2.294, 1.588, 0.353, 0.25, 0.25, 0.25]);
    expect(round2(forced.factors.reduce((a, b) => a + b, 0))).toBe(12);
    expect(forced).toMatchObject({ peakMonth: 4, troughMonth: 0 });
    // fed to the War Plan it shapes the required plan month by month while the flat average stays the plan's average
    const shaped = solveWarPlan({ ...d.inputs, seasonal: true }, { ...realm, seasonality: forced });
    expect(shaped.seasonality).toEqual([0.301, 0.301, 0.301, 1.595, 3.084, 2.87, 2.764, 1.914, 0.425, 0.301, 0.301, 0.301]);
    expect(shaped.required.closingsPerMonth).toBe(8.41);
    expect(shaped.required.rows.find((r) => r.date === "2027-05-31")).toMatchObject({ lotsClosed: 25.93, flatLotsClosed: 8.41, seasonalFactor: 3.084 });
    expect(shaped.required.rows.find((r) => r.date === "2027-01-31")).toMatchObject({ lotsClosed: 2.53, flatLotsClosed: 8.41, seasonalFactor: 0.301 });
    const seasonalTotal = shaped.required.rows.reduce((a, r) => a + r.lotsClosed, 0);
    const flatTotal = shaped.required.rows.reduce((a, r) => a + r.flatLotsClosed, 0);
    expect(Math.abs(seasonalTotal - flatTotal)).toBeLessThan(0.1);
  });

  it("cancellations: no file case in the snapshot is cancelled, so the rate is 0 % and conversion with cancellations equals conversion", () => {
    expect(fixture.fileCases.filter((c) => c.status === "cancelled")).toHaveLength(0);
    expect(realm.pipeline.conversion).toMatchObject({ cohort: 48, closed: 36, stillReserved: 12, pct: 75, cancelled: 0, cohortWithCancellations: 48, pctWithCancellations: 75, cancellationRatePct: 0 });
    expect(realm.pipeline.cancelledReservations).toBe(0);
    expect(realm.lots.every((l) => l.cancelledFileCases === 0)).toBe(true);
  });

  it("rotation since Mar 2026: no farm has completed a real turn, so the cycle is projected from the four captive era farms — 219.5 days (7.21 months), Avery the benchmark — and no farm can be graded against a real curve", () => {
    const b = realm.rotation;
    expect(b.source).toBe("projected");
    expect(b.cycleDays).toBe(219.5);
    expect(b.cycleMonths).toBe(7.21);
    expect(b.since).toBe("2026-03-01");
    expect(b.sinceLabel).toBe("since Mar 2026");
    expect(b.cycles.map((c) => [c.farmName, c.fundingDate, c.liberationDate, c.days, c.projected])).toEqual([
      ["Wichita", "2026-04-15", "2026-11-01", 200, true],
      ["Freestone", "2026-04-14", "2026-09-11", 150, true],
      ["Avery", "2026-06-16", "2027-02-10", 239, true],
      ["Franklin", "2026-07-31", "2027-06-21", 325, true],
    ]);
    expect(b.cycleDays).toBe((200 + 239) / 2);
    expect(b.benchmark).toMatchObject({ farmName: "Avery", investorName: "Kevin Concua", fundingDate: "2026-06-16", liberationDate: "2027-02-10", days: 239, months: 7.85, projected: true });
    // Lamar's 271-day turn is no longer on record: with $484,000 of capital its $475,000 returned is not a liberation
    expect(b.excludedCycles).toEqual([]);
    expect(realm.liberation.freedHostages).toEqual([]);
    expect(b.turnsCompleted).toBe(0);
    expect(b.capitalOutstanding).toBe(3_655_755.48);
    // a projected benchmark has no distribution curve, so nothing is graded
    expect(b.curve).toEqual([]);
    expect(b.grades.map((g) => [g.farmName, g.verdict, g.daysElapsed, g.pctReturned, g.daysToGo])).toEqual([
      ["Lamar", "unrated", 386, 98.14, 0],
      ["Eastland", "unrated", 382, 0, 0],
      ["Titus", "unrated", 304, 0, 212],
      ["Freestone", "unrated", 150, 0, 0],
      ["Wichita", "unrated", 149, 11.77, 51],
      ["Avery", "benchmark", 87, 0, 152],
      ["Franklin", "unrated", 42, 0, 283],
      ["Franklin 2", "unrated", -34, 0, null],
    ]);
    expect(b.grades.find((g) => g.farmName === "Wichita")).toMatchObject({ benchmarkPctAtSameDay: null, projectedLiberationDate: "2026-11-01" });
    // Lamar's sales already cover its last $9,000; the payout has not been distributed
    expect(b.nextLiberation?.farmName).toBe("Lamar");
    expect(b.nextLiberation?.daysToGo).toBe(0);
  });

  it("rotation over the whole history: with no real turn anywhere the cycle is projected from all seven captive farms — 325 days (10.68 months), Franklin the median", () => {
    const b = allTime.rotation;
    expect(b.source).toBe("projected");
    expect(b.cycleDays).toBe(325);
    expect(b.cycleMonths).toBe(10.68);
    expect(b.since).toBeNull();
    expect(b.excludedCycles).toEqual([]);
    expect(b.cycles.map((c) => [c.farmName, c.fundingDate, c.liberationDate, c.days, c.projected])).toEqual([
      ["Lamar", "2025-08-21", "2026-09-11", 386, true],
      ["Wichita", "2026-04-15", "2026-11-01", 200, true],
      ["Eastland", "2025-08-25", "2026-09-11", 382, true],
      ["Titus", "2025-11-11", "2027-04-11", 516, true],
      ["Freestone", "2026-04-14", "2026-09-11", 150, true],
      ["Avery", "2026-06-16", "2027-02-10", 239, true],
      ["Franklin", "2026-07-31", "2027-06-21", 325, true],
    ]);
    expect(b.benchmark).toMatchObject({ farmName: "Franklin", investorName: "Julio Arriola", fundingDate: "2026-07-31", liberationDate: "2027-06-21", days: 325, months: 10.68, projected: true });
    expect(b.turnsCompleted).toBe(0);
    expect(b.capitalOutstanding).toBe(3_655_755.48);
    // no real curve, so nothing is graded against it
    expect(b.curve).toEqual([]);
    expect(b.grades.map((g) => [g.farmName, g.verdict])).toEqual([
      ["Lamar", "unrated"],
      ["Eastland", "unrated"],
      ["Titus", "unrated"],
      ["Freestone", "unrated"],
      ["Wichita", "unrated"],
      ["Avery", "unrated"],
      ["Franklin", "benchmark"],
      ["Franklin 2", "unrated"],
    ]);
    expect(allTime.warPlanDefaults.inputs.cycleMonths).toBe(10.68);
    expect(allTime.warPlan.rotation.headline).toBe(
      "With $3.3M of land capital rotating every 10.7 months you reach $10.0M by the deadline; you need 1 turn; the first turn must start by Feb 2027. 7 of the 7 turns cannot complete before the deadline.",
    );
  });

  it("rotation: the required plan turns $3.3M once — every farm is bought Feb–Jul 2027 and the first three are back before the deadline on the 7.2-month cycle", () => {
    const rot = profit.rotation;
    expect(rot).toMatchObject({
      cycleMonths: 7.21,
      totalDeployed: 3_279_640,
      peakOutstanding: 3_279_640,
      newMoney: 3_279_640,
      recycled: 0,
      turnsNeeded: 1,
      turnsCompleted: 0,
      turnsIncomplete: 4,
      farms: 7,
      firstTurnStartBy: "2027-02-28",
      lastTurnCompletes: "2028-02-29",
    });
    expect(rot.perInvestor.map((i) => [i.name, i.deployed, i.fresh, i.peakOutstanding, i.turns])).toEqual([
      ["Kevin Concua", 1_423_128, 1_423_128, 1_423_128, 1],
      ["Townson Family", 1_701_000, 1_701_000, 1_701_000, 1],
      ["Julio Arriola", 155_512, 155_512, 155_512, 1],
    ]);
    expect(rot.headline).toBe(
      "With $3.3M of land capital rotating every 7.2 months you reach $10.0M by the deadline; you need 1 turn; the first turn must start by Feb 2027. 4 of the 7 turns cannot complete before the deadline.",
    );
    expect(rot.headline).toMatch(/\b\d+(\.\d)? turns?\b/);
    expect(profit.required.schedule.map((f) => [f.purchaseMonth, f.turnCompletesMonth, f.turnComplete])).toEqual([
      [6, 13, true],
      [7, 14, true],
      [9, 16, true],
      [10, 17, false],
      [11, 18, false],
      [11, 18, false],
      [11, 18, false],
    ]);
    expect(profit.required.rows.filter((r) => r.flags.includes("turn_incomplete")).map((r) => r.monthIndex)).toEqual([10, 11]);
    expect(profit.required.flaggedMonths).toBe(2);
    // no turn completes before a later purchase, so the peak is the whole deployment
    expect(rot.peakOutstanding).toBe(rot.totalDeployed);
  });

  it("rotation: with a 2028-12-31 deadline two turns complete before later farms are bought, so the peak ($1.4M) is below the total deployed ($2.3M): 1.67 turns", () => {
    const later = solveWarPlan({ ...d.inputs, deadline: "2028-12-31" }, realm);
    const rot = later.rotation;
    expect(rot).toMatchObject({ totalDeployed: 2_342_600, peakOutstanding: 1_405_560, newMoney: 1_405_560, recycled: 937_040, turnsNeeded: 1.67, turnsIncomplete: 1, farms: 5, firstTurnStartBy: "2027-10-31" });
    expect(rot.peakOutstanding).toBeLessThan(rot.totalDeployed);
    expect(later.required.capitalToRaise).toBe(1_405_560);
    expect(later.required.schedule.map((f) => [f.purchaseMonth, f.turnCompletesMonth, f.recycled])).toEqual([
      [14, 21, 0],
      [16, 23, 0],
      [19, 26, 0],
      [21, 28, 468_520],
      [23, 30, 468_520],
    ]);
    // Kevin's dollars alone fund the five farms: the Oct 2027 and Dec 2027 farms come back in time to buy the last two
    expect(rot.perInvestor.map((i) => [i.name, i.deployed, i.fresh, i.turns])).toEqual([["Kevin Concua", 2_342_600, 1_405_560, 1.67]]);
    expect(rot.headline).toBe(
      "With $1.4M of land capital rotating every 7.2 months you reach $10.0M by the deadline; you need 1.7 turns; the first turn must start by Oct 2027. 1 of the 5 turns cannot complete before the deadline.",
    );
  });

  it("with the blended 24.64 % take on new lots the answer is 8.33 lots/month and 130.23 lots over 6 farms; the named mix costs the extra 0.1", () => {
    const blended = solveWarPlan(
      { ...d.inputs, investorMix: [{ investorId: null, name: "Blended", dealType: "profit_share", ratePct: realm.oracleDefaults.investorTakePct, capital: 1e9 }] },
      realm,
    );
    expect(realm.oracleDefaults.investorTakePct).toBe(24.64);
    expect(blended.required.closingsPerMonth).toBe(8.33);
    expect(blended.required.lotsNeeded).toBe(130.23);
    expect(blended.required.farmsToBuy).toBe(6);
    expect(blended.required.closingsPerMonth).toBeLessThan(profit.required.closingsPerMonth);
  });

  it("the buffer column adds one farm ($468,520) at the last purchase and still exits on the deadline", () => {
    const b = profit.buffer;
    expect(b.farmsToBuy).toBe(8);
    expect(b.capitalToRaise).toBe(profit.required.capitalToRaise + 468_520);
    expect(b.lastPurchaseDate).toBe("2027-07-31");
    expect(b.exitDate).toBe("2027-12-31");
    expect(b.inventoryAtDeadline).toBe(19.21);
    expect(b.unfunded).toBe(0);
    expect(b.funding.map((f) => [f.name, f.amount])).toEqual([
      ["Kevin Concua", 1_423_128],
      ["Townson Family", 1_701_000],
      ["Julio Arriola", 390_861],
      ["Rony Schumann", 233_171],
    ]);
  });

  it("the current pace (4.73/month, a farm every 1.51 months since Mar 2026) lands at $6.6M on the deadline and exits 2029-01-09; Kevin's capital turns twice", () => {
    const c = profit.current;
    expect(c.closingsPerMonth).toBe(4.73);
    expect(c.hitsDeadline).toBe(false);
    expect(c.exitDate).toBe("2029-01-09");
    expect(c.targetAtDeadline).toBe(6_619_557.99);
    expect(c.premise).toBe("4.73 lots/month and a farm every 1.51 months (since Mar 2026) — the trailing averages, farms funded from your mix in order.");
    expect(c.farmsToBuy).toBe(10);
    expect(c.totalDeployed).toBe(10 * 468_520);
    // five of the ten farms are bought with capital back from the first ones
    expect(c.capitalToRaise).toBe(5 * 468_520);
    expect(c.peakOutstanding).toBe(5 * 468_520);
    expect(c.unfunded).toBe(0);
    expect(c.funding.map((f) => [f.name, f.amount, f.deployed])).toEqual([
      ["Kevin Concua", 1_423_128, 2_846_256],
      ["Townson Family", 919_472, 1_838_944],
    ]);
    expect(c.rows.filter((r) => r.flags.includes("too_late")).map((r) => r.monthIndex)).toEqual([14, 15]);
    expect(c.rows.filter((r) => r.flags.includes("turn_incomplete")).map((r) => r.monthIndex)).toEqual([11, 12, 14, 15]);
    expect(c.flaggedMonths).toBe(4);
    expect(profit.required.daysEarlierThanCurrent).toBe(375);
    // the all-time cadence (1.72 months) bought nine farms and exited a month later, on the same $6.6M at the deadline
    expect(allTime.warPlan.current).toMatchObject({ exitDate: "2029-02-14", targetAtDeadline: 6_619_557.99, farmsToBuy: 9 });
  });

  it("cash mode needs materially more lots (255 vs 132): every note sells at 80 % and every sponsor is paid out first", () => {
    const cash = solveWarPlan({ ...d.inputs, targetMode: "cash_in_bank" }, realm);
    expect(cash.feasible).toBe(true);
    expect(cash.maxPurchaseMonth).toBe(8);
    expect(cash.lastClosingDate).toBe("2027-09-30");
    const r = cash.required;
    expect(r.lotsNeeded).toBe(254.56);
    expect(r.lotsNeeded).toBeGreaterThan(profit.required.lotsNeeded * 1.5);
    expect(r.closingsPerMonth).toBe(20.15);
    expect(r.farmsToBuy).toBe(19);
    expect(r.lastPurchaseDate).toBe("2027-04-30");
    expect(r.capitalToRaise).toBe(8_433_360);
    expect(r.unfunded).toBe(4_159_356);
    expect(r.funding).toHaveLength(5);
    expect(r.hitsDeadline).toBe(true);
    expect(r.targetAtDeadline).toBeGreaterThanOrEqual(10_000_000);
    expect(r.rows[0]?.cumulativeNet).toBeLessThan(0);
    // October to December 2027 only harvest notes
    expect(r.rows.slice(13).map((row) => row.lotsClosed)).toEqual([0, 0, 0]);
    expect(cash.verdict).toContain("until Sep 2027 (then only note sales)");
    expect(cash.verdict).toContain("unfunded $4.2M");
    // the first farm is bought this month and its 7-month turn is back before the last purchase, so one farm rides on recycled capital
    expect(cash.rotation).toMatchObject({ totalDeployed: 19 * 468_520, peakOutstanding: 8_433_360, recycled: 468_520, turnsNeeded: 1.06, turnsIncomplete: 0, firstTurnStartBy: "2026-09-30" });
    // the buffer farm's unsold lots are land, not cash: the cushion costs its price at the deadline
    expect(cash.buffer.targetAtDeadline).toBe(round2(r.targetAtDeadline - 468_520));
  });

  it("12.1-lot farms need fewer farms than 10-lot farms (6 vs 7) at the same land cost per lot", () => {
    const big = solveWarPlan({ ...d.inputs, lotsPerFarm: 12.1, farmCost: Math.round(12.1 * d.real.defaultLandCostPerLot) }, realm);
    expect(big.inputs.farmCost).toBe(566_909);
    expect(big.required.farmsToBuy).toBe(6);
    expect(profit.required.farmsToBuy).toBeGreaterThanOrEqual(big.required.farmsToBuy);
    expect(big.required.closingsPerMonth).toBeCloseTo(profit.required.closingsPerMonth, 1);
  });

  it("changing the deadline changes the verdict: by 2028-12-31 it is 4.35 lots/month with 5 farms, the last in Jul 2028", () => {
    const later = solveWarPlan({ ...d.inputs, deadline: "2028-12-31" }, realm);
    expect(later.verdict).not.toBe(profit.verdict);
    expect(later.deadlineMonthIndex).toBe(28);
    expect(later.required.closingsPerMonth).toBe(4.35);
    expect(later.required.farmsToBuy).toBe(5);
    expect(later.required.lastPurchaseDate).toBe("2028-07-31");
    expect(later.verdict).toContain("Jul 2028");
  });

  it("a cash target by 2027-03-31 is out of reach and says so", () => {
    const soon = solveWarPlan({ ...d.inputs, targetMode: "cash_in_bank", deadline: "2027-03-31" }, realm);
    expect(soon.feasible).toBe(false);
    expect(soon.verdict).toBe(
      "No pace reaches $10.0M by 2027-03-31: even 12.9 lots/month with 0 farms and $0 raised lands at $1.0M. Push the deadline or lower the target.",
    );
    expect(soon.rotation.headline).toContain("no capital turn helps");
  });

  it("changes nothing in the Oracle's futures", () => {
    expect(realm.futures.closingsOnly.exitDate).toBe("2029-01-11");
    expect(realm.futures.current.exitDate).toBe("2028-07-11");
    expect(realm.futures.required.exitDate).toBe("2027-12-11");
    expect(realm.futures.oneMoreFarm.exitDate).toBe("2028-05-11");
  });
});

describe("fixture: EXPECTED (reservations first-class)", () => {
  const e = realm.expected;

  it("7 reservations were made in September 2026, all still live (Lamar Lot 5's pledge now belongs to September 2025), none closed this month", () => {
    expect(e.thisMonth).toEqual({ month: "2026-09", reservations: 7, closings: 0, expectedReservations: 3, expectedClosings: 2.25, expectedNetProfit: 205_734.27 });
    expect(realm.lots.filter((l) => l.reservationDate?.startsWith("2026-09"))).toHaveLength(7);
    expect(realm.lots.filter((l) => l.reservationDate?.startsWith("2026-09") && l.stage === "reserved")).toHaveLength(7);
  });

  it("8 reservations are expected to close in November 2026 — 6 closings at 75 %, $318,051.94 of expected net profit", () => {
    const nov = e.expectedByMonth.find((m) => m.month === "2026-11");
    expect(nov).toMatchObject({ count: 8, expectedClosings: 6, expectedNetProfit: 318_051.94, netProfitAtStake: 424_069.22, past: false });
    expect(nov?.expectedClosings).toBe(round2(8 * 0.75));
    const names = (nov?.propertyIds ?? []).map((id) => realm.lots.find((l) => l.propertyId === id)?.name).sort();
    expect(names).toEqual(["Franklin 2 — Lot 11", "Promised Valley — Lot 19", "Titus — Lot 4", "Titus — Lot 5", "Wichita — Lot 12", "Wichita — Lot 13", "Wichita — Lot 26", "Wichita — Lot 30"]);
    // next month (October) from the Throne Room's strip
    expect(e.nextMonth).toEqual({ month: "2026-10", reservations: 0, closings: 0, expectedReservations: 6, expectedClosings: 4.5, expectedNetProfit: 309_182.27 });
    expect(e.expectedByMonth.map((m) => [m.month, m.count, m.past])).toEqual([
      ["2026-07", 6, true],
      ["2026-08", 9, true],
      ["2026-09", 3, false],
      ["2026-10", 6, false],
      ["2026-11", 8, false],
      ["2026-12", 1, false],
    ]);
  });

  it("the deadline demands 8.44 closings/month, i.e. 11.25 reservations/month at 75 % conversion; the realm reserves 7.1 and closes 4.73", () => {
    expect(e.requiredClosingsPerMonth).toBe(8.44);
    expect(e.requiredClosingsPerMonth).toBe(realm.goal.requiredLotsPerMonthToHitDeadline);
    expect(e.requiredReservationsPerMonth).toBe(11.25);
    expect(e.requiredReservationsPerMonth).toBe(round2(8.44 / 0.75));
    expect(e.reservationsTrailing).toBe(21);
    expect(e.reservationsPerMonth).toBe(7.1);
    expect(e.reservationsPerMonth).toBe(realm.pipeline.reservationsMadePerMonth);
    expect(e.closingsTrailing).toBe(14);
    expect(e.closingsPerMonth).toBe(4.73);
    expect(e.closingsPerMonth).toBe(realm.goal.closedLotsPerMonth);
    expect(e.conversionPct).toBe(75);
    expect(e.conversionSource).toBe("with_cancellations");
  });

  it("every live reservation has an expected close: reservation + the farm's median (Titus 73, Lamar 42, Promised Valley 90), else the realm's 61.5", () => {
    expect(e.lots).toHaveLength(33);
    expect(e.undatedCount).toBe(0);
    const by = new Map(e.lots.map((l) => [l.lotName, l]));
    expect(by.get("Titus — Lot 2")).toMatchObject({ reservationDate: "2026-05-02", medianDaysToClose: 73, medianSource: "farm", expectedCloseDate: "2026-07-14", expectedMonth: "2026-07", overdue: true, daysWaiting: 132, daysToExpectedClose: -59, netProfitAtStake: 60_460.5, expectedNetProfit: 45_345.38 });
    expect(by.get("Avery — Lot 12")).toMatchObject({ medianDaysToClose: 61.5, medianSource: "realm", expectedCloseDate: "2026-10-01", overdue: false });
    expect(by.get("Lamar — Lot 1")).toMatchObject({ reservationDate: "2026-08-26", medianDaysToClose: 42, expectedCloseDate: "2026-10-07" });
    expect(by.get("Promised Valley — Lot 14")).toMatchObject({ reservationDate: "2026-09-08", medianDaysToClose: 90, expectedCloseDate: "2026-12-07", expectedMonth: "2026-12" });
    expect(by.get("Titus — Lot 2")?.expectedNetProfit).toBe(round2(60_460.5 * 0.75));
    // soonest expected close first
    for (let i = 1; i < e.lots.length; i++) expect((e.lots[i - 1]?.expectedCloseDate ?? "") <= (e.lots[i]?.expectedCloseDate ?? "")).toBe(true);
  });

  it("Committed: $1,648,392.95 expected from the 33 reservations ($2,197,857.18 at stake), landing by December 2026, most of it in November; 16 are overdue ($827,531.50)", () => {
    expect(e.committedNetProfit).toBe(1_648_392.95);
    expect(e.netProfitAtStake).toBe(2_197_857.18);
    expect(e.netProfitAtStake).toBe(realm.pipeline.pipelineNetProfit);
    expect(Math.abs(e.committedNetProfit - round2(e.netProfitAtStake * 0.75))).toBeLessThan(0.2);
    expect(e.liveReservations).toBe(33);
    expect(e.landsBy).toBe("2026-12");
    expect(e.peakMonth).toBe("2026-11");
    expect(e.overdueCount).toBe(16);
    expect(e.overdueNetProfit).toBe(827_531.5);
    // the overdue reservations are exactly the stuck ones
    expect(new Set(e.lots.filter((l) => l.overdue).map((l) => l.propertyId))).toEqual(realm.pipeline.stuckIds);
  });

  it("OXYGEN: 340 provisional days from the 33 reservations, shown apart from the 534 confirmed; the closings-only score is untouched", () => {
    expect(realm.oxygen.totalDaysGained).toBe(534);
    expect(realm.oxygen.provisionalDaysGained).toBe(340);
    expect(realm.oxygen.provisional.size).toBe(33);
    expect(realm.oxygen.conversionPct).toBe(75);
    const w26 = realm.lots.find((l) => l.name === "Wichita — Lot 26")!;
    expect(realm.oxygen.provisional.get(w26.propertyId)).toMatchObject({ reservationDate: "2026-09-03", measuredOn: "2026-09-03", netProfitAtStake: 39_784.37, daysIfClosed: 4, provisionalDays: 3, paceThatDay: 9_145.63 });
    // a reservation made when the realm was slow (May 2, pace $403/day) is worth many provisional days — the same rule closings follow
    expect(realm.oxygen.provisionalRanked[0]).toMatchObject({ lotName: "Titus — Lot 2", daysIfClosed: 150, provisionalDays: 113, paceThatDay: 402.8 });
    expect(realm.oxygen.provisionalRanked[0]?.provisionalDays).toBe(Math.round(150 * 0.75));
  });

  it("reservation streaks: 6 consecutive weeks of pledges ending 2026-06-21, 7 pledges in W22, 17 in May 2026, 8 consecutive months and counting", () => {
    const r = realm.reservationStreaks;
    expect(r).toMatchObject({ currentWeeks: 3, bestWeeks: 6, bestWeeksEndedOn: "2026-06-21", closedThisWeek: true, bestMonths: 8, currentMonths: 8 });
    expect(r.bestWeek).toEqual({ week: "2026-W22", weekStart: "2026-05-25", count: 7, netProfit: 350_588.51 });
    expect(r.bestMonth).toEqual({ month: "2026-05", count: 17, netProfit: 904_432 });
    // Lamar Lot 5's pledge (2025-09-07) adds a 29th week with a pledge
    expect(r.weeks).toHaveLength(29);
    expect(r.months).toHaveLength(11);
    // closing streaks are unchanged
    expect(realm.streaks.bestWeeks).toBe(3);
    expect(realm.streaks.weeks).toHaveLength(15);
  });

  it("the chronicle narrates live reservations with their expected close and provisional days; no cancellation exists in the snapshot", () => {
    const w26 = realm.lots.find((l) => l.name === "Wichita — Lot 26")!;
    expect(realm.narrative.get(`reservation:${w26.propertyId}`)).toBe(
      "On September 3, Julia Rodriguez pledged for Lot 26 of Wichita at $117,600 — the closing is expected around November 5, 3 provisional days gained.",
    );
    const t2 = realm.lots.find((l) => l.name === "Titus — Lot 2")!;
    expect(realm.narrative.get(`reservation:${t2.propertyId}`)).toBe(
      "On May 2, Crystal Thompson pledged for Lot 2 of Titus at $135,412 — the closing was expected around July 14 and is 59 days late, 113 provisional days gained.",
    );
    expect(realm.events.filter((ev) => ev.kind === "cancellation")).toHaveLength(0);
    expect(realm.events.filter((ev) => ev.kind === "reservation")).toHaveLength(69);
  });

  it("changes nothing in the goal, pace, oxygen score or debt", () => {
    expect(realm.goal.netProfitToDate).toBe(2_236_378.34);
    expect(realm.goal.closedLotsPerMonth).toBe(4.73);
    expect(realm.oxygen.totalDaysGained).toBe(534);
    expect(realm.debt.requiredNetProfitPerDay).toBe(16_310.13);
  });
});
