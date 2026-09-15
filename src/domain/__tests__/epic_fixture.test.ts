/**
 * Phase 2 "Epic" numbers reproduced from the live snapshot (src/domain/__fixtures__/payments.json,
 * refreshed 2026-09-11 21:31 UTC — after Lakeview, Franklin 2 and Titus Lot 6 changed in Payments at 21:15–21:17 UTC).
 * If the fixture is regenerated these change; document the drift in PROGRESS.md.
 */
import { describe, expect, it } from "vitest";
import raw from "../__fixtures__/payments.json";
import type { LotLedgerRpcResult, PaymentsSnapshot } from "../types";
import { buildRealm } from "../realm";
import { round2 } from "../math";
import { recentLandCostPerLot, solveWarPlan } from "../warplan";
import { computeSeasonality } from "../seasonality";
import { computeLotLedger } from "../lotLedger";
import { deriveExodusDefaults, exodusVerdict, prepareExodus, runExodus, scanNotesPct, solveExodus } from "../exodus";
import { LP_CAPITAL_TO_RETURN } from "../../config/goal";

const fixture = raw as unknown as PaymentsSnapshot & { snapshotAt: string; lotLedgers: LotLedgerRpcResult[] };
const ASOF = new Date("2026-09-11T00:00:00Z");
const realm = buildRealm(fixture, ASOF);

describe("fixture: THE DEBT", () => {
  it("owes $4,145,355.48 to sponsors on 9 open positions, with $800,000 of own capital tied up", () => {
    // sponsor capital carries the surveys (purchase + survey on every farm since 2026-09-11); at 21:15Z the same day
    // Lakeview ($495,000, Townson Family) was added and Franklin 2 fell from $334,800 to $329,400: +$489,600 owed
    expect(realm.debt.capitalOwed).toBe(4_145_355.48);
    expect(realm.debt.capitalOwed).toBe(round2(3_655_755.48 + 495_000 - 5_400));
    expect(realm.debt.openPositions).toBe(9);
    expect(realm.debt.ownCapitalOutstanding).toBe(800_000);
    // sponsor debt + own capital = the goal's capitalOutstanding over all subdivided farms
    expect(round2(realm.debt.capitalOwed + realm.debt.ownCapitalOutstanding)).toBe(realm.goal.capitalOutstanding);
    // The Throne Room Key-figures Stat must render debt.capitalOwed (same figure the Rotation
    // strip and the Debt use) — never goal.capitalOutstanding, which blends in the $800,000 of
    // own capital and must not be labeled "owed to sponsors".
    expect(realm.debt.capitalOwed).toBe(realm.rotation.capitalOutstanding);
    expect(realm.goal.capitalOutstanding).not.toBe(realm.debt.capitalOwed);
    expect(realm.goal.capitalOutstanding).toBe(4_945_355.48);
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
  it("has 9 hostage positions worth $4,763,604, 12.98 % returned (Lakeview's $495,000 joined on 2026-09-11)", () => {
    expect(realm.liberation.hostages).toHaveLength(9);
    expect(realm.liberation.totalCapital).toBe(4_763_604);
    expect(realm.liberation.totalReturned).toBe(618_248.52);
    expect(realm.liberation.pctReturned).toBe(12.98);
    const lakeview = realm.liberation.hostages.find((h) => h.farmName === "Lakeview");
    expect(lakeview).toMatchObject({ investorName: "Townson Family", capital: 495_000, capitalReturned: 0, pctReturned: 0, freed: false });
  });

  it("Townson Family is no longer freed of Lamar: $475,000 returned against $484,000 of capital (98.14 %), $9,000 to go; Wichita at 11.77 %; 28.15 % over its three farms", () => {
    const lamar = realm.liberation.hostages.find((h) => h.farmName === "Lamar");
    expect(lamar?.investorName).toBe("Townson Family");
    // 2026-09-11: Lamar's investor_capital became purchase + survey ($484,000); the $475,000 already returned falls $9,000 short — a data fact
    expect(lamar).toMatchObject({ capital: 484_000, capitalReturned: 475_000, capitalOutstanding: 9_000, pctReturned: 98.14, freed: false, freedAt: null, daysHeld: null });
    expect(lamar?.paidOnTop).toBe(175_741.94);
    const wichita = realm.liberation.hostages.find((h) => h.farmName === "Wichita");
    expect(wichita?.pctReturned).toBe(11.77);
    const townson = realm.liberation.sponsors.find((s) => s.name === "Townson Family");
    expect(townson?.freed).toBe(false);
    // $618,248.52 returned over Lamar + Wichita + Lakeview ($2,196,000): 36.35 % before Lakeview's $495,000 was added
    expect(townson?.pctReturned).toBe(28.15);
    expect(townson?.pctReturned).toBe(round2((618_248.52 / 2_196_000) * 100));
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

  it("classifies the ten farms", () => {
    expect(Object.fromEntries(realm.campaigns.map((c) => [c.farmName, c.state]))).toEqual({
      Lamar: "conquered",
      Eastland: "conquered",
      Freestone: "conquered",
      "Promised Valley": "under_siege",
      Titus: "under_siege",
      Wichita: "under_siege",
      "Franklin 2": "under_siege",
      Lakeview: "under_siege",
      Avery: "closing_pending",
      Franklin: "closing_pending",
    });
  });

  it("sizes each campaign goal in lots", () => {
    expect(byName["Wichita"]?.lotsLeftToCover).toBe(3);
    expect(byName["Promised Valley"]?.lotsLeftToCover).toBe(2);
    expect(byName["Titus"]?.lotsLeftToCover).toBe(2);
    expect(byName["Avery"]?.lotsLeftToCover).toBe(5);
    // Lakeview has no sale yet: 4 lots at the realm's average price cover its $495,000
    expect(byName["Lakeview"]).toMatchObject({ lotsLeftToCover: 4, reservedLots: 0, target: 495_000, recovered: 0, avgSalePriceSource: "realm", reason: "4 more lots to cover the capital" });
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
  it("four futures: reservations close first (2028-01-11), the required pace lands on the deadline month, closings-only is the 2029-01-11 line", () => {
    const f = realm.futures;
    expect(f.all.map((x) => x.id)).toEqual(["current_pace", "required_pace", "one_more_farm", "closings_only"]);
    // Resolved conversion is 100 % (cancelled=0); blended trailing pulse stays 75 % with 12 still-open in the cohort.
    expect(realm.expected.conversionPct).toBe(100);
    expect(realm.pipeline.conversion.pct).toBe(75);
    expect(f.current.exitDate).toBe("2028-01-11");
    expect(f.current.hitsDeadline).toBe(false);
    expect(f.current.params.lotsPerMonth).toBe(7.1);
    expect(f.current.params.lotsPerMonth).toBe(round2(realm.expected.reservationsPerMonth * (realm.expected.conversionPct / 100)));
    expect(f.current.scheduled).toHaveLength(33);
    expect(f.required.exitDate).toBe("2027-12-11");
    expect(f.required.hitsDeadline).toBe(true);
    expect(f.required.daysEarlierThanCurrent).toBe(31);
    expect(f.oneMoreFarm.exitDate).toBe("2027-11-11");
    expect(f.oneMoreFarm.daysEarlierThanCurrent).toBe(61);
    expect(f.oneMoreFarm.params.lotsPerMonth).toBe(8.11);
    // 83 lots in inventory since Lakeview's 12 arrived (121 lots − 38 closed), plus one average farm of 12.1
    expect(f.oneMoreFarm.startInventory).toBe(round2(83 + realm.oracleDefaults.avgLotsPerFarm));
    expect(f.oneMoreFarm.startInventory).toBe(95.1);
    expect(f.closingsOnly.exitDate).toBe("2029-01-11");
    expect(f.closingsOnly.daysEarlierThanCurrent).toBe(-366);
    expect(f.closingsOnly.params).toEqual(realm.oracleDefaults);
    expect(f.closingsOnly.params.lotsPerMonth).toBe(4.73);
  });

  it("the current pace books 21 of the 33 reservations in the first month (16 overdue + 5 expected by Oct 11), 8 in the second, 4 in the third; the steady pace starts after the 62-day lag", () => {
    const s = realm.futures.current.result.series;
    // At 100 % resolved conversion every live reservation books as a full closing (was ×0.75 under blended).
    expect(s[0]).toMatchObject({ date: "2026-10-11", scheduledLotsClosed: 21, flatLotsClosed: 0, lotsClosed: 21 });
    expect(s[0]?.scheduledLotsClosed).toBe(round2(21 * 1));
    expect(s[1]).toMatchObject({ date: "2026-11-11", scheduledLotsClosed: 8, flatLotsClosed: 0 });
    expect(s[2]).toMatchObject({ date: "2026-12-11", scheduledLotsClosed: 4, flatLotsClosed: 6.86 });
    expect(s[3]).toMatchObject({ date: "2027-01-11", scheduledLotsClosed: 0, flatLotsClosed: 7.1, lotsClosed: 7.1 });
    expect(round2((s[0]?.scheduledLotsClosed ?? 0) + (s[1]?.scheduledLotsClosed ?? 0) + (s[2]?.scheduledLotsClosed ?? 0))).toBe(33);
    // the first month books the committed net profit of those 21 reservations, not the average per lot
    const committedFirstMonth = realm.expected.lots.filter((l) => (l.expectedCloseDate ?? "") <= "2026-10-11").reduce((a, l) => a + l.expectedNetProfit, 0);
    expect(s[0]?.cumulativeNetProfit).toBe(round2(realm.goal.netProfitToDate + committedFirstMonth));
    expect(realm.futures.current.premise).toBe(
      "33 live reservations close on their expected dates at 100% conversion (16 already overdue, counted in the first month); after the 62-day lag, new reservations at 7.1/month keep closing at that rate — 7.1 lots/month — with a new farm every 1.26 months (since Mar 2026).",
    );
    expect(realm.futures.closingsOnly.premise).toBe("4.73 closings/month and a new farm every 1.26 months (since Mar 2026) — the trailing closing pace alone, blind to the 33 live reservations.");
  });

  it("farm cadence since Mar 2026: a farm every 1.26 months over the six fundings from Freestone (2026-04-14) to Lakeview (2026-10-22); the four 2025 farms are left out (1.56 months over all ten)", () => {
    // 1.51 months over five farms until 2026-09-11 21:15Z: Franklin 2 moved to 2026-10-02 and Lakeview (2026-10-22) was added
    expect(realm.farmCadence).toEqual({
      months: 1.26,
      measured: true,
      farms: 6,
      fundingDates: ["2026-04-14", "2026-04-15", "2026-06-16", "2026-07-31", "2026-10-02", "2026-10-22"],
      excluded: 4,
      since: "2026-03-01",
      sinceLabel: "since Mar 2026",
    });
    expect(realm.oracleDefaults.newFarmEveryMonths).toBe(1.26);
    expect(realm.futures.all.filter((f) => f.id !== "required_pace").every((f) => f.params.newFarmEveryMonths === 1.26)).toBe(true);
    // the required pace buys a farm as often as inventory needs it, never less often than the realm does
    expect(realm.futures.required.params.newFarmEveryMonths).toBe(1.26);
    const allTime = buildRealm(fixture, ASOF, { eraStart: null });
    expect(allTime.farmCadence).toMatchObject({ months: 1.56, farms: 10, excluded: 0, since: null, sinceLabel: null });
    expect(allTime.oracleDefaults.newFarmEveryMonths).toBe(1.56);
    // more inventory arrives sooner, but no future exits on a different day: land was never the constraint
    expect(allTime.futures.all.map((f) => f.exitDate)).toEqual(realm.futures.all.map((f) => f.exitDate));
  });
});

describe("fixture: NARRATED CHRONICLE and STORY", () => {
  it("narrates every event", () => {
    expect(realm.narrative.size).toBe(realm.events.length);
    const latest = realm.oxygen.latest as NonNullable<typeof realm.oxygen.latest>;
    expect(realm.narrative.get(`closing:${latest.propertyId}`)).toBe(
      "On August 19, Daniel Carrasquillo closed Lot 3 of Promised Valley for $116,500, 90 days after Daniel's reservation. Pace gained 5 days.",
    );
    expect(realm.narrative.get(`reservation:${latest.propertyId}`)).toBe("On May 21, Daniel Carrasquillo reserved Lot 3 of Promised Valley at $116,500.");
    // no liberation has happened: Lamar's $475,000 no longer covers its $484,000
    expect(realm.liberation.moments).toEqual([]);
    expect([...realm.narrative.keys()].some((k) => k.startsWith("liberation:"))).toBe(false);
  });

  it("tells the story in five cards with the real figures — the liberation card is gone with Lamar's freedom", () => {
    const lines = realm.story.cards.map((c) => c.line);
    // 8 counties for 10 farms: Franklin 2's county was corrected from "Franklin County (2/2)" to Franklin, and Lakeview sits in Titus county
    expect(lines).toEqual([
      "10 farms across 8 counties, cut into 121 lots.",
      "$4,763,604 lent by 5 sponsors. $4,145,355 still owed.",
      "38 lots closed for $2,236,378 of net profit — 22.4% of the ten million.",
      "Every closing bought time. 534 days gained toward the exit.",
      "476 days left. $16,310 of net profit needed every single day.",
    ]);
  });
});

describe("fixture: PIPELINE (reservations layer)", () => {
  const p = realm.pipeline;

  it("33 reserved lots carry $2,198,937.18 of net profit — the same pipeline figure the goal reports", () => {
    expect(p.reserved).toBe(33);
    // $2,197,857.18 until Franklin 2's capital fell from $334,800 to $329,400 (2026-09-11 21:15Z): its Lot 11 reservation
    // carries $1,080 more ($66,960 → $65,880 of land per lot)
    expect(p.pipelineNetProfit).toBe(2_198_937.18);
    expect(p.pipelineNetProfit).toBe(round2(2_197_857.18 + 1_080));
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

  it("of the 48 reservations made on or before 2026-06-13, 36 closed (75% blended); resolved conversion is 100 % with cancelled=0", () => {
    // Lamar Lot 5 (pledged 2025-09-07, closed 2025-11-05) joined the cohort
    // Blended trailing pulse still counts the 12 still-open matured reservations; forecasts use resolved instead.
    expect(p.conversion).toMatchObject({ cutoff: "2026-06-13", cohort: 48, closed: 36, stillReserved: 12, pct: 75, resolvedPct: 100, resolvedDenominator: 36, thinSample: true });
    expect(p.conversion.openShare).toBeCloseTo(12 / 48);
  });

  it("16 reservations are stuck past 60 days, trapping $1,103,375.31 of net profit on $2,024,531 of sales", () => {
    expect(p.stuckCount).toBe(16);
    expect(p.netProfitTrapped).toBe(1_103_375.31);
    expect(p.salePriceTrapped).toBe(2_024_531);
    expect(p.netProfitTrapped).toBe(round2(p.stuck.reduce((a, s) => a + s.netProfitAtStake, 0)));
    expect(p.stuck.some((s) => s.lotName === "Titus — Lot 2" && s.daysWaiting === 132 && s.salePrice === 135_412)).toBe(true);
    for (let i = 1; i < p.stuck.length; i++) expect(p.stuck[i - 1]!.severity).toBeGreaterThanOrEqual(p.stuck[i]!.severity);
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

  it("prefills every input from the realm: 10-lot farms at $468,520 (recent land), 100 % resolved conversion, 2.63 months to first close, a 7.21-month cycle projected since Mar 2026, flat pace, five sponsors", () => {
    // Forecasts prefill resolved conversion (closed÷(closed+cancelled)=100 % here); blended 75 % stays on real.* as the trailing pulse.
    expect(d.inputs).toMatchObject({
      target: 10_000_000,
      deadline: "2027-12-31",
      targetMode: "profit_at_closing",
      lotsPerFarm: 10,
      farmCost: 468_520,
      adSpendPerClosing: 2_500,
      conversionPct: 100,
      farmToFirstCloseMonths: 2.63,
      noteSaleLagMonths: 3.17,
      cycleMonths: 7.21,
      seasonal: false,
    });
    // 121 lots over 10 farms (12.11 = 109 / 9 before Lakeview)
    expect(d.real).toMatchObject({
      lotsPerFarm: 12.1,
      landCostPerLot: 49_244,
      recentLandCostPerLot: 46_852,
      recentFarms: ["Franklin", "Avery", "Wichita"],
      defaultLandCostPerLot: 46_852,
      eraSince: "since Mar 2026",
      conversionPct: 75,
      conversionWithCancellationsPct: 75,
      conversionResolvedPct: 100,
      cancellationRatePct: 0,
      cancelledReservations: 0,
      farmToFirstCloseMonths: 2.63,
      farmToFirstCloseFarms: 6,
      medianDaysToClose: 61.5,
      noteSaleLagMonths: 3.17,
      closingsPerMonth: 4.73,
      inventory: 83,
      cycleDays: 219.5,
      cycleMonths: 7.21,
      cycleSource: "projected",
      cycleFarms: 4,
      cycleExcludedFarms: [],
      seasonalityApplied: false,
      seasonalityReason: "not enough history for seasonality",
    });
    // every sponsor's capital carries its surveys since 2026-09-11; at 21:15Z Franklin 2 ($329,400, was $334,800) moved from
    // Kevin Concua to Julio Arriola and Lakeview ($495,000) was added to Townson Family
    expect(d.inputs.investorMix.map((e) => [e.name, e.dealType, e.ratePct, e.capital])).toEqual([
      ["Kevin Concua", "fixed_interest", 20, 1_088_328],
      ["Townson Family", "profit_share", 50, 2_196_000],
      ["Julio Arriola", "fixed_interest", 25, 720_261],
      ["Rony Schumann", "fixed_interest", 18, 373_520],
      ["Doctores Motta", "fixed_interest", 20, 385_495],
    ]);
    expect(1_088_328).toBe(1_423_128 - 334_800);
    expect(720_261).toBe(390_861 + 329_400);
    expect(2_196_000).toBe(1_701_000 + 495_000);
    expect(d.inputs.investorMix.every((e) => e.investorId !== null)).toBe(true);
    expect(round2(d.inputs.investorMix.reduce((a, e) => a + e.capital, 0))).toBe(realm.liberation.totalCapital);
  });

  it("land cost trend since Mar 2026: the three most recent purchases (Franklin, Avery, Wichita) average $46,852 per lot against $49,244 all-time", () => {
    const recent = realm.farms.filter((f) => ["Franklin", "Avery", "Wichita"].includes(f.name));
    expect(recent.map((f) => f.fundingDate).sort()).toEqual(["2026-04-15", "2026-06-16", "2026-07-31"]);
    expect(Math.round(recent.reduce((a, f) => a + f.landCostPerLot, 0) / 3)).toBe(46_852);
    // Franklin 2 (2026-10-02) and Lakeview (2026-10-22) close after asOf, so they are not purchases yet.
    expect(d.real.recentFarms).not.toContain("Franklin 2");
    expect(d.real.recentFarms).not.toContain("Lakeview");
    expect(d.inputs.farmCost).toBe(46_852 * 10);
    // all three era purchases are the three most recent purchases anyway: the era changes nothing here today
    expect(recentLandCostPerLot(realm.farms, ASOF)).toEqual({ perLot: 46_852, farms: ["Franklin", "Avery", "Wichita"], since: "2026-03-01", sinceLabel: "since Mar 2026" });
    expect(recentLandCostPerLot(realm.farms, ASOF, 3, null)).toEqual({ perLot: 46_852, farms: ["Franklin", "Avery", "Wichita"], since: null, sinceLabel: null });
    // asked for more than the era holds, the trend stops at the era: four purchases since Mar 2026, never Titus (Nov 2025)
    expect(recentLandCostPerLot(realm.farms, ASOF, 5).farms).toEqual(["Franklin", "Avery", "Wichita", "Freestone"]);
    expect(recentLandCostPerLot(realm.farms, ASOF, 5, null).farms).toEqual(["Franklin", "Avery", "Wichita", "Freestone", "Titus"]);
  });

  it("owes sponsors $4,801,191.96 today ($4,145,355.48 of capital + $655,836.48 of unpaid take) and has kept $1,362,503.84 of cash", () => {
    expect(profit.ledger).toEqual({ capitalOwed: 4_145_355.48, paidOut: 793_990.46, unpaidTake: 655_836.48, cashKept: 1_362_503.84, owedToday: 4_801_191.96 });
    expect(profit.ledger.capitalOwed).toBe(realm.debt.capitalOwed);
  });

  it("profit mode: ≈8.5 closings/month and ≈133 lots still needed — 5 farms of 10 lots, the last by Jul 2027, $2.3M to raise", () => {
    // 7 farms and $3.3M until Lakeview's 12 lots joined the inventory (83 lots to sell today, 71 before); Kevin's mix capital
    // shrank by Franklin 2 and Townson's grew by Lakeview, so the plan leans more on the 50 % profit share: 8.5 lots/month, not 8.43
    expect(profit.feasible).toBe(true);
    expect(profit).toMatchObject({ deadlineMonthIndex: 16, monthsToDeadline: 15.63, landLag: 3, closeLag: 2, noteLag: 3, maxPurchaseMonth: 11, lastClosingDate: null, startInventory: 83 });
    const r = profit.required;
    expect(r.closingsPerMonth).toBeCloseTo(8.5, 0);
    expect(r.closingsPerMonth).toBe(8.5);
    expect(r.lotsNeeded).toBeCloseTo(130, -1);
    expect(r.lotsNeeded).toBe(132.88);
    expect(r.farmsToBuy).toBe(5);
    expect(r.lastPurchaseDate).toBe("2027-07-31");
    expect(r.capitalToRaise).toBe(5 * 468_520);
    expect(r.totalDeployed).toBe(5 * 468_520);
    expect(r.funding.map((f) => [f.name, f.amount])).toEqual([
      ["Kevin Concua", 1_088_328],
      ["Townson Family", 1_254_272],
    ]);
    expect(r.unfunded).toBe(0);
    // Ads = closings / (resolved conversion/100) × $2,500 → at 100 % vs the old blended 75 %, spend drops by 0.75× (28,333.33 → 21,250).
    expect(r.adSpendPerMonth).toBe(21_250);
    expect(r.adSpendPerMonth).toBe(round2((8.5 / 1) * 2_500));
    expect(r.reservationsPerMonth).toBe(8.5);
    expect(r.noteSalesPerMonth).toBe(8.5);
    expect(r.exitDate).toBe("2027-12-31");
    expect(r.hitsDeadline).toBe(true);
    expect(r.targetAtDeadline).toBeGreaterThanOrEqual(10_000_000);
    expect(r.rows).toHaveLength(16);
    // flat: with under 12 months of history since Mar 2026 no seasonal shape is applied, so every month asks the same 8.5 (the first prorated)
    expect(r.rows[0]).toMatchObject({ date: "2026-09-30", lotsClosed: 5.38, flatLotsClosed: 5.38, seasonalFactor: 1, farmsBought: 0 });
    expect(r.rows.at(-1)).toMatchObject({ date: "2027-12-31", lotsClosed: 8.5, flatLotsClosed: 8.5, seasonalFactor: 1, notesSold: 8.5, cumulativeNet: 10_001_938.87, inventory: 0.12 });
    expect(r.rows.at(-1)?.capitalReturned).toEqual([1_088_328, 1_248_805.93, 0, 0, 0]);
    expect(profit.verdict).toBe(
      "Buy 5 farms, the last one no later than Jul 2027, raise $2.3M (Kevin Concua $1.1M, Townson Family $1.3M), close 8.5 lots/month, sell 8.5 notes/month and spend at least $21K/month on ads.",
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
    expect(shaped.required.closingsPerMonth).toBe(8.49);
    expect(shaped.required.rows.find((r) => r.date === "2027-05-31")).toMatchObject({ lotsClosed: 26.18, flatLotsClosed: 8.49, seasonalFactor: 3.084 });
    expect(shaped.required.rows.find((r) => r.date === "2027-01-31")).toMatchObject({ lotsClosed: 2.56, flatLotsClosed: 8.49, seasonalFactor: 0.301 });
    const seasonalTotal = shaped.required.rows.reduce((a, r) => a + r.lotsClosed, 0);
    const flatTotal = shaped.required.rows.reduce((a, r) => a + r.flatLotsClosed, 0);
    expect(Math.abs(seasonalTotal - flatTotal)).toBeLessThan(0.1);
  });

  it("cancellations: no file case in the snapshot is cancelled, so the rate is 0 %; blended stays 75 %, resolved is 100 %", () => {
    expect(fixture.fileCases.filter((c) => c.status === "cancelled")).toHaveLength(0);
    // Blended (pct / pctWithCancellations) still counts the 12 open matured reservations as the trailing pulse;
    // resolved excludes them — closed÷(closed+cancelled) = 36/36 = 100 %.
    expect(realm.pipeline.conversion).toMatchObject({
      cohort: 48,
      closed: 36,
      stillReserved: 12,
      pct: 75,
      cancelled: 0,
      cohortWithCancellations: 48,
      pctWithCancellations: 75,
      cancellationRatePct: 0,
      resolvedPct: 100,
      resolvedDenominator: 36,
      thinSample: true,
    });
    expect(realm.pipeline.conversion.openShare).toBeCloseTo(12 / 48);
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
    expect(b.capitalOutstanding).toBe(4_145_355.48);
    // a projected benchmark has no distribution curve, so nothing is graded
    expect(b.curve).toEqual([]);
    // Franklin 2 now closes 2026-10-02 (21 days out, was 34) and Lakeview 2026-10-22 (41 days out)
    expect(b.grades.map((g) => [g.farmName, g.verdict, g.daysElapsed, g.pctReturned, g.daysToGo])).toEqual([
      ["Lamar", "unrated", 386, 98.14, 0],
      ["Eastland", "unrated", 382, 0, 0],
      ["Titus", "unrated", 304, 0, 212],
      ["Freestone", "unrated", 150, 0, 0],
      ["Wichita", "unrated", 149, 11.77, 51],
      ["Avery", "benchmark", 87, 0, 152],
      ["Franklin", "unrated", 42, 0, 283],
      ["Franklin 2", "unrated", -21, 0, null],
      ["Lakeview", "unrated", -41, 0, null],
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
    expect(b.capitalOutstanding).toBe(4_145_355.48);
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
      ["Lakeview", "unrated"],
    ]);
    expect(allTime.warPlanDefaults.inputs.cycleMonths).toBe(10.68);
    expect(allTime.warPlan.rotation.headline).toBe(
      "With $2.3M of land capital rotating every 10.7 months you reach $10.0M by the deadline; you need 1 turn; the first turn must start by Apr 2027. 5 of the 5 turns cannot complete before the deadline.",
    );
  });

  it("rotation: the required plan turns $2.3M once — every farm is bought Apr–Jul 2027 and the first two are back before the deadline on the 7.2-month cycle", () => {
    // 7 farms and $3.3M from Feb 2027 until Lakeview's 12 lots arrived: two fewer farms, bought two months later
    const rot = profit.rotation;
    expect(rot).toMatchObject({
      cycleMonths: 7.21,
      totalDeployed: 2_342_600,
      peakOutstanding: 2_342_600,
      newMoney: 2_342_600,
      recycled: 0,
      turnsNeeded: 1,
      turnsCompleted: 0,
      turnsIncomplete: 3,
      farms: 5,
      firstTurnStartBy: "2027-04-30",
      lastTurnCompletes: "2028-02-29",
    });
    expect(rot.perInvestor.map((i) => [i.name, i.deployed, i.fresh, i.peakOutstanding, i.turns])).toEqual([
      ["Kevin Concua", 1_088_328, 1_088_328, 1_088_328, 1],
      ["Townson Family", 1_254_272, 1_254_272, 1_254_272, 1],
    ]);
    expect(rot.headline).toBe(
      "With $2.3M of land capital rotating every 7.2 months you reach $10.0M by the deadline; you need 1 turn; the first turn must start by Apr 2027. 3 of the 5 turns cannot complete before the deadline.",
    );
    expect(rot.headline).toMatch(/\b\d+(\.\d)? turns?\b/);
    expect(profit.required.schedule.map((f) => [f.purchaseMonth, f.turnCompletesMonth, f.turnComplete])).toEqual([
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

  it("rotation: with a 2028-12-31 deadline one turn completes before the last farms are bought, so the peak ($1.9M) is below the total deployed ($2.3M): 1.25 turns", () => {
    const later = solveWarPlan({ ...d.inputs, deadline: "2028-12-31" }, realm);
    const rot = later.rotation;
    // with 83 lots in hand the five farms are bought later (Dec 2027 – Jul 2028), so only the Dec 2027 farm turns in time to fund one more
    expect(rot).toMatchObject({ totalDeployed: 2_342_600, peakOutstanding: 1_874_080, newMoney: 1_874_080, recycled: 468_520, turnsNeeded: 1.25, turnsIncomplete: 2, farms: 5, firstTurnStartBy: "2027-12-31" });
    expect(rot.peakOutstanding).toBeLessThan(rot.totalDeployed);
    expect(later.required.capitalToRaise).toBe(1_874_080);
    expect(later.required.schedule.map((f) => [f.purchaseMonth, f.turnCompletesMonth, f.recycled])).toEqual([
      [16, 23, 0],
      [19, 26, 0],
      [21, 28, 0],
      [23, 30, 468_520],
      [23, 30, 0],
    ]);
    // Kevin's dollars fund the first farms and come back once; Townson's $786K covers the rest
    expect(rot.perInvestor.map((i) => [i.name, i.deployed, i.fresh, i.turns])).toEqual([
      ["Kevin Concua", 1_556_848, 1_088_328, 1.43],
      ["Townson Family", 785_752, 785_752, 1],
    ]);
    expect(rot.headline).toBe(
      "With $1.9M of land capital rotating every 7.2 months you reach $10.0M by the deadline; you need 1.3 turns; the first turn must start by Dec 2027. 2 of the 5 turns cannot complete before the deadline.",
    );
  });

  it("with the blended 24.64 % take on new lots the answer is 8.35 lots/month and 130.54 lots over 5 farms; the named mix costs the extra 0.15", () => {
    const blended = solveWarPlan(
      { ...d.inputs, investorMix: [{ investorId: null, name: "Blended", dealType: "profit_share", ratePct: realm.oracleDefaults.investorTakePct, capital: 1e9 }] },
      realm,
    );
    expect(realm.oracleDefaults.investorTakePct).toBe(24.64);
    expect(blended.required.closingsPerMonth).toBe(8.35);
    expect(blended.required.lotsNeeded).toBe(130.54);
    expect(blended.required.farmsToBuy).toBe(5);
    expect(blended.required.closingsPerMonth).toBeLessThan(profit.required.closingsPerMonth);
  });

  it("the buffer column adds one farm ($468,520) at the last purchase and still exits on the deadline", () => {
    const b = profit.buffer;
    expect(b.farmsToBuy).toBe(6);
    expect(b.capitalToRaise).toBe(profit.required.capitalToRaise + 468_520);
    expect(b.lastPurchaseDate).toBe("2027-07-31");
    expect(b.exitDate).toBe("2027-12-31");
    expect(b.inventoryAtDeadline).toBe(10.12);
    expect(b.unfunded).toBe(0);
    expect(b.funding.map((f) => [f.name, f.amount])).toEqual([
      ["Kevin Concua", 1_088_328],
      ["Townson Family", 1_722_792],
    ]);
  });

  it("the current pace (4.73/month, a farm every 1.26 months since Mar 2026) lands at $6.6M on the deadline and exits 2029-02-11; Kevin's capital turns twice", () => {
    const c = profit.current;
    expect(c.closingsPerMonth).toBe(4.73);
    expect(c.hitsDeadline).toBe(false);
    // 2029-01-09 and $6,619,557.99 at the 1.51-month cadence with Kevin's $1.4M first in the mix; the faster cadence buys 13 farms,
    // more of them on Townson's 50 % share, so the same 4.73 closings/month net a little less
    expect(c.exitDate).toBe("2029-02-11");
    expect(c.targetAtDeadline).toBe(6_588_034.98);
    expect(c.premise).toBe("4.73 lots/month and a farm every 1.26 months (since Mar 2026) — the trailing averages, farms funded from your mix in order.");
    expect(c.farmsToBuy).toBe(13);
    expect(c.totalDeployed).toBe(13 * 468_520);
    // seven of the thirteen farms are bought with capital back from the first ones
    expect(c.capitalToRaise).toBe(6 * 468_520);
    expect(c.peakOutstanding).toBe(6 * 468_520);
    expect(c.unfunded).toBe(0);
    expect(c.funding.map((f) => [f.name, f.amount, f.deployed])).toEqual([
      ["Kevin Concua", 1_088_328, 2_645_176],
      ["Townson Family", 1_722_792, 3_445_584],
    ]);
    expect(c.rows.filter((r) => r.flags.includes("too_late")).map((r) => r.monthIndex)).toEqual([14, 15, 16]);
    expect(c.rows.filter((r) => r.flags.includes("turn_incomplete")).map((r) => r.monthIndex)).toEqual([10, 11, 13, 14, 15, 16]);
    expect(c.flaggedMonths).toBe(6);
    expect(profit.required.daysEarlierThanCurrent).toBe(408);
    // the all-time cadence (1.56 months) bought ten farms and exited two weeks later, on the same $6.6M at the deadline
    expect(allTime.warPlan.current).toMatchObject({ exitDate: "2029-02-24", targetAtDeadline: 6_588_034.98, farmsToBuy: 10 });
  });

  it("cash mode needs materially more lots (259 vs 133): every note sells at 80 % and every sponsor is paid out first", () => {
    const cash = solveWarPlan({ ...d.inputs, targetMode: "cash_in_bank" }, realm);
    expect(cash.feasible).toBe(true);
    expect(cash.maxPurchaseMonth).toBe(8);
    expect(cash.lastClosingDate).toBe("2027-09-30");
    const r = cash.required;
    // 254.56 lots and 19 farms before Lakeview: 12 more lots in hand means one farm fewer, but $489,600 more to pay sponsors first
    expect(r.lotsNeeded).toBe(259.36);
    expect(r.lotsNeeded).toBeGreaterThan(profit.required.lotsNeeded * 1.5);
    expect(r.closingsPerMonth).toBe(20.53);
    expect(r.farmsToBuy).toBe(18);
    expect(r.lastPurchaseDate).toBe("2027-04-30");
    expect(r.capitalToRaise).toBe(8_433_360);
    expect(r.unfunded).toBe(3_669_756);
    expect(r.unfunded).toBe(4_159_356 - 489_600);
    expect(r.funding).toHaveLength(5);
    expect(r.hitsDeadline).toBe(true);
    expect(r.targetAtDeadline).toBeGreaterThanOrEqual(10_000_000);
    expect(r.rows[0]?.cumulativeNet).toBeLessThan(0);
    // October to December 2027 only harvest notes
    expect(r.rows.slice(13).map((row) => row.lotsClosed)).toEqual([0, 0, 0]);
    expect(cash.verdict).toContain("until Sep 2027 (then only note sales)");
    expect(cash.verdict).toContain("unfunded $3.7M");
    // the first farm is bought in October and no turn is back before the last purchase in April: every farm needs fresh money
    expect(cash.rotation).toMatchObject({ totalDeployed: 18 * 468_520, peakOutstanding: 8_433_360, recycled: 0, turnsNeeded: 1, turnsIncomplete: 0, firstTurnStartBy: "2026-10-31" });
    // the buffer farm's unsold lots are land, not cash: the cushion costs its price at the deadline
    expect(cash.buffer.targetAtDeadline).toBe(round2(r.targetAtDeadline - 468_520));
  });

  it("12.1-lot farms need as many farms as 10-lot farms (5) at the same land cost per lot now that 83 lots are in hand", () => {
    const big = solveWarPlan({ ...d.inputs, lotsPerFarm: 12.1, farmCost: Math.round(12.1 * d.real.defaultLandCostPerLot) }, realm);
    expect(big.inputs.farmCost).toBe(566_909);
    expect(big.required.farmsToBuy).toBe(5);
    expect(profit.required.farmsToBuy).toBeGreaterThanOrEqual(big.required.farmsToBuy);
    expect(big.required.closingsPerMonth).toBeCloseTo(profit.required.closingsPerMonth, 1);
  });

  it("changing the deadline changes the verdict: by 2028-12-31 it is 4.49 lots/month with 5 farms, the last in Jul 2028", () => {
    const later = solveWarPlan({ ...d.inputs, deadline: "2028-12-31" }, realm);
    expect(later.verdict).not.toBe(profit.verdict);
    expect(later.deadlineMonthIndex).toBe(28);
    expect(later.required.closingsPerMonth).toBe(4.49);
    expect(later.required.farmsToBuy).toBe(5);
    expect(later.required.lastPurchaseDate).toBe("2028-07-31");
    expect(later.verdict).toContain("Jul 2028");
  });

  it("a cash target by 2027-03-31 is out of reach and says so", () => {
    const soon = solveWarPlan({ ...d.inputs, targetMode: "cash_in_bank", deadline: "2027-03-31" }, realm);
    expect(soon.feasible).toBe(false);
    // 83 lots in hand (was 71) let the desperate pace sell 16.9 lots/month for $1.8M, still nowhere near
    expect(soon.verdict).toBe(
      "No pace reaches $10.0M by 2027-03-31: even 16.9 lots/month with 0 farms and $0 raised lands at $1.8M. Push the deadline or lower the target.",
    );
    expect(soon.rotation.headline).toContain("no capital turn helps");
    expect(soon.rotation.headline).toContain("from today's 83 lots");
  });

  it("changes nothing in the Oracle's futures", () => {
    expect(realm.futures.closingsOnly.exitDate).toBe("2029-01-11");
    expect(realm.futures.current.exitDate).toBe("2028-01-11");
    expect(realm.futures.required.exitDate).toBe("2027-12-11");
    expect(realm.futures.oneMoreFarm.exitDate).toBe("2027-11-11");
  });
});

describe("fixture: EXPECTED (reservations first-class)", () => {
  const e = realm.expected;

  it("7 reservations were made in September 2026, all still live (Lamar Lot 5's pledge now belongs to September 2025), none closed this month", () => {
    // Expected closings weight at 100 % resolved conversion (was ×0.75 under blended).
    expect(e.thisMonth).toEqual({ month: "2026-09", reservations: 7, closings: 0, expectedReservations: 3, expectedClosings: 3, expectedNetProfit: 274_312.35 });
    expect(realm.lots.filter((l) => l.reservationDate?.startsWith("2026-09"))).toHaveLength(7);
    expect(realm.lots.filter((l) => l.reservationDate?.startsWith("2026-09") && l.stage === "reserved")).toHaveLength(7);
  });

  it("8 reservations are expected to close in November 2026 — 8 closings at 100 % resolved conversion, $425,149.22 of expected net profit", () => {
    const nov = e.expectedByMonth.find((m) => m.month === "2026-11");
    // Full stake at 100 % resolved (was $318,861.94 = stake × 0.75 under blended).
    expect(nov).toMatchObject({ count: 8, expectedClosings: 8, expectedNetProfit: 425_149.22, netProfitAtStake: 425_149.22, past: false });
    expect(nov?.expectedNetProfit).toBe(425_149.22);
    expect(nov?.expectedClosings).toBe(round2(8 * 1));
    const names = (nov?.propertyIds ?? []).map((id) => realm.lots.find((l) => l.propertyId === id)?.name).sort();
    expect(names).toEqual(["Franklin 2 — Lot 11", "Promised Valley — Lot 19", "Titus — Lot 4", "Titus — Lot 5", "Wichita — Lot 12", "Wichita — Lot 13", "Wichita — Lot 26", "Wichita — Lot 30"]);
    // next month (October) from the Throne Room's strip
    expect(e.nextMonth).toEqual({ month: "2026-10", reservations: 0, closings: 0, expectedReservations: 6, expectedClosings: 6, expectedNetProfit: 412_243.01 });
    expect(e.expectedByMonth.map((m) => [m.month, m.count, m.past])).toEqual([
      ["2026-07", 6, true],
      ["2026-08", 9, true],
      ["2026-09", 3, false],
      ["2026-10", 6, false],
      ["2026-11", 8, false],
      ["2026-12", 1, false],
    ]);
  });

  it("the deadline demands 8.44 closings/month, i.e. 8.44 reservations/month at 100 % resolved conversion; the realm reserves 7.1 and closes 4.73", () => {
    expect(e.requiredClosingsPerMonth).toBe(8.44);
    expect(e.requiredClosingsPerMonth).toBe(realm.goal.requiredLotsPerMonthToHitDeadline);
    // Same figure the Throne verdict speaks; the War Plan's required plan is a different model (8.5).
    expect(realm.warPlan.required.closingsPerMonth).not.toBe(e.requiredClosingsPerMonth);
    expect(e.requiredReservationsPerMonth).toBe(8.44);
    expect(e.requiredReservationsPerMonth).toBe(round2(8.44 / 1));
    expect(e.reservationsTrailing).toBe(21);
    expect(e.reservationsPerMonth).toBe(7.1);
    expect(e.reservationsPerMonth).toBe(realm.pipeline.reservationsMadePerMonth);
    expect(e.closingsTrailing).toBe(14);
    expect(e.closingsPerMonth).toBe(4.73);
    expect(e.closingsPerMonth).toBe(realm.goal.closedLotsPerMonth);
    // Forecasts use resolved; blended 75 % remains the trailing pulse on pipeline.conversion.pct.
    expect(e.conversionPct).toBe(100);
    expect(e.conversionSource).toBe("resolved");
    expect(realm.pipeline.conversion.pct).toBe(75);
    expect(realm.pipeline.conversion.resolvedPct).toBe(100);
  });

  it("every live reservation has an expected close: reservation + the farm's median (Titus 73, Lamar 42, Promised Valley 90), else the realm's 61.5", () => {
    expect(e.lots).toHaveLength(33);
    expect(e.undatedCount).toBe(0);
    const by = new Map(e.lots.map((l) => [l.lotName, l]));
    // At 100 % resolved, expectedNetProfit equals netProfitAtStake (was ×0.75 under blended).
    expect(by.get("Titus — Lot 2")).toMatchObject({ reservationDate: "2026-05-02", medianDaysToClose: 73, medianSource: "farm", expectedCloseDate: "2026-07-14", expectedMonth: "2026-07", overdue: true, daysWaiting: 132, daysToExpectedClose: -59, netProfitAtStake: 60_460.5, expectedNetProfit: 60_460.5 });
    expect(by.get("Avery — Lot 12")).toMatchObject({ medianDaysToClose: 61.5, medianSource: "realm", expectedCloseDate: "2026-10-01", overdue: false });
    expect(by.get("Lamar — Lot 1")).toMatchObject({ reservationDate: "2026-08-26", medianDaysToClose: 42, expectedCloseDate: "2026-10-07" });
    expect(by.get("Promised Valley — Lot 14")).toMatchObject({ reservationDate: "2026-09-08", medianDaysToClose: 90, expectedCloseDate: "2026-12-07", expectedMonth: "2026-12" });
    expect(by.get("Titus — Lot 2")?.expectedNetProfit).toBe(round2(60_460.5 * 1));
    // soonest expected close first
    for (let i = 1; i < e.lots.length; i++) expect((e.lots[i - 1]?.expectedCloseDate ?? "") <= (e.lots[i]?.expectedCloseDate ?? "")).toBe(true);
  });

  it("Committed: $2,198,937.18 expected from the 33 reservations ($2,198,937.18 at stake), landing by December 2026, most of it in November; 16 are overdue ($1,103,375.31)", () => {
    // At 100 % resolved, committed equals at-stake (was $1,649,202.95 = stake × 0.75 under blended).
    expect(e.committedNetProfit).toBe(2_198_937.18);
    expect(e.netProfitAtStake).toBe(2_198_937.18);
    expect(e.netProfitAtStake).toBe(realm.pipeline.pipelineNetProfit);
    expect(Math.abs(e.committedNetProfit - round2(e.netProfitAtStake * 1))).toBeLessThan(0.2);
    expect(e.liveReservations).toBe(33);
    expect(e.landsBy).toBe("2026-12");
    expect(e.peakMonth).toBe("2026-11");
    expect(e.overdueCount).toBe(16);
    expect(e.overdueNetProfit).toBe(1_103_375.31);
    // the overdue reservations are exactly the stuck ones
    expect(new Set(e.lots.filter((l) => l.overdue).map((l) => l.propertyId))).toEqual(realm.pipeline.stuckIds);
  });

  it("OXYGEN: 450 provisional days from the 33 reservations, shown apart from the 534 confirmed; the closings-only score is untouched", () => {
    expect(realm.oxygen.totalDaysGained).toBe(534);
    // Provisional days scale with resolved conversion (100 %); was 341 under blended 75 %.
    expect(realm.oxygen.provisionalDaysGained).toBe(450);
    expect(realm.oxygen.provisional.size).toBe(33);
    expect(realm.oxygen.conversionPct).toBe(100);
    const w26 = realm.lots.find((l) => l.name === "Wichita — Lot 26")!;
    expect(realm.oxygen.provisional.get(w26.propertyId)).toMatchObject({ reservationDate: "2026-09-03", measuredOn: "2026-09-03", netProfitAtStake: 39_784.37, daysIfClosed: 4, provisionalDays: 4, paceThatDay: 9_145.63 });
    // a reservation made when the realm was slow (May 2, pace $403/day) is worth many provisional days — the same rule closings follow
    expect(realm.oxygen.provisionalRanked[0]).toMatchObject({ lotName: "Titus — Lot 2", daysIfClosed: 150, provisionalDays: 150, paceThatDay: 402.8 });
    expect(realm.oxygen.provisionalRanked[0]?.provisionalDays).toBe(Math.round(150 * 1));
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
      "On September 3, Julia Rodriguez reserved Lot 26 of Wichita at $117,600 — the closing is expected around November 5, 4 provisional days gained.",
    );
    const t2 = realm.lots.find((l) => l.name === "Titus — Lot 2")!;
    expect(realm.narrative.get(`reservation:${t2.propertyId}`)).toBe(
      "On May 2, Crystal Thompson reserved Lot 2 of Titus at $135,412 — the closing was expected around July 14 and is 59 days late, 150 provisional days gained.",
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

describe("fixture: EXODUS ($10M back to the Alpha LPs in note fractions and cash)", () => {
  const defaults = deriveExodusDefaults(realm, realm.warPlanDefaults.inputs);
  const base = prepareExodus(defaults.inputs, realm);
  const scan = scanNotesPct(base, defaults.inputs);
  const plan = solveExodus(defaults.inputs, realm, { base, scan });
  const warPlanCash = solveWarPlan({ ...realm.warPlanDefaults.inputs, target: LP_CAPITAL_TO_RETURN, deadline: "2027-12-31", targetMode: "cash_in_bank" }, realm);

  it("prefills every input from the real data: $10M, 30 %, 2027-12-31, the real 80.92 % note-sale ratio (combined basis) and EAS-L04 excluded", () => {
    expect(LP_CAPITAL_TO_RETURN).toBe(10_000_000);
    expect(defaults.inputs).toMatchObject({ lpCapital: 10_000_000, notesPct: 30, deadline: "2027-12-31", noteSaleRatio: 0.8092, excludedNoteCodes: ["EAS-L04"], startingCash: 0 });
    // discount_from_upb is a PERCENT in Payments (6 of the 15 sales carry one): the combined basis uses price ÷ implied UPB
    // when it is recorded and price ÷ financed amount otherwise; the brief's literal price ÷ (price + discount) gives 99.98 % and is not used
    expect(defaults.real.noteSaleRatio).toEqual({
      used: 0.8092,
      basis: "combined",
      combined: 0.8092,
      discountBased: 0.8275,
      financedBased: 0.8045,
      literal: 0.9998,
      sales: 15,
      salesWithDiscount: 6,
      salesWithFinanced: 15,
      discountIsPercent: true,
    });
    expect(defaults.real.cashKeptToday).toBe(1_362_503.84);
    // $4,311,591.96 until Lakeview (+$495,000) and Franklin 2 (−$5,400) changed on 2026-09-11 21:15Z
    expect(defaults.real.owedToday).toBe(4_801_191.96);
    // every projected note is given the means of the 39 farm notes: $117,504.74 of face value at 9.46 % over 140 months
    expect(defaults.real.futureNote).toEqual({ faceValue: 117_504.74, annualRate: 0.0946, termMonths: 140, monthlyPayment: 1_388.87, notes: 39, avgSalePrice: 127_335, downPaymentPct: 7.72 });
  });

  it("free own-capital inventory at the snapshot: 9 notes, $671,227.84 of UPB — Promised Valley 3, Olney 3, Red River 1 3 — as queried on 2026-09-11", () => {
    const inv = plan.inventory;
    expect(inv.free).toEqual({ notes: 9, upb: 671_227.84, farms: ["Olney", "Promised Valley", "Red River 1"] });
    const byFarm = new Map<string, number>();
    for (const r of inv.rows.filter((x) => x.status === "free")) byFarm.set(r.farmName ?? "—", (byFarm.get(r.farmName ?? "—") ?? 0) + 1);
    expect(Object.fromEntries(byFarm)).toEqual({ Olney: 3, "Promised Valley": 3, "Red River 1": 3 });
    // the rest of today's active, unsold notes
    expect(inv.needsRelease).toEqual({ notes: 9, upb: 1_220_481.78, costToday: 488_922.41 });
    expect(inv.profitShare).toEqual({ notes: 6, upb: 741_730.12 });
    expect(inv.excluded).toEqual({ notes: 1, upb: 42_050.43 });
    // 13 notes on lots that belong to no farm in Payments, every one `not_sellable`: neither delivered nor sold (OPEN_QUESTIONS)
    expect(inv.noFarm).toEqual({ notes: 13, upb: 1_031_429.19 });
    expect(inv.rows.filter((r) => r.status === "no_farm").every((r) => r.commercialStatus === "not_sellable")).toBe(true);
    expect(inv.sold).toBe(15);
    expect(inv.inactive).toBe(3);
    // the best release today: EAS-L01 settles $4.10 per dollar (4.05 by the end of September, as the claim grows)
    expect(inv.rows.find((r) => r.status === "needs_release")).toMatchObject({ code: "EAS-L01", farmName: "Eastland", upb: 208_750.31, settlementPerDollar: 4.1 });
  });

  it("lot ledger parity with the RPC for every lot of every fixed_interest farm (Step 1): 49 lots within $0.01", () => {
    let compared = 0;
    for (const rpc of fixture.lotLedgers) {
      const ledger = computeLotLedger(rpc.farmId, fixture, new Date(`${rpc.asOf}T00:00:00Z`))!;
      for (const row of rpc.rows) {
        const lot = ledger.lots.find((l) => l.propertyId === row.property_id)!;
        expect(Math.abs(lot.capital - row.lot_capital), `${rpc.farmName} lot ${row.lot_number} capital`).toBeLessThanOrEqual(0.01);
        expect(Math.abs(lot.accruedInterest - row.accrued_return), `${rpc.farmName} lot ${row.lot_number} accrued`).toBeLessThanOrEqual(0.01);
        expect(Math.abs(lot.credits - row.credits), `${rpc.farmName} lot ${row.lot_number} credits`).toBeLessThanOrEqual(0.01);
        expect(Math.abs(lot.outstanding - row.lot_balance), `${rpc.farmName} lot ${row.lot_number} outstanding`).toBeLessThanOrEqual(0.01);
        expect(lot.released, `${rpc.farmName} lot ${row.lot_number} released`).toBe(row.released_at);
        compared += 1;
      }
    }
    expect(compared).toBe(49);
    expect(fixture.farmAcquisitions.filter((f) => f.deal_type === "fixed_interest")).toHaveLength(fixture.lotLedgers.length);
  });

  it("30 % in notes: $3.0M delivered — 9 free notes today, 2 released today (EAS-L01, FRE-L01), 14 free future notes, 2.89 released future lots — through 4.89 partial releases costing $206,019.91, no cash farm, 255.47 notes sold and $10,215,130.56 paid in cash; the capital is back 2027-09-29", () => {
    // Lower ad spend at 100 % resolved conversion (0.75× of blended) frees cash earlier: hit date moves in from 2027-10-05,
    // all 4.89 releases land in September, and cash paid to LPs rises with the ads saved.
    const s = plan.scenario;
    expect(s.notesPct).toBe(30);
    expect(s.noteTarget).toBe(3_000_000);
    expect(s.notesDelivered).toBe(3_000_000);
    expect(s.cashPaidToLPs).toBe(10_215_130.56);
    expect(s.totalReturned).toBe(13_215_130.56);
    expect(s.feasible).toBe(true);
    expect(s.notesCovered).toBe(true);
    expect(s.hitDate).toBe("2027-09-29");
    expect(s.lotsNeeded).toBe(258.36);
    expect(s.partialReleases.count).toBe(4.89);
    expect(s.partialReleases.cost).toBe(206_019.91);
    expect(s.flows.partialReleaseCost).toBe(206_019.91);
    // every release fits in September now that ads no longer absorb the Portafolio cash
    expect(s.partialReleases.list.map((r) => [r.label, r.monthIndex, r.ratio])).toEqual([
      ["EAS-L01", 1, 4.05],
      ["Avery · Sep 2026", 1, 3.95],
      ["FRE-L01", 1, 2.64],
      ["Eastland · Sep 2026", 1, 2.22],
      ["Franklin 2 · Sep 2026", 1, 2.1],
    ]);
    expect(round2(s.partialReleases.list.reduce((a, r) => a + r.units, 0))).toBe(4.89);
    expect(s.cashFarms).toMatchObject({ count: 0, cost: 0, purchases: [], lastPurchaseDate: null });
    expect(s.notesSold).toEqual({ count: 255.47, proceeds: 24_087_607.72 });
    // Ads drop 0.75× with resolved conversion: 864,541.07 × 0.75 = 648,405.83.
    expect(s.adSpend).toBe(648_405.83);
    expect(s.package).toEqual({
      totalUpb: 3_000_000,
      notes: 27.89,
      avgRatePct: 9.31,
      avgTermMonths: 138.49,
      avgRemainingMonths: 136.21,
      existingFree: { notes: 9, upb: 671_227.84 },
      existingReleased: { notes: 2, upb: 343_717.3 },
      projectedFree: { notes: 14, upb: 1_645_066.36 },
      projectedReleased: { notes: 2.89, upb: 339_988.5 },
      cashFarm: { notes: 0, upb: 0 },
    });
    // the note target is met in January 2027; from then on every note is sold (Option A)
    expect(s.rows.findIndex((r) => r.cumulativeNotes >= 3_000_000 - 0.005)).toBe(4);
    expect(s.rows.slice(5).every((r) => r.notesDelivered === 0)).toBe(true);
    expect(s.rows).toHaveLength(16);
    // September absorbs all 4.89 releases and starts paying LPs; ads are 0.75× the prior month's spend
    expect(s.rows[0]).toMatchObject({ date: "2026-09-30", lotsClosed: 13, freeNotesAvailable: 11.19, notesDelivered: 16.09, partialReleases: 4.89, partialReleaseCost: 206_019.91, notesSold: 5, adSpend: 32_505.83, cashPaidToLPs: 4_666.99, cashCarried: 0 });
    expect(s.rows[1]).toMatchObject({ date: "2026-10-31", partialReleases: 0, partialReleaseCost: 0 });
    expect(s.rows[2]).toMatchObject({ cashPaidToLPs: 0, cashCarried: -17_283.87 });
    expect(s.rows[15]).toMatchObject({ date: "2027-12-31", cumulativeNotes: 3_000_000, cumulativeCash: 10_215_130.56, cumulativeReturned: 13_215_130.56 });
    // 3.64 fixed-interest lots never close in the plan and carry the only partner balance left at the deadline
    expect(plan.unsoldLotsAtDeadline).toEqual({ lots: 3.64, partnerBalance: 193_280.12 });
    expect(s.partnerBalanceAtDeadline).toBe(193_280.12);
    expect(plan.latestViablePurchaseMonth).toBe(11);
    expect(plan.latestViablePurchaseDate).toBe("2027-07-31");
    expect(plan.verdict).toBe("With 30% in notes ($3.0M delivered): free $684K through 5 partial releases costing $206K, buy no cash farm, sell 255 notes and pay $10.2M to LPs in cash.");
    expect(exodusVerdict(plan, "es")).toBe(
      "Con 30% en pagarés ($3.0M entregados): liberar $684K mediante 5 liberaciones parciales por $206K, no comprar fincas con efectivo propio, vender 255 pagarés y pagar $10.2M a los LP en efectivo.",
    );
  });

  it("versus 100 % cash: $572,400 of discount saved, 1 lot spared, 17 days (0.56 months) earlier; maxNotesPct is 60, the top of the slider", () => {
    // Lower ads pull both plans earlier; the 30 % plan now lands 17 days before the 0 % baseline and spares one lot.
    expect(plan.baseline).toMatchObject({ notesPct: 0, notesDelivered: 0, cashPaidToLPs: 12_617_914.8, hitDate: "2027-10-16", lotsNeeded: 259.36 });
    expect(plan.baseline.notesSold).toEqual({ count: 283.36, proceeds: 26_496_001.89 });
    expect(plan.versusCash).toEqual({ discountSaved: 572_400, lotsNotNeeded: 1, monthsEarlier: 0.56, daysEarlier: 17, baselineHitDate: "2027-10-16", scenarioHitDate: "2027-09-29" });
    // discount saved = delivered UPB × (1 − sale ratio)
    expect(plan.versusCash.discountSaved).toBe(round2(3_000_000 * (1 - 0.8092)));
    expect(plan.maxNotesPct).toBe(60);
    expect(plan.coverage).toHaveLength(61);
    expect(plan.coverage.every((c) => c.notesCovered && c.feasible)).toBe(true);
    // 60 %: 30.73 releases costing $1,132,865.80 free $3.5M of future lots; the capital is back 2027-09-12 with $7,789,519.83 in cash
    const top = runExodus(base, { ...defaults.inputs, notesPct: 60 });
    expect(top).toMatchObject({ notesDelivered: 6_000_000, cashPaidToLPs: 7_789_519.83, hitDate: "2027-09-12" });
    expect(top.partialReleases).toMatchObject({ count: 30.73, cost: 1_132_865.8 });
    expect(top.cashFarms.count).toBe(0);
    expect(top.package).toMatchObject({ avgRatePct: 9.37, avgTermMonths: 139.7, projectedReleased: { notes: 29.73, upb: 3_478_163.32 } });
  });

  it("notesPct = 0 is the War Plan's cash-mode plan: the same 259.36 lots, 18 farms and $648,405.83 of ads month by month; the cash differs by a bridge that closes to $0", () => {
    const r = plan.reconciliation;
    expect(r.production).toEqual({ lotsClosed: 259.36, warPlanLotsClosed: 259.36, farmsBought: 18, warPlanFarmsBought: 18, adSpend: 648_405.83, warPlanAdSpend: 648_405.83, closingsMatch: true });
    expect(warPlanCash.required.lotsNeeded).toBe(259.36);
    expect(warPlanCash.required.farmsToBuy).toBe(18);
    expect(base.closingsByMonth.slice(1).map((x) => round2(x))).toEqual(warPlanCash.required.rows.map((row) => row.lotsClosed));
    // the Oracle's own arithmetic replayed on the same consumption lands on the War Plan's metric within $250 (16 rows of rounded cents on $27M of receipts)
    expect(r.warPlanCash).toEqual({ start: -3_438_688.12, receipts: 26_994_399.49, outlays: 8_433_360, takePaid: 5_116_413.98, atDeadline: 10_005_937.39, warPlanTargetAtDeadline: 10_006_139.81 });
    expect(Math.abs(r.warPlanCash.atDeadline - warPlanCash.required.targetAtDeadline)).toBeLessThan(250);
    // the Exodus pays $12,617,914.80 in cash at 0 %: ads are 0.75× the prior pin, so more cash reaches the LPs
    expect(r.baselineCashPaid).toBe(12_617_914.8);
    expect(r.bridge).toEqual({
      replayDrift: -202.42,
      startingPosition: 3_438_688.12,
      receipts: -77_147.76,
      existingNotes: 1_034_918.91,
      partnerPayments: -1_136_076.03,
      settlementSpend: 0,
      adSpend: -648_405.83,
      unpaidCarry: 0,
      residual: 0,
    });
    const b = r.bridge;
    expect(round2(r.warPlanCash.warPlanTargetAtDeadline + b.replayDrift + b.startingPosition + b.receipts + b.existingNotes + b.partnerPayments + b.settlementSpend + b.adSpend + b.unpaidCarry + b.residual)).toBe(r.baselineCashPaid);
    expect(plan.baseline.flows).toEqual({
      startingCash: 0,
      projectedReceipts: 26_917_251.73,
      existingReceipts: 2_128_326.92,
      projectedPartnerPaid: 14_685_850.01,
      existingPartnerPaid: 1_093_408.01,
      partialReleaseCost: 0,
      cashFarmCost: 0,
      adSpend: 648_405.83,
      cashCarriedAtDeadline: 0,
    });
  });

  it("for every percent from 0 to maxNotesPct, raising the percent never increases the cash paid to LPs and never increases the lots that must be sold", () => {
    expect(plan.coverage.map((c) => c.pct)).toEqual(Array.from({ length: 61 }, (_, i) => i));
    for (let i = 1; i <= plan.maxNotesPct; i++) {
      const prev = plan.coverage[i - 1]!;
      const cur = plan.coverage[i]!;
      expect(cur.cashPaidToLPs, `pct ${i} cash`).toBeLessThanOrEqual(prev.cashPaidToLPs + 0.005);
      expect(cur.lotsNeeded, `pct ${i} lots`).toBeLessThanOrEqual(prev.lotsNeeded + 0.005);
      expect(cur.notesDelivered, `pct ${i} delivered`).toBe(round2((LP_CAPITAL_TO_RETURN * i) / 100));
    }
    // and the settlement spend never falls when the percent rises
    for (let i = 1; i <= plan.maxNotesPct; i++) expect(plan.coverage[i]!.partialReleaseCost).toBeGreaterThanOrEqual(plan.coverage[i - 1]!.partialReleaseCost - 0.005);
  });

  it("changes nothing in the War Plan, the Oracle or the goal", () => {
    expect(realm.warPlanDefaults.inputs.target).toBe(10_000_000);
    expect(realm.futures.required.exitDate).toBe("2027-12-11");
    expect(realm.goal.netProfitToDate).toBe(2_236_378.34);
  });
});
