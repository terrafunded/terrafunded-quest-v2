/**
 * Phase 2 "Epic" numbers reproduced from the live snapshot (src/domain/__fixtures__/payments.json,
 * 2026-09-11). If the fixture is regenerated these change; document the drift in PROGRESS.md.
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
    expect(realm.debt.interestPerDay).toBe(1_253);
  });

  it("has actually earned $10,026.04 per day since Mar 2026 ($1,945,051.41 over 194 days) — the all-time $6,762.81 since 2025-10-10 stays on record", () => {
    expect(realm.era).toMatchObject({ start: "2026-03-01", label: "Mar 2026", since: "since Mar 2026", monthsOfHistory: 6 });
    expect(realm.debt).toMatchObject({
      actualNetProfitPerDay: 10_026.04,
      actualSince: "2026-03-01",
      actualSinceLabel: "since Mar 2026",
      actualEraClipped: true,
      actualDays: 194,
      actualNetProfit: 1_945_051.41,
      actualNetProfitPerDayAllTime: 6_762.81,
      firstCloseDate: "2025-10-10",
    });
    expect(realm.debt.actualNetProfitPerDay).toBe(round2(1_945_051.41 / 194));
    // the eight dated closings of Oct 2025 – Jan 2026 ($297,718.66) and the undated Eastland Lot 6 ($29,534.25) are real money in the total, not in the pace
    expect(realm.goal.netProfitToDate).toBe(2_272_304.32);
    expect(round2(realm.goal.netProfitToDate - realm.debt.actualNetProfit)).toBe(327_252.91);
    const undated = realm.lots.find((l) => l.name === "Eastland — Lot 6");
    expect(undated?.closeDate).toBeNull();
    expect(undated?.netProfit).toBe(29_534.25);
    // the per-day figure with ERA_START is higher than without it
    const allTime = buildRealm(fixture, ASOF, { eraStart: null });
    expect(allTime.era).toBeNull();
    expect(allTime.debt.actualNetProfitPerDay).toBe(6_762.81);
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
    expect(byName["Avery"]?.target).toBe(538_322.81);
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
    expect(realm.streaks.bestWeek).toEqual({ week: "2026-W22", weekStart: "2026-05-25", count: 7, netProfit: 553_411.03 });
    expect(realm.streaks.bestMonth).toEqual({ month: "2026-05", count: 13, netProfit: 1_006_874.4 });
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
    // reservation pledges: every pledge since Mar 2026, 8 earlier ones left out of the record
    expect(realm.reservationStreaks).toMatchObject({ bestSinceLabel: "since Mar 2026", bestExcluded: 8 });
  });
});

describe("fixture: trophies with rarity", () => {
  it("has 29 trophies, 21 earned, every one with a rarity", () => {
    expect(realm.trophies).toHaveLength(29);
    expect(realm.trophies.filter((t) => t.earned)).toHaveLength(21);
    expect(realm.trophies.every((t) => ["common", "rare", "epic", "legendary"].includes(t.rarity))).toBe(true);
    const byId = Object.fromEntries(realm.trophies.map((t) => [t.id, t]));
    expect(byId["streak_weeks_3"]?.earned).toBe(true);
    expect(byId["busy_week_3"]?.earned).toBe(true);
    expect(byId["first_liberation"]?.earned).toBe(true);
    expect(byId["first_liberation"]?.earnedAt).toBe("2026-05-19");
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
  it("four futures: reservations close first (2028-06-11), the required pace lands on the deadline month, closings-only is the old 2029-03-11 line", () => {
    const f = realm.futures;
    expect(f.all.map((x) => x.id)).toEqual(["current_pace", "required_pace", "one_more_farm", "closings_only"]);
    expect(f.current.exitDate).toBe("2028-06-11");
    expect(f.current.hitsDeadline).toBe(false);
    expect(f.current.params.lotsPerMonth).toBe(5.54);
    expect(f.current.params.lotsPerMonth).toBe(round2(realm.expected.reservationsPerMonth * (realm.expected.conversionPct / 100)));
    expect(f.current.scheduled).toHaveLength(33);
    expect(f.required.exitDate).toBe("2027-12-11");
    expect(f.required.hitsDeadline).toBe(true);
    expect(f.required.daysEarlierThanCurrent).toBe(183);
    expect(f.oneMoreFarm.exitDate).toBe("2028-04-11");
    expect(f.oneMoreFarm.daysEarlierThanCurrent).toBe(61);
    expect(f.oneMoreFarm.params.lotsPerMonth).toBe(6.33);
    expect(f.oneMoreFarm.startInventory).toBe(round2(71 + realm.oracleDefaults.avgLotsPerFarm));
    expect(f.closingsOnly.exitDate).toBe("2029-03-11");
    expect(f.closingsOnly.daysEarlierThanCurrent).toBe(-273);
    expect(f.closingsOnly.params).toEqual(realm.oracleDefaults);
    expect(f.closingsOnly.params.lotsPerMonth).toBe(4.4);
  });

  it("the current pace books 21 of the 33 reservations in the first month (16 overdue + 5 expected by Oct 11), 8 in the second, 4 in the third; the steady pace starts after the 63-day lag", () => {
    const s = realm.futures.current.result.series;
    expect(s[0]).toMatchObject({ date: "2026-10-11", scheduledLotsClosed: 15.64, flatLotsClosed: 0, lotsClosed: 15.64 });
    expect(s[0]?.scheduledLotsClosed).toBe(round2(21 * 0.7447));
    expect(s[1]).toMatchObject({ date: "2026-11-11", scheduledLotsClosed: 5.96, flatLotsClosed: 0 });
    expect(s[2]).toMatchObject({ date: "2026-12-11", scheduledLotsClosed: 2.98, flatLotsClosed: 5.17 });
    expect(s[3]).toMatchObject({ date: "2027-01-11", scheduledLotsClosed: 0, flatLotsClosed: 5.54, lotsClosed: 5.54 });
    expect(round2((s[0]?.scheduledLotsClosed ?? 0) + (s[1]?.scheduledLotsClosed ?? 0) + (s[2]?.scheduledLotsClosed ?? 0))).toBe(round2(33 * 0.7447));
    // the first month books the committed net profit of those 21 reservations, not the average per lot
    const committedFirstMonth = realm.expected.lots.filter((l) => (l.expectedCloseDate ?? "") <= "2026-10-11").reduce((a, l) => a + l.expectedNetProfit, 0);
    expect(s[0]?.cumulativeNetProfit).toBe(round2(realm.goal.netProfitToDate + committedFirstMonth));
    expect(realm.futures.current.premise).toBe(
      "33 live reservations close on their expected dates at 74.47% conversion (16 already overdue, counted in the first month); after the 63-day lag, new reservations at 7.44/month keep closing at that rate — 5.54 lots/month — with a new farm every 1.51 months (since Mar 2026).",
    );
    expect(realm.futures.closingsOnly.premise).toBe("4.4 closings/month and a new farm every 1.51 months (since Mar 2026) — the trailing closing pace alone, blind to the 33 live reservations.");
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
    expect(realm.futures.required.params.newFarmEveryMonths).toBe(1.4);
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
  const allTime = buildRealm(fixture, ASOF, { eraStart: null });

  it("prefills every input from the realm: 10-lot farms at $460,080 (recent land), 74.47 % conversion, 2.63 months to first close, a 7.46-month cycle projected since Mar 2026, flat pace, five sponsors", () => {
    expect(d.inputs).toMatchObject({
      target: 10_000_000,
      deadline: "2027-12-31",
      targetMode: "profit_at_closing",
      lotsPerFarm: 10,
      farmCost: 460_080,
      adSpendPerClosing: 2_500,
      conversionPct: 74.47,
      farmToFirstCloseMonths: 2.63,
      noteSaleLagMonths: 3.17,
      cycleMonths: 7.46,
      seasonal: false,
    });
    expect(d.real).toMatchObject({
      lotsPerFarm: 12.11,
      landCostPerLot: 48_232,
      recentLandCostPerLot: 46_008,
      recentFarms: ["Franklin", "Avery", "Wichita"],
      defaultLandCostPerLot: 46_008,
      eraSince: "since Mar 2026",
      conversionPct: 74.47,
      conversionWithCancellationsPct: 74.47,
      cancellationRatePct: 0,
      cancelledReservations: 0,
      farmToFirstCloseMonths: 2.63,
      farmToFirstCloseFarms: 6,
      medianDaysToClose: 63,
      noteSaleLagMonths: 3.17,
      closingsPerMonth: 4.4,
      inventory: 71,
      cycleDays: 227,
      cycleMonths: 7.46,
      cycleSource: "projected",
      cycleFarms: 4,
      cycleExcludedFarms: ["Lamar"],
      seasonalityApplied: false,
      seasonalityReason: "not enough history for seasonality",
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

  it("land cost trend since Mar 2026: the three most recent purchases (Franklin, Avery, Wichita) average $46,008 per lot against $48,232 all-time", () => {
    const recent = realm.farms.filter((f) => ["Franklin", "Avery", "Wichita"].includes(f.name));
    expect(recent.map((f) => f.fundingDate).sort()).toEqual(["2026-04-15", "2026-06-16", "2026-07-31"]);
    expect(Math.round(recent.reduce((a, f) => a + f.landCostPerLot, 0) / 3)).toBe(46_008);
    // Franklin 2 closes on 2026-10-15, after asOf, so it is not a purchase yet.
    expect(d.real.recentFarms).not.toContain("Franklin 2");
    expect(d.inputs.farmCost).toBe(46_008 * 10);
    // all three era purchases are the three most recent purchases anyway: the era changes nothing here today
    expect(recentLandCostPerLot(realm.farms, ASOF)).toEqual({ perLot: 46_008, farms: ["Franklin", "Avery", "Wichita"], since: "2026-03-01", sinceLabel: "since Mar 2026" });
    expect(recentLandCostPerLot(realm.farms, ASOF, 3, null)).toEqual({ perLot: 46_008, farms: ["Franklin", "Avery", "Wichita"], since: null, sinceLabel: null });
    // asked for more than the era holds, the trend stops at the era: four purchases since Mar 2026, never Titus (Nov 2025)
    expect(recentLandCostPerLot(realm.farms, ASOF, 5).farms).toEqual(["Franklin", "Avery", "Wichita", "Freestone"]);
    expect(recentLandCostPerLot(realm.farms, ASOF, 5, null).farms).toEqual(["Franklin", "Avery", "Wichita", "Freestone", "Titus"]);
  });

  it("owes sponsors $4,235,797.47 today ($3,579,399.48 of capital + $656,397.99 of unpaid take) and has kept $1,362,503.84 of cash", () => {
    expect(profit.ledger).toEqual({ capitalOwed: 3_579_399.48, paidOut: 793_990.46, unpaidTake: 656_397.99, cashKept: 1_362_503.84, owedToday: 4_235_797.47 });
    expect(profit.ledger.capitalOwed).toBe(realm.debt.capitalOwed);
  });

  it("profit mode: ≈8.3 closings/month and ≈130 lots still needed — 6 farms of 10 lots, the last by Jul 2027, $2.8M to raise", () => {
    expect(profit.feasible).toBe(true);
    expect(profit).toMatchObject({ deadlineMonthIndex: 16, monthsToDeadline: 15.63, landLag: 3, closeLag: 2, noteLag: 3, maxPurchaseMonth: 11, lastClosingDate: null, startInventory: 71 });
    const r = profit.required;
    expect(r.closingsPerMonth).toBeCloseTo(8.3, 0);
    expect(r.closingsPerMonth).toBe(8.2);
    expect(r.lotsNeeded).toBeCloseTo(130, -1);
    expect(r.lotsNeeded).toBe(128.19);
    expect(r.farmsToBuy).toBe(6);
    expect(r.lastPurchaseDate).toBe("2027-07-31");
    expect(r.capitalToRaise).toBe(6 * 460_080);
    expect(r.totalDeployed).toBe(6 * 460_080);
    expect(r.funding.map((f) => [f.name, f.amount])).toEqual([
      ["Kevin Concua", 1_398_628],
      ["Townson Family", 1_361_852],
    ]);
    expect(r.unfunded).toBe(0);
    expect(r.adSpendPerMonth).toBe(27_527.86);
    expect(r.adSpendPerMonth).toBe(round2((8.2 / 0.7447) * 2_500));
    expect(r.reservationsPerMonth).toBe(11.01);
    expect(r.noteSalesPerMonth).toBe(8.2);
    expect(r.exitDate).toBe("2027-12-31");
    expect(r.hitsDeadline).toBe(true);
    expect(r.targetAtDeadline).toBeGreaterThanOrEqual(10_000_000);
    expect(r.rows).toHaveLength(16);
    // flat: with under 12 months of history since Mar 2026 no seasonal shape is applied, so every month asks the same 8.2 (the first prorated)
    expect(r.rows[0]).toMatchObject({ date: "2026-09-30", lotsClosed: 5.19, flatLotsClosed: 5.19, seasonalFactor: 1, farmsBought: 0 });
    expect(r.rows.at(-1)).toMatchObject({ date: "2027-12-31", lotsClosed: 8.2, flatLotsClosed: 8.2, seasonalFactor: 1, notesSold: 8.2, cumulativeNet: 10_000_598.31, inventory: 2.81 });
    expect(r.rows.at(-1)?.capitalReturned).toEqual([1_398_628, 1_232_722.88, 0, 0, 0]);
    expect(profit.verdict).toBe(
      "Buy 6 farms, the last one no later than Jul 2027, raise $2.8M (Kevin Concua $1.4M, Townson Family $1.4M), close 8.2 lots/month, sell 8.2 notes/month and spend at least $28K/month on ads.",
    );
    expect(profit.verdict).toMatch(/\$[\d.,]+[KM]?/);
    expect(profit.verdict).toMatch(/\b\d+ farms?\b/);
  });

  it("seasonality: only 6 months of history since Mar 2026 (29 of the 37 dated closings), so no seasonal profile is applied — 'not enough history for seasonality' — and the plan is flat even when asked to be seasonal", () => {
    const s = realm.seasonality;
    expect(s).toMatchObject({
      applied: false,
      reason: "not enough history for seasonality",
      monthsOfHistory: 6,
      monthsRequired: 12,
      closings: 29,
      excluded: 8,
      since: "2026-03-01",
      sinceLabel: "since Mar 2026",
      peakMonth: null,
      troughMonth: null,
    });
    // the eight closings of Oct 2025 – Jan 2026 are out of the counts; Apr–Aug 2026 remain
    expect(s.counts).toEqual([0, 0, 0, 1, 13, 2, 9, 4, 0, 0, 0, 0]);
    expect(s.factors).toEqual(Array.from({ length: 12 }, () => 1));
    expect(round2(s.shares.reduce((a, b) => a + b, 0))).toBe(1);
    // the War Plan starts flat and stays flat when the toggle is forced on
    expect(d.inputs.seasonal).toBe(false);
    expect(profit.seasonality).toEqual(Array.from({ length: 12 }, () => 1));
    expect(profit.required.rows.every((r) => r.seasonalFactor === 1 && r.lotsClosed === r.flatLotsClosed)).toBe(true);
    expect(solveWarPlan({ ...d.inputs, seasonal: true }, realm).seasonality).toEqual(Array.from({ length: 12 }, () => 1));
    expect(profit.current.rows.every((r) => r.seasonalFactor === 1)).toBe(true);
    // without the era there are 11 months of history (first closing 2025-10-10): still not enough
    expect(allTime.seasonality).toMatchObject({ applied: false, monthsOfHistory: 11, closings: 37, reason: "not enough history for seasonality", since: null });
    expect(allTime.seasonality.counts).toEqual([1, 0, 0, 1, 13, 2, 9, 4, 0, 4, 3, 0]);
  });

  it("seasonality: the profile becomes available on 2027-03-01 (12 whole months since Mar 2026), not a day earlier; forced today it would peak in May at ×2.65", () => {
    const eve = computeSeasonality(realm.lots, new Date("2027-02-28T00:00:00Z"));
    expect(eve).toMatchObject({ applied: false, monthsOfHistory: 11, reason: "not enough history for seasonality" });
    const anniversary = computeSeasonality(realm.lots, new Date("2027-03-01T00:00:00Z"));
    expect(anniversary).toMatchObject({ applied: true, monthsOfHistory: 12, reason: null, closings: 29, peakMonth: 4 });
    // the shape the era closings would give: May ×2.65, Sep–Mar at the 25 % floor
    const forced = computeSeasonality(realm.lots, ASOF, { minMonths: 0 });
    expect(forced.applied).toBe(true);
    expect(forced.factors).toEqual([0.25, 0.25, 0.25, 1.37, 2.648, 2.374, 2.191, 1.552, 0.365, 0.25, 0.25, 0.25]);
    expect(round2(forced.factors.reduce((a, b) => a + b, 0))).toBe(12);
    expect(forced).toMatchObject({ peakMonth: 4, troughMonth: 0 });
    // fed to the War Plan it shapes the required plan month by month while the flat average stays the plan's average
    const shaped = solveWarPlan({ ...d.inputs, seasonal: true }, { ...realm, seasonality: forced });
    expect(shaped.seasonality).toEqual([0.301, 0.301, 0.301, 1.65, 3.189, 2.859, 2.639, 1.869, 0.44, 0.301, 0.301, 0.301]);
    expect(shaped.required.closingsPerMonth).toBe(8.19);
    expect(shaped.required.rows.find((r) => r.date === "2027-05-31")).toMatchObject({ lotsClosed: 26.12, flatLotsClosed: 8.19, seasonalFactor: 3.189 });
    expect(shaped.required.rows.find((r) => r.date === "2027-01-31")).toMatchObject({ lotsClosed: 2.47, flatLotsClosed: 8.19, seasonalFactor: 0.301 });
    const seasonalTotal = shaped.required.rows.reduce((a, r) => a + r.lotsClosed, 0);
    const flatTotal = shaped.required.rows.reduce((a, r) => a + r.flatLotsClosed, 0);
    expect(Math.abs(seasonalTotal - flatTotal)).toBeLessThan(0.1);
  });

  it("cancellations: no file case in the snapshot is cancelled, so the rate is 0 % and conversion with cancellations equals conversion", () => {
    expect(fixture.fileCases.filter((c) => c.status === "cancelled")).toHaveLength(0);
    expect(realm.pipeline.conversion).toMatchObject({ cohort: 47, closed: 35, stillReserved: 12, pct: 74.47, cancelled: 0, cohortWithCancellations: 47, pctWithCancellations: 74.47, cancellationRatePct: 0 });
    expect(realm.pipeline.cancelledReservations).toBe(0);
    expect(realm.lots.every((l) => l.cancelledFileCases === 0)).toBe(true);
  });

  it("rotation since Mar 2026: Lamar's real 271-day turn predates the era, so the cycle is projected from the four captive era farms — 227 days (7.46 months), Avery the benchmark — and no farm can be graded against a real curve", () => {
    const b = realm.rotation;
    expect(b.source).toBe("projected");
    expect(b.cycleDays).toBe(227);
    expect(b.cycleMonths).toBe(7.46);
    expect(b.since).toBe("2026-03-01");
    expect(b.sinceLabel).toBe("since Mar 2026");
    expect(b.cycles.map((c) => [c.farmName, c.fundingDate, c.liberationDate, c.days, c.projected])).toEqual([
      ["Wichita", "2026-04-15", "2026-11-05", 204, true],
      ["Freestone", "2026-04-14", "2026-09-11", 150, true],
      ["Avery", "2026-06-16", "2027-02-21", 250, true],
      ["Franklin", "2026-07-31", "2027-07-12", 346, true],
    ]);
    expect(b.cycleDays).toBe((204 + 250) / 2);
    expect(b.benchmark).toMatchObject({ farmName: "Avery", investorName: "Kevin Concua", fundingDate: "2026-06-16", liberationDate: "2027-02-21", days: 250, months: 8.21, projected: true });
    // the real turn is still on record, just not in the median
    expect(b.excludedCycles).toHaveLength(1);
    expect(b.excludedCycles[0]).toMatchObject({ farmName: "Lamar", fundingDate: "2025-08-21", liberationDate: "2026-05-19", days: 271, months: 8.9, projected: false });
    expect(b.excludedCycles[0]?.days).toBe(realm.liberation.freedHostages[0]?.daysHeld);
    // liberation keeps the full history: one turn completed
    expect(b.turnsCompleted).toBe(1);
    expect(b.capitalOutstanding).toBe(3_579_399.48);
    // a projected benchmark has no distribution curve, so nothing is graded
    expect(b.curve).toEqual([]);
    expect(b.grades.map((g) => [g.farmName, g.verdict, g.daysElapsed, g.pctReturned, g.daysToGo])).toEqual([
      ["Lamar", "unrated", 271, 100, 0],
      ["Eastland", "unrated", 382, 0, 0],
      ["Titus", "unrated", 304, 0, 228],
      ["Freestone", "unrated", 150, 0, 0],
      ["Wichita", "unrated", 149, 11.97, 55],
      ["Avery", "benchmark", 87, 0, 163],
      ["Franklin", "unrated", 42, 0, 304],
      ["Franklin 2", "unrated", -34, 0, null],
    ]);
    expect(b.grades.find((g) => g.farmName === "Wichita")).toMatchObject({ benchmarkPctAtSameDay: null, projectedLiberationDate: "2026-11-05" });
    // Eastland's sales already cover its capital; the payout has not been distributed
    expect(b.nextLiberation?.farmName).toBe("Eastland");
    expect(b.nextLiberation?.daysToGo).toBe(0);
  });

  it("rotation over the whole history: Lamar's real cycle is 271 days (2025-08-21 → 2026-05-19, 8.9 months) and every other sponsor farm is behind it", () => {
    const b = allTime.rotation;
    expect(b.source).toBe("freed_farms");
    expect(b.cycleDays).toBe(271);
    expect(b.cycleMonths).toBe(8.9);
    expect(b.since).toBeNull();
    expect(b.excludedCycles).toEqual([]);
    expect(b.benchmark).toEqual({
      farmId: b.benchmark?.farmId,
      farmName: "Lamar",
      investorName: "Townson Family",
      fundingDate: "2025-08-21",
      liberationDate: "2026-05-19",
      days: 271,
      months: 8.9,
      projected: false,
    });
    expect(b.benchmark?.days).toBe(allTime.liberation.freedHostages[0]?.daysHeld);
    expect(b.turnsCompleted).toBe(1);
    expect(b.capitalOutstanding).toBe(3_579_399.48);
    // Lamar's curve: 21.9 % after 57 days, 90.2 % after 112, 100 % on day 271
    expect(b.curve.map((c) => [c.day, c.pct])).toEqual([
      [50, 0.84],
      [57, 21.89],
      [68, 22.74],
      [75, 24.84],
      [76, 25.68],
      [112, 90.16],
      [227, 92.68],
      [236, 92.98],
      [267, 93.29],
      [271, 100],
    ]);
    expect(b.grades.map((g) => [g.farmName, g.verdict, g.daysElapsed, g.pctReturned, g.benchmarkPctAtSameDay, g.pctVsBenchmark, g.daysToGo])).toEqual([
      ["Lamar", "benchmark", 271, 100, null, null, 0],
      ["Eastland", "behind", 382, 0, 100, -100, 0],
      ["Titus", "behind", 304, 0, 100, -100, 228],
      ["Freestone", "behind", 150, 0, 90.16, -90.16, 0],
      ["Wichita", "behind", 149, 11.97, 90.16, -78.19, 55],
      ["Avery", "behind", 87, 0, 25.68, -25.68, 163],
      ["Franklin", "on_pace", 42, 0, 0, 0, 304],
      ["Franklin 2", "unrated", -34, 0, null, null, null],
    ]);
    // Wichita returned 11.97 % in 149 days; Lamar had that much after 57
    expect(b.grades.find((g) => g.farmName === "Wichita")).toMatchObject({ benchmarkDaysToSamePct: 57, daysVsBenchmark: -92, projectedLiberationDate: "2026-11-05" });
    expect(b.grades.map((g) => [g.farmName, g.verdict])).toEqual([
      ["Lamar", "benchmark"],
      ["Eastland", "behind"],
      ["Titus", "behind"],
      ["Freestone", "behind"],
      ["Wichita", "behind"],
      ["Avery", "behind"],
      ["Franklin", "on_pace"],
      ["Franklin 2", "unrated"],
    ]);
    expect(allTime.warPlanDefaults.inputs.cycleMonths).toBe(8.9);
    expect(allTime.warPlan.rotation.headline).toBe(
      "With $2.8M of land capital rotating every 8.9 months you reach $10.0M by the deadline; you need 1 turn; the first turn must start by Mar 2027. 5 of the 6 turns cannot complete before the deadline.",
    );
  });

  it("rotation: the required plan turns $2.8M once — every farm is bought Mar–Jul 2027 and the first three are back before the deadline on the 7.5-month cycle", () => {
    const rot = profit.rotation;
    expect(rot).toMatchObject({
      cycleMonths: 7.46,
      totalDeployed: 2_760_480,
      peakOutstanding: 2_760_480,
      newMoney: 2_760_480,
      recycled: 0,
      turnsNeeded: 1,
      turnsCompleted: 1,
      turnsIncomplete: 3,
      farms: 6,
      firstTurnStartBy: "2027-03-31",
      lastTurnCompletes: "2028-02-29",
    });
    expect(rot.perInvestor.map((i) => [i.name, i.deployed, i.fresh, i.peakOutstanding, i.turns])).toEqual([
      ["Kevin Concua", 1_398_628, 1_398_628, 1_398_628, 1],
      ["Townson Family", 1_361_852, 1_361_852, 1_361_852, 1],
    ]);
    expect(rot.headline).toBe(
      "With $2.8M of land capital rotating every 7.5 months you reach $10.0M by the deadline; you need 1 turn; the first turn must start by Mar 2027. 3 of the 6 turns cannot complete before the deadline.",
    );
    expect(rot.headline).toMatch(/\b\d+(\.\d)? turns?\b/);
    expect(profit.required.schedule.map((f) => [f.purchaseMonth, f.turnCompletesMonth, f.turnComplete])).toEqual([
      [7, 14, true],
      [8, 15, true],
      [9, 16, true],
      [10, 17, false],
      [11, 18, false],
      [11, 18, false],
    ]);
    expect(profit.required.rows.filter((r) => r.flags.includes("turn_incomplete")).map((r) => r.monthIndex)).toEqual([10, 11]);
    expect(profit.required.flaggedMonths).toBe(2);
    // no turn completes before a later purchase, so the peak is the whole deployment
    expect(rot.peakOutstanding).toBe(rot.totalDeployed);
  });

  it("rotation: with a 2028-12-31 deadline the first turn completes before the last farm is bought, so the peak ($1.8M) is below the total deployed ($2.3M): 1.25 turns", () => {
    const later = solveWarPlan({ ...d.inputs, deadline: "2028-12-31" }, realm);
    const rot = later.rotation;
    expect(rot).toMatchObject({ totalDeployed: 2_300_400, peakOutstanding: 1_840_320, newMoney: 1_840_320, recycled: 460_080, turnsNeeded: 1.25, turnsIncomplete: 1, farms: 5, firstTurnStartBy: "2027-10-31" });
    expect(rot.peakOutstanding).toBeLessThan(rot.totalDeployed);
    expect(later.required.capitalToRaise).toBe(1_840_320);
    expect(later.required.schedule.map((f) => [f.purchaseMonth, f.turnCompletesMonth, f.recycled])).toEqual([
      [14, 21, 0],
      [17, 24, 0],
      [19, 26, 0],
      [21, 28, 460_080],
      [23, 30, 0],
    ]);
    // Kevin's dollars from the October 2027 farm buy the May 2028 farm: 1.33 turns for him
    expect(rot.perInvestor.map((i) => [i.name, i.deployed, i.fresh, i.turns])).toEqual([
      ["Kevin Concua", 1_858_708, 1_398_628, 1.33],
      ["Townson Family", 441_692, 441_692, 1],
    ]);
    expect(rot.headline).toBe(
      "With $1.8M of land capital rotating every 7.5 months you reach $10.0M by the deadline; you need 1.3 turns; the first turn must start by Oct 2027. 1 of the 5 turns cannot complete before the deadline.",
    );
  });

  it("with the blended 24.41 % take on new lots the answer is 8.17 lots/month and 127.72 lots; Townson's 50 % share on the second farm costs the extra 0.03", () => {
    const blended = solveWarPlan(
      { ...d.inputs, investorMix: [{ investorId: null, name: "Blended", dealType: "profit_share", ratePct: realm.oracleDefaults.investorTakePct, capital: 1e9 }] },
      realm,
    );
    expect(realm.oracleDefaults.investorTakePct).toBe(24.41);
    expect(blended.required.closingsPerMonth).toBe(8.17);
    expect(blended.required.lotsNeeded).toBe(127.72);
    expect(blended.required.farmsToBuy).toBe(6);
    expect(blended.required.closingsPerMonth).toBeLessThan(profit.required.closingsPerMonth);
  });

  it("the buffer column adds one farm ($460,080) at the last purchase and still exits on the deadline", () => {
    const b = profit.buffer;
    expect(b.farmsToBuy).toBe(7);
    expect(b.capitalToRaise).toBe(profit.required.capitalToRaise + 460_080);
    expect(b.lastPurchaseDate).toBe("2027-07-31");
    expect(b.exitDate).toBe("2027-12-31");
    expect(b.inventoryAtDeadline).toBe(12.81);
    expect(b.unfunded).toBe(0);
    expect(b.funding.map((f) => [f.name, f.amount])).toEqual([
      ["Kevin Concua", 1_398_628],
      ["Townson Family", 1_672_000],
      ["Julio Arriola", 149_932],
    ]);
  });

  it("the current pace (4.4/month, a farm every 1.51 months since Mar 2026) lands at $6.4M on the deadline and exits 2029-02-28; Kevin's capital turns twice", () => {
    const c = profit.current;
    expect(c.closingsPerMonth).toBe(4.4);
    expect(c.hitsDeadline).toBe(false);
    expect(c.exitDate).toBe("2029-02-28");
    expect(c.targetAtDeadline).toBe(6_385_331.52);
    expect(c.premise).toBe("4.4 lots/month and a farm every 1.51 months (since Mar 2026) — the trailing averages, farms funded from your mix in order.");
    expect(c.farmsToBuy).toBe(10);
    expect(c.totalDeployed).toBe(10 * 460_080);
    // five of the ten farms are bought with capital back from the first ones
    expect(c.capitalToRaise).toBe(5 * 460_080);
    expect(c.peakOutstanding).toBe(5 * 460_080);
    expect(c.unfunded).toBe(0);
    expect(c.funding.map((f) => [f.name, f.amount, f.deployed])).toEqual([
      ["Kevin Concua", 1_398_628, 2_797_256],
      ["Townson Family", 901_772, 1_803_544],
    ]);
    expect(c.rows.filter((r) => r.flags.includes("too_late")).map((r) => r.monthIndex)).toEqual([14, 15]);
    expect(c.rows.filter((r) => r.flags.includes("turn_incomplete")).map((r) => r.monthIndex)).toEqual([11, 12, 14, 15]);
    expect(c.flaggedMonths).toBe(4);
    expect(profit.required.daysEarlierThanCurrent).toBe(425);
    // the all-time cadence (1.72 months) bought nine farms and exited a month later, on the same $6.4M at the deadline
    expect(allTime.warPlan.current).toMatchObject({ exitDate: "2029-03-26", targetAtDeadline: 6_385_331.52, farmsToBuy: 9 });
  });

  it("cash mode needs materially more lots (247 vs 128): every note sells at 80 % and every sponsor is paid out first", () => {
    const cash = solveWarPlan({ ...d.inputs, targetMode: "cash_in_bank" }, realm);
    expect(cash.feasible).toBe(true);
    expect(cash.maxPurchaseMonth).toBe(8);
    expect(cash.lastClosingDate).toBe("2027-09-30");
    const r = cash.required;
    expect(r.lotsNeeded).toBe(246.98);
    expect(r.lotsNeeded).toBeGreaterThan(profit.required.lotsNeeded * 1.5);
    expect(r.closingsPerMonth).toBe(19.55);
    expect(r.farmsToBuy).toBe(18);
    expect(r.lastPurchaseDate).toBe("2027-04-30");
    expect(r.capitalToRaise).toBe(7_821_360);
    expect(r.unfunded).toBe(3_623_712);
    expect(r.funding).toHaveLength(5);
    expect(r.hitsDeadline).toBe(true);
    expect(r.targetAtDeadline).toBeGreaterThanOrEqual(10_000_000);
    expect(r.rows[0]?.cumulativeNet).toBeLessThan(0);
    // October to December 2027 only harvest notes
    expect(r.rows.slice(13).map((row) => row.lotsClosed)).toEqual([0, 0, 0]);
    expect(cash.verdict).toContain("until Sep 2027 (then only note sales)");
    expect(cash.verdict).toContain("unfunded $3.6M");
    // the first farm is bought this month and its 7-month turn is back before the last purchase, so one farm rides on recycled capital
    expect(cash.rotation).toMatchObject({ totalDeployed: 18 * 460_080, peakOutstanding: 7_821_360, turnsNeeded: 1.06, turnsIncomplete: 0, firstTurnStartBy: "2026-09-30" });
    // the buffer farm's unsold lots are land, not cash: the cushion costs its price at the deadline
    expect(cash.buffer.targetAtDeadline).toBe(round2(r.targetAtDeadline - 460_080));
  });

  it("10-lot farms need at least as many farms as the real 12.1-lot average (6 vs 5)", () => {
    const big = solveWarPlan({ ...d.inputs, lotsPerFarm: 12.1, farmCost: Math.round(12.1 * d.real.defaultLandCostPerLot) }, realm);
    expect(big.inputs.farmCost).toBe(556_697);
    expect(big.required.farmsToBuy).toBe(5);
    expect(profit.required.farmsToBuy).toBeGreaterThanOrEqual(big.required.farmsToBuy);
    expect(big.required.closingsPerMonth).toBeCloseTo(profit.required.closingsPerMonth, 1);
  });

  it("changing the deadline changes the verdict: by 2028-12-31 it is 4.33 lots/month with 5 farms, the last in Jul 2028", () => {
    const later = solveWarPlan({ ...d.inputs, deadline: "2028-12-31" }, realm);
    expect(later.verdict).not.toBe(profit.verdict);
    expect(later.deadlineMonthIndex).toBe(28);
    expect(later.required.closingsPerMonth).toBe(4.33);
    expect(later.required.farmsToBuy).toBe(5);
    expect(later.required.lastPurchaseDate).toBe("2028-07-31");
    expect(later.verdict).toContain("Jul 2028");
  });

  it("a cash target by 2027-03-31 is out of reach and says so", () => {
    const soon = solveWarPlan({ ...d.inputs, targetMode: "cash_in_bank", deadline: "2027-03-31" }, realm);
    expect(soon.feasible).toBe(false);
    expect(soon.verdict).toBe(
      "No pace reaches $10.0M by 2027-03-31: even 13.3 lots/month with 0 farms and $0 raised lands at $1.2M. Push the deadline or lower the target.",
    );
    expect(soon.rotation.headline).toContain("no capital turn helps");
  });

  it("changes nothing in the Oracle's futures", () => {
    expect(realm.futures.closingsOnly.exitDate).toBe("2029-03-11");
    expect(realm.futures.current.exitDate).toBe("2028-06-11");
    expect(realm.futures.required.exitDate).toBe("2027-12-11");
    expect(realm.futures.oneMoreFarm.exitDate).toBe("2028-04-11");
  });
});

describe("fixture: EXPECTED (reservations first-class)", () => {
  const e = realm.expected;

  it("8 reservations were made in September 2026 (7 still live, Lamar Lot 5 already closed), none closed this month", () => {
    expect(e.thisMonth).toEqual({ month: "2026-09", reservations: 8, closings: 0, expectedReservations: 3, expectedClosings: 2.23, expectedNetProfit: 205_868.67 });
    expect(realm.lots.filter((l) => l.reservationDate?.startsWith("2026-09"))).toHaveLength(8);
    expect(realm.lots.filter((l) => l.reservationDate?.startsWith("2026-09") && l.stage === "reserved")).toHaveLength(7);
  });

  it("8 reservations are expected to close in November 2026 — 5.96 closings at 74.47 %, $319,008.02 of expected net profit", () => {
    const nov = e.expectedByMonth.find((m) => m.month === "2026-11");
    expect(nov).toMatchObject({ count: 8, expectedClosings: 5.96, expectedNetProfit: 319_008.02, netProfitAtStake: 428_371.17, past: false });
    expect(nov?.expectedClosings).toBe(round2(8 * 0.7447));
    const names = (nov?.propertyIds ?? []).map((id) => realm.lots.find((l) => l.propertyId === id)?.name).sort();
    expect(names).toEqual(["Franklin 2 — Lot 11", "Promised Valley — Lot 19", "Titus — Lot 4", "Titus — Lot 5", "Wichita — Lot 12", "Wichita — Lot 13", "Wichita — Lot 26", "Wichita — Lot 30"]);
    // next month (October) from the Throne Room's strip
    expect(e.nextMonth).toEqual({ month: "2026-10", reservations: 0, closings: 0, expectedReservations: 6, expectedClosings: 4.47, expectedNetProfit: 310_418.76 });
    expect(e.expectedByMonth.map((m) => [m.month, m.count, m.past])).toEqual([
      ["2026-07", 6, true],
      ["2026-08", 9, true],
      ["2026-09", 3, false],
      ["2026-10", 6, false],
      ["2026-11", 8, false],
      ["2026-12", 1, false],
    ]);
  });

  it("the deadline demands 8.31 closings/month, i.e. 11.16 reservations/month at 74.47 % conversion; the realm reserves 7.44 and closes 4.4", () => {
    expect(e.requiredClosingsPerMonth).toBe(8.31);
    expect(e.requiredClosingsPerMonth).toBe(realm.goal.requiredLotsPerMonthToHitDeadline);
    expect(e.requiredReservationsPerMonth).toBe(11.16);
    expect(e.requiredReservationsPerMonth).toBe(round2(8.31 / 0.7447));
    expect(e.reservationsTrailing).toBe(22);
    expect(e.reservationsPerMonth).toBe(7.44);
    expect(e.reservationsPerMonth).toBe(realm.pipeline.reservationsMadePerMonth);
    expect(e.closingsTrailing).toBe(13);
    expect(e.closingsPerMonth).toBe(4.4);
    expect(e.closingsPerMonth).toBe(realm.goal.closedLotsPerMonth);
    expect(e.conversionPct).toBe(74.47);
    expect(e.conversionSource).toBe("with_cancellations");
  });

  it("every live reservation has an expected close: reservation + the farm's median (Titus 73, Lamar 41.5, Promised Valley 90), else the realm's 63", () => {
    expect(e.lots).toHaveLength(33);
    expect(e.undatedCount).toBe(0);
    const by = new Map(e.lots.map((l) => [l.lotName, l]));
    expect(by.get("Titus — Lot 2")).toMatchObject({ reservationDate: "2026-05-02", medianDaysToClose: 73, medianSource: "farm", expectedCloseDate: "2026-07-14", expectedMonth: "2026-07", overdue: true, daysWaiting: 132, daysToExpectedClose: -59, netProfitAtStake: 61_723.32, expectedNetProfit: 45_965.36 });
    expect(by.get("Avery — Lot 12")).toMatchObject({ medianDaysToClose: 63, medianSource: "realm", expectedCloseDate: "2026-10-02", overdue: false });
    expect(by.get("Lamar — Lot 1")).toMatchObject({ reservationDate: "2026-08-26", medianDaysToClose: 41.5, expectedCloseDate: "2026-10-07" });
    expect(by.get("Promised Valley — Lot 14")).toMatchObject({ reservationDate: "2026-09-08", medianDaysToClose: 90, expectedCloseDate: "2026-12-07", expectedMonth: "2026-12" });
    expect(by.get("Titus — Lot 2")?.expectedNetProfit).toBe(round2(61_723.32 * 0.7447));
    // soonest expected close first
    for (let i = 1; i < e.lots.length; i++) expect((e.lots[i - 1]?.expectedCloseDate ?? "") <= (e.lots[i]?.expectedCloseDate ?? "")).toBe(true);
  });

  it("Committed: $1,654,864.13 expected from the 33 reservations ($2,222,188.97 at stake), landing by December 2026, most of it in November; 16 are overdue ($831,727.63)", () => {
    expect(e.committedNetProfit).toBe(1_654_864.13);
    expect(e.netProfitAtStake).toBe(2_222_188.97);
    expect(e.netProfitAtStake).toBe(realm.pipeline.pipelineNetProfit);
    expect(Math.abs(e.committedNetProfit - round2(e.netProfitAtStake * 0.7447))).toBeLessThan(0.2);
    expect(e.liveReservations).toBe(33);
    expect(e.landsBy).toBe("2026-12");
    expect(e.peakMonth).toBe("2026-11");
    expect(e.overdueCount).toBe(16);
    expect(e.overdueNetProfit).toBe(831_727.63);
    // the overdue reservations are exactly the stuck ones
    expect(new Set(e.lots.filter((l) => l.overdue).map((l) => l.propertyId))).toEqual(realm.pipeline.stuckIds);
  });

  it("OXYGEN: 342 provisional days from the 33 reservations, shown apart from the 547 confirmed; the closings-only score is untouched", () => {
    expect(realm.oxygen.totalDaysGained).toBe(547);
    expect(realm.oxygen.provisionalDaysGained).toBe(342);
    expect(realm.oxygen.provisional.size).toBe(33);
    expect(realm.oxygen.conversionPct).toBe(74.47);
    const w26 = realm.lots.find((l) => l.name === "Wichita — Lot 26")!;
    expect(realm.oxygen.provisional.get(w26.propertyId)).toMatchObject({ reservationDate: "2026-09-03", measuredOn: "2026-09-03", netProfitAtStake: 40_096.87, daysIfClosed: 5, provisionalDays: 4, paceThatDay: 8_644.24 });
    // a reservation made when the realm was slow (May 2, pace $403/day) is worth many provisional days — the same rule closings follow
    expect(realm.oxygen.provisionalRanked[0]).toMatchObject({ lotName: "Titus — Lot 2", daysIfClosed: 153, provisionalDays: 114, paceThatDay: 403.1 });
    expect(realm.oxygen.provisionalRanked[0]?.provisionalDays).toBe(Math.round(153 * 0.7447));
  });

  it("reservation streaks: 6 consecutive weeks of pledges ending 2026-06-21, 7 pledges in W22, 17 in May 2026, 8 consecutive months and counting", () => {
    const r = realm.reservationStreaks;
    expect(r).toMatchObject({ currentWeeks: 3, bestWeeks: 6, bestWeeksEndedOn: "2026-06-21", closedThisWeek: true, bestMonths: 8, currentMonths: 8 });
    expect(r.bestWeek).toEqual({ week: "2026-W22", weekStart: "2026-05-25", count: 7, netProfit: 355_624.87 });
    expect(r.bestMonth).toEqual({ month: "2026-05", count: 17, netProfit: 915_709.18 });
    expect(r.weeks).toHaveLength(28);
    expect(r.months).toHaveLength(11);
    // closing streaks are unchanged
    expect(realm.streaks.bestWeeks).toBe(3);
    expect(realm.streaks.weeks).toHaveLength(15);
  });

  it("the chronicle narrates live reservations with their expected close and provisional days; no cancellation exists in the snapshot", () => {
    const w26 = realm.lots.find((l) => l.name === "Wichita — Lot 26")!;
    expect(realm.narrative.get(`reservation:${w26.propertyId}`)).toBe(
      "On September 3, Julia Rodriguez pledged for Lot 26 of Wichita at $117,600 — the closing is expected around November 5, 4 provisional days gained.",
    );
    const t2 = realm.lots.find((l) => l.name === "Titus — Lot 2")!;
    expect(realm.narrative.get(`reservation:${t2.propertyId}`)).toBe(
      "On May 2, Crystal Thompson pledged for Lot 2 of Titus at $135,412 — the closing was expected around July 14 and is 59 days late, 114 provisional days gained.",
    );
    expect(realm.events.filter((ev) => ev.kind === "cancellation")).toHaveLength(0);
    expect(realm.events.filter((ev) => ev.kind === "reservation")).toHaveLength(69);
  });

  it("changes nothing in the goal, pace, oxygen score or debt", () => {
    expect(realm.goal.netProfitToDate).toBe(2_272_304.32);
    expect(realm.goal.closedLotsPerMonth).toBe(4.4);
    expect(realm.oxygen.totalDaysGained).toBe(547);
    expect(realm.debt.requiredNetProfitPerDay).toBe(16_234.65);
  });
});
