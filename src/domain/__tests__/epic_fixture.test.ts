/**
 * Phase 2 "Epic" numbers reproduced from the live snapshot (src/domain/__fixtures__/payments.json,
 * 2026-09-11). If the fixture is regenerated these change; document the drift in PROGRESS.md.
 */
import { describe, expect, it } from "vitest";
import raw from "../__fixtures__/payments.json";
import type { PaymentsSnapshot } from "../types";
import { buildRealm } from "../realm";
import { round2 } from "../math";

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
