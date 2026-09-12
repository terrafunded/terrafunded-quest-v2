/**
 * Phase 2 "Epic" modules on synthetic data: debt, oxygen, liberation, campaigns, streaks,
 * futures, narrative, story and celebrations.
 */
import { describe, expect, it } from "vitest";
import { ASOF, distribution, farm, fileCase, investor, note, noteSale, property, snapshot } from "./builders";
import { buildRealm } from "../realm";
import { computeDebt } from "../debt";
import { computeOxygen, netProfitPerDayAtPace } from "../oxygen";
import { computeLiberation, liberationDate } from "../liberation";
import { computeCampaigns } from "../campaigns";
import { computeStreaks, isoWeekKey, isoWeekStart } from "../streaks";
import { computeFutures } from "../futures";
import { narrate, proseDate, proseMoney } from "../narrative";
import { decideCelebrations } from "../visits";
import { withLiberationEvents } from "../events";

/** One sponsor, two farms: Northfield (repaid in full) and Southmoor (still owed). */
function realmFixture() {
  const sponsor = investor({ name: "Lady Ashcombe" });
  const north = farm({
    farm_name: "Northfield",
    deal_type: "fixed_interest",
    investor_id: sponsor.id,
    investor_capital: 400_000,
    annual_interest_rate: 20,
    total_lots: 4,
    funding_date: "2025-06-01",
    closing_date: "2025-06-01",
  });
  const south = farm({
    farm_name: "Southmoor",
    deal_type: "fixed_interest",
    investor_id: sponsor.id,
    investor_capital: 600_000,
    annual_interest_rate: 25,
    total_lots: 6,
    funding_date: "2026-01-10",
    closing_date: "2026-01-10",
  });
  const own = farm({ farm_name: "Kingsacre", deal_type: "own_capital", investor_capital: 300_000, total_lots: 3, funding_date: "2026-05-01", closing_date: "2026-05-01" });

  const nProps = [1, 2, 3, 4].map((n) => property(north.id, n, { name: `Northfield — Lot ${n}` }));
  const sProps = [1, 2, 3, 4, 5, 6].map((n) => property(south.id, n, { name: `Southmoor — Lot ${n}` }));
  const kProps = [1, 2, 3].map((n) => property(own.id, n, { name: `Kingsacre — Lot ${n}` }));

  // Northfield: all four lots sold (two in the same week), one note sold.
  const nCases = nProps.map((p, i) =>
    fileCase(p.id, { status: "completed", sale_price: 200_000, down_payment: 20_000, reservation_date: "2025-07-01", closing_date: ["2025-08-04", "2025-08-06", "2025-08-13", "2025-08-20"][i] ?? null }),
  );
  const nNotes = nProps.map((p, i) => note(p.id, { original_amount: 200_000, down_payment: 20_000, financed_amount: 180_000, start_date: ["2025-08-04", "2025-08-06", "2025-08-13", "2025-08-20"][i] ?? null, is_sold: i === 0 }));
  const nSale = noteSale((nNotes[0] as { id: string }).id, { sale_price: 150_000, sale_date: "2025-10-01" });

  // Southmoor: two closings in the trailing window, one reservation.
  const sCases = [
    fileCase((sProps[0] as { id: string }).id, { status: "completed", sale_price: 180_000, down_payment: 9_000, reservation_date: "2026-06-01", closing_date: "2026-07-15" }),
    fileCase((sProps[1] as { id: string }).id, { status: "completed", sale_price: 180_000, down_payment: 9_000, reservation_date: "2026-07-01", closing_date: "2026-08-25" }),
    fileCase((sProps[2] as { id: string }).id, { status: "active", sale_price: 180_000, down_payment: 9_000, reservation_date: "2026-09-01" }),
  ];

  const dists = [
    distribution(north.id, { investor_id: sponsor.id, distribution_date: "2025-09-01", amount: 150_000, kind: "capital_return" }),
    distribution(north.id, { investor_id: sponsor.id, distribution_date: "2025-11-01", amount: 250_000, kind: "capital_return" }),
    distribution(north.id, { investor_id: sponsor.id, distribution_date: "2025-11-01", amount: 30_000, kind: "profit_share" }),
    distribution(south.id, { investor_id: sponsor.id, distribution_date: "2026-08-30", amount: 150_000, kind: "capital_return" }),
  ];

  const snap = snapshot({
    farmAcquisitions: [north, south, own],
    properties: [...nProps, ...sProps, ...kProps],
    fileCases: [...nCases, ...sCases],
    notes: nNotes,
    noteSales: [nSale],
    investorDistributions: dists,
    investors: [sponsor],
  });
  return { snap, sponsor, north, south, own };
}

describe("THE DEBT", () => {
  const { snap } = realmFixture();
  const realm = buildRealm(snap, ASOF);

  it("owes only sponsor capital net of capital returns, never own capital", () => {
    // Northfield fully returned; Southmoor 600k − 150k.
    expect(realm.debt.capitalOwed).toBe(450_000);
    expect(realm.debt.ownCapitalOutstanding).toBe(300_000);
    expect(realm.debt.openPositions).toBe(1);
  });

  it("counts the days left and the net profit required per day, and recomputes daily", () => {
    expect(realm.debt.daysLeft).toBe(476);
    expect(realm.debt.requiredNetProfitPerDay).toBeCloseTo(realm.goal.remaining / 476, 2);
    const tomorrow = computeDebt(realm.farms, { ...realm.goal, daysToDeadline: 475, asOf: "2026-09-12" }, realm.lots);
    expect(tomorrow.daysLeft).toBe(475);
    expect(tomorrow.requiredNetProfitPerDay).toBeGreaterThan(realm.debt.requiredNetProfitPerDay ?? 0);
  });

  it("is null once the deadline has passed, and null without a closing to measure from", () => {
    const late = computeDebt(realm.farms, { ...realm.goal, daysToDeadline: -3 }, []);
    expect(late.daysLeft).toBe(0);
    expect(late.requiredNetProfitPerDay).toBeNull();
    expect(late.actualNetProfitPerDay).toBeNull();
    expect(late.actualSince).toBeNull();
  });

  it("measures the actual net profit per day since the era start (Mar 2026), keeping the all-time figure for the record", () => {
    // Northfield's four closings (Aug 2025) are real money but predate the era; only Southmoor's two closings count.
    const d = realm.debt;
    expect(d.firstCloseDate).toBe("2025-08-04");
    expect(d.actualSince).toBe("2026-03-01");
    expect(d.actualEraClipped).toBe(true);
    expect(d.actualSinceLabel).toBe("since Mar 2026");
    expect(d.actualDays).toBe(194);
    const southmoor = realm.lots.filter((l) => l.farmName === "Southmoor" && l.closeDate).reduce((s, l) => s + (l.netProfit ?? 0), 0);
    expect(d.actualNetProfit).toBeCloseTo(southmoor, 2);
    expect(d.actualNetProfitPerDay).toBeCloseTo(southmoor / 194, 2);
    expect(d.actualNetProfitPerDayAllTime).toBeCloseTo(realm.goal.netProfitToDate / 403, 2);
    // without an era the per-day figure runs from the first closing
    const allTime = computeDebt(realm.farms, realm.goal, realm.lots, { eraStart: null });
    expect(allTime).toMatchObject({ actualSince: "2025-08-04", actualEraClipped: false, actualSinceLabel: null, actualDays: 403 });
    expect(allTime.actualNetProfitPerDay).toBe(d.actualNetProfitPerDayAllTime);
    // an era that has not begun by asOf does not apply
    expect(computeDebt(realm.farms, realm.goal, realm.lots, { eraStart: "2027-01-01" }).actualSince).toBe("2025-08-04");
  });

  it("accrues interest per day only on outstanding fixed-interest capital", () => {
    // Southmoor: 450k × 25% / 365
    expect(realm.debt.interestPerDay).toBeCloseTo((450_000 * 0.25) / 365, 2);
  });
});

describe("OXYGEN", () => {
  const { snap } = realmFixture();
  const realm = buildRealm(snap, ASOF);

  it("scores every closed lot and sums them into the primary score", () => {
    const sold = realm.lots.filter((l) => l.stage === "closed" || l.stage === "note_sold");
    expect(realm.oxygen.perLot.size).toBe(sold.length);
    expect(realm.oxygen.totalDaysGained).toBe([...realm.oxygen.perLot.values()].reduce((s, o) => s + o.daysGained, 0));
    expect(realm.oxygen.totalDaysGained).toBeGreaterThan(0);
  });

  it("equals net profit ÷ that day's pace, i.e. the shift of the projected exit date", () => {
    const lot = realm.lots.find((l) => l.name === "Southmoor — Lot 2");
    const o = realm.oxygen.perLot.get(lot?.propertyId ?? "");
    expect(o).toBeDefined();
    expect(o?.measuredOn).toBe("2026-08-25");
    expect(o?.daysGained).toBe(Math.round((lot?.netProfit ?? 0) / (o?.paceThatDay ?? 1)));
    // before − after = daysGained
    const before = new Date(`${o?.projectedBefore}T00:00:00Z`).getTime();
    const after = new Date(`${o?.projectedAfter}T00:00:00Z`).getTime();
    expect(Math.round((before - after) / 86_400_000)).toBe(o?.daysGained);
  });

  it("is fixed at the closing date: a later asOf does not change an old lot's score", () => {
    const later = computeOxygen(realm.lots, realm.farms, new Date("2026-12-01T00:00:00Z"));
    const lot = realm.lots.find((l) => l.name === "Northfield — Lot 1");
    expect(later.perLot.get(lot?.propertyId ?? "")?.daysGained).toBe(realm.oxygen.perLot.get(lot?.propertyId ?? "")?.daysGained);
  });

  it("derives today's pace from the goal status", () => {
    const g = realm.goal;
    expect(netProfitPerDayAtPace(g)).toBeCloseTo(((g.avgNetProfitPerClosedLot ?? 0) * g.closedLotsPerMonth * 12) / 365.25, 6);
    expect(netProfitPerDayAtPace({ ...g, closedLotsPerMonth: 0 })).toBeNull();
  });
});

describe("INVESTOR LIBERATION", () => {
  const { snap, north, south } = realmFixture();
  const realm = buildRealm(snap, ASOF);

  it("frees a position when capital_return reaches 100 % and dates it at the crossing distribution", () => {
    const n = realm.liberation.hostages.find((h) => h.farmId === north.id);
    expect(n?.freed).toBe(true);
    expect(n?.pctReturned).toBe(100);
    expect(n?.freedAt).toBe("2025-11-01");
    expect(n?.daysHeld).toBe(153);
    expect(n?.paidOnTop).toBe(30_000);
  });

  it("keeps a partly repaid position captive and the sponsor with it", () => {
    const s = realm.liberation.hostages.find((h) => h.farmId === south.id);
    expect(s?.freed).toBe(false);
    expect(s?.pctReturned).toBe(25);
    const sponsor = realm.liberation.sponsors[0];
    expect(sponsor?.freed).toBe(false);
    expect(sponsor?.pctReturned).toBe(55);
    expect(realm.liberation.freedSponsors).toHaveLength(0);
    expect(realm.liberation.moments.map((m) => m.date)).toEqual(["2025-11-01"]);
  });

  it("ignores own-capital farms: nobody is owed", () => {
    expect(realm.liberation.hostages.some((h) => h.farmName === "Kingsacre")).toBe(false);
  });

  it("liberationDate tolerates cent rounding and returns null when never reached", () => {
    expect(liberationDate(100, [distribution("f", { amount: 99.995, distribution_date: "2026-01-01" })])).toBe("2026-01-01");
    expect(liberationDate(100, [distribution("f", { amount: 50, distribution_date: "2026-01-01" })])).toBeNull();
  });

  it("adds a liberation event to the chronicle with the running net profit", () => {
    const ev = realm.events.find((e) => e.kind === "liberation");
    expect(ev?.date).toBe("2025-11-01");
    expect(ev?.title).toBe("Lady Ashcombe freed");
    const prev = realm.events.filter((e) => e.date <= "2025-11-01" && e.kind !== "liberation").at(-1);
    expect(ev?.cumulativeNetProfit).toBe(prev?.cumulativeNetProfit);
    expect(withLiberationEvents(realm.events, [], ASOF)).toBe(realm.events);
  });

  it("computeLiberation works from farms + investors alone", () => {
    const lib = computeLiberation(realm.farms, realm.investors, snap.investorDistributions);
    expect(lib.totalCapital).toBe(1_000_000);
    expect(lib.totalReturned).toBe(550_000);
    expect(lib.pctReturned).toBe(55);
  });
});

describe("FARM CAMPAIGNS", () => {
  const { snap, north, south, own } = realmFixture();
  const realm = buildRealm(snap, ASOF);
  const byId = new Map(realm.campaigns.map((c) => [c.farmId, c]));

  it("marks a sold-out farm whose sales cover capital + interest as conquered", () => {
    const c = byId.get(north.id);
    expect(c?.state).toBe("conquered");
    expect(c?.recovered).toBe(800_000);
    expect(c?.lotsLeftToCover).toBe(0);
  });

  it("puts a farm with recent closings under siege and sizes the remaining goal", () => {
    const c = byId.get(south.id);
    expect(c?.state).toBe("under_siege");
    expect(c?.target).toBeCloseTo(600_000 + realm.farms.find((f) => f.farmId === south.id)!.interest.accruedToDate, 2);
    expect(c?.recovered).toBe(360_000);
    expect(c?.avgSalePriceSource).toBe("farm");
    expect(c?.lotsLeftToCover).toBe(Math.ceil((c!.shortfall) / 180_000));
    expect(c?.lastClosingDate).toBe("2026-08-25");
    expect(c?.daysSinceLastClosing).toBe(17);
  });

  it("flags losing ground when interest accrues, nothing closed in 60 days and no reservation is waiting", () => {
    // Without Southmoor's live reservation the farm is losing ground by mid-November.
    const noPledges = buildRealm({ ...snap, fileCases: snap.fileCases.filter((c) => c.status !== "active") }, ASOF);
    const stale = computeCampaigns(noPledges.farms, noPledges.lots, new Date("2026-11-15T00:00:00Z"));
    const c = stale.find((x) => x.farmId === south.id);
    expect(c?.state).toBe("losing_ground");
    expect(c?.reservedLots).toBe(0);
    expect(c?.reason).toMatch(/no closing in 82 days/);
  });

  it("a farm with a live reservation is never losing ground: it is closing pending, with the count", () => {
    const stale = computeCampaigns(realm.farms, realm.lots, new Date("2026-11-15T00:00:00Z"));
    const c = stale.find((x) => x.farmId === south.id);
    expect(c?.state).toBe("closing_pending");
    expect(c?.reservedLots).toBe(1);
    expect(c?.reason).toBe("1 reservation waiting to close, none in 82 days");
    expect(c?.interestAccruing).toBe(true);
    // today it still has a closing inside 60 days, so it stays under siege
    expect(byId.get(south.id)?.state).toBe("under_siege");
    expect(byId.get(south.id)?.reservedLots).toBe(1);
  });

  it("never calls an own-capital farm losing ground (no interest accrues)", () => {
    const c = byId.get(own.id);
    expect(c?.state).toBe("under_siege");
    expect(c?.interestAccruing).toBe(false);
    expect(c?.avgSalePriceSource).toBe("realm");
  });
});

describe("STREAKS", () => {
  it("computes ISO week keys and Monday starts", () => {
    expect(isoWeekStart(new Date("2026-09-11T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-09-07");
    expect(isoWeekKey(new Date("2026-09-11T00:00:00Z"))).toBe("2026-W37");
    expect(isoWeekKey(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
    expect(isoWeekKey(new Date("2024-12-30T00:00:00Z"))).toBe("2025-W01");
  });

  it("finds the best run of consecutive weeks, the best week and the best month", () => {
    const closings = [
      { date: "2026-06-02", netProfit: 10 },
      { date: "2026-06-04", netProfit: 10 },
      { date: "2026-06-10", netProfit: 10 },
      { date: "2026-06-17", netProfit: 10 },
      // gap
      { date: "2026-07-20", netProfit: 50 },
      { date: "2026-09-08", netProfit: 5 }, // this week (asOf 2026-09-11)
    ];
    const s = computeStreaks(closings, ASOF);
    expect(s.bestWeeks).toBe(3);
    expect(s.bestWeeksEndedOn).toBe("2026-06-21");
    expect(s.closedThisWeek).toBe(true);
    expect(s.currentWeeks).toBe(1);
    expect(s.daysToKeepStreak).toBe(0);
    expect(s.bestWeek?.week).toBe("2026-W23");
    expect(s.bestWeek?.count).toBe(2);
    expect(s.bestMonth).toEqual({ month: "2026-06", count: 4, netProfit: 40 });
    expect(s.bestMonths).toBe(2);
  });

  it("keeps a streak alive through last week and counts days left to keep it", () => {
    const s = computeStreaks([{ date: "2026-08-26", netProfit: 1 }, { date: "2026-09-02", netProfit: 1 }], ASOF);
    expect(s.closedThisWeek).toBe(false);
    expect(s.currentWeeks).toBe(2);
    expect(s.daysToKeepStreak).toBe(2); // Fri → Sun
    const broken = computeStreaks([{ date: "2026-08-20", netProfit: 1 }], ASOF);
    expect(broken.currentWeeks).toBe(0);
  });

  it("ignores future-dated closings and handles no data", () => {
    expect(computeStreaks([{ date: "2027-01-01", netProfit: 1 }], ASOF).weeks).toHaveLength(0);
    const empty = computeStreaks([], ASOF);
    expect(empty.bestWeek).toBeNull();
    expect(empty.bestWeeks).toBe(0);
  });
});

describe("ORACLE futures", () => {
  const { snap } = realmFixture();
  const realm = buildRealm(snap, ASOF);

  it("produces four futures; the closings-only line is the old current pace, seeded from the real averages", () => {
    const f = realm.futures;
    expect(f.all.map((x) => x.id)).toEqual(["current_pace", "required_pace", "one_more_farm", "closings_only"]);
    expect(f.closingsOnly.params).toEqual(realm.oracleDefaults);
    expect(f.closingsOnly.scheduled).toEqual([]);
    expect(f.closingsOnly.title).toBe("If no reservation ever closed");
    expect(f.required.params.lotsPerMonth).toBeGreaterThan(f.closingsOnly.params.lotsPerMonth);
    expect(f.oneMoreFarm.startInventory).toBe(f.current.startInventory + realm.oracleDefaults.avgLotsPerFarm);
    expect(f.oneMoreFarm.params.lotsPerMonth).toBeGreaterThan(f.current.params.lotsPerMonth);
    // 2 lots in 90 days never reaches $10M inside the 10-year horizon: no exit, no comparison.
    expect(f.current.exitDate).toBeNull();
    expect(f.current.daysEarlierThanCurrent).toBeNull();
  });

  it("the current pace schedules every live reservation on its expected date, then continues at reservations × conversion", () => {
    const f = realm.futures;
    const e = realm.expected;
    expect(f.current.scheduled).toHaveLength(e.liveReservations);
    expect(f.current.scheduled[0]).toEqual({ date: e.lots[0]?.expectedCloseDate, lots: e.conversionPct / 100, netProfit: e.lots[0]?.expectedNetProfit });
    expect(f.current.params.lotsPerMonth).toBe(Math.round(e.reservationsPerMonth * (e.conversionPct / 100) * 100) / 100);
    expect(f.oneMoreFarm.scheduled).toEqual(f.current.scheduled);
    // Southmoor Lot 3, reserved 2026-09-01, closes one Southmoor median (49.5 days) later, in the second simulated month.
    const series = f.current.result.series;
    expect(e.lots[0]?.expectedCloseDate).toBe("2026-10-21");
    expect(series[0]?.scheduledLotsClosed).toBe(0);
    expect(series[1]?.scheduledLotsClosed).toBe(1);
    // the steady pace only starts after the realm's median lag (43.5 → 44 days: 2026-10-25, inside month 2, 17 of its 31 days)
    expect(realm.pipeline.medianDaysToClose).toBe(43.5);
    expect(series[0]?.flatLotsClosed).toBe(0);
    expect(series[1]?.flatLotsClosed).toBeCloseTo((0.68 * 17) / 31, 2);
    expect(series[1]?.lotsClosed).toBeCloseTo(1 + (0.68 * 17) / 31, 2);
    expect(series[2]?.flatLotsClosed).toBe(f.current.params.lotsPerMonth);
    expect(f.current.premise).toContain("1 live reservation");
    expect(f.current.premise).toContain(`${f.current.params.lotsPerMonth} lots/month`);
  });

  it("the required-pace future reaches the goal by the deadline (to the month)", () => {
    const f = computeFutures(realm.oracleDefaults, realm.goal, 20, ASOF, 2);
    expect(f.required.exitDate).not.toBeNull();
    const exit = new Date(`${f.required.exitDate}T00:00:00Z`).getTime();
    const deadline = new Date("2027-12-31T00:00:00Z").getTime();
    expect(Math.abs(exit - deadline) / 86_400_000).toBeLessThan(45);
    expect(f.required.daysEarlierThanCurrent).toBeNull();
    // without the reservations layer the current pace is the closings-only line
    expect(f.current.params).toEqual(realm.oracleDefaults);
    expect(f.current.result.goalDate).toBe(f.closingsOnly.result.goalDate);
  });
});

describe("NARRATED CHRONICLE", () => {
  const { snap } = realmFixture();
  const realm = buildRealm(snap, ASOF);

  it("formats dates and money for prose", () => {
    expect(proseDate("2026-05-30", 2026)).toBe("May 30");
    expect(proseDate("2025-05-30", 2026)).toBe("May 30, 2025");
    expect(proseMoney(137_780)).toBe("$137,780");
    expect(proseMoney(null)).toBe("an undisclosed sum");
  });

  it("narrates a closing with buyer, lot, farm, price, the days since the reservation and the days gained", () => {
    const lot = realm.lots.find((l) => l.name === "Southmoor — Lot 2")!;
    const line = realm.narrative.get(`closing:${lot.propertyId}`);
    const days = realm.oxygen.perLot.get(lot.propertyId)?.daysGained ?? 0;
    expect(line).toBe(`On August 25, Buyer One claimed Lot 2 of Southmoor for $180,000, 55 days after Buyer's reservation. The realm gained ${days} days.`);
  });

  it("narrates a live reservation with its expected close and provisional days", () => {
    const lot = realm.lots.find((l) => l.name === "Southmoor — Lot 3")!;
    const line = realm.narrative.get(`reservation:${lot.propertyId}`);
    const p = realm.oxygen.provisional.get(lot.propertyId)!;
    expect(p.provisionalDays).toBeGreaterThan(0);
    expect(line).toBe(`On September 1, Buyer One pledged for Lot 3 of Southmoor at $180,000 — the closing is expected around October 21, ${p.provisionalDays} provisional days gained.`);
    // the reservation of a lot that has since closed carries no expectation
    const closed = realm.lots.find((l) => l.name === "Southmoor — Lot 2")!;
    expect(realm.narrative.get(`reservation:${closed.propertyId}`)).toBe("On July 1, Buyer One pledged for Lot 2 of Southmoor at $180,000.");
  });

  it("has one line for every event and templates for every kind", () => {
    expect(realm.narrative.size).toBe(realm.events.length);
    const kinds = new Set(realm.events.map((e) => e.kind));
    for (const k of ["farm_acquired", "reservation", "closing", "note_sale", "distribution", "liberation"]) expect(kinds.has(k as never)).toBe(true);
    const sale = realm.events.find((e) => e.kind === "note_sale")!;
    expect(realm.narrative.get(sale.id)).toBe("On October 1, 2025, the note on Lot 1 of Northfield was sold to Note Buyer LLC for $150,000, and the gold came home.");
    const freed = realm.events.find((e) => e.kind === "liberation")!;
    expect(realm.narrative.get(freed.id)).toBe("On November 1, 2025, Lady Ashcombe was freed: every coin of Northfield repaid ($400,000).");
    const cap = realm.events.find((e) => e.kind === "distribution" && e.title.startsWith("Capital"))!;
    expect(realm.narrative.get(cap.id)).toBe("On September 1, 2025, $150,000 of capital was returned to Lady Ashcombe for Northfield.");
  });

  it("withholds test-client names and handles unknown lots", () => {
    const lotsById = new Map(realm.lots.map((l) => [l.propertyId, { ...l, buyerName: null, buyerIsTestClient: true }]));
    const ev = realm.events.find((e) => e.kind === "reservation")!;
    expect(narrate(ev, { lotsById, currentYear: 2026 })).toMatch(/a buyer whose name the scribes withhold pledged for Lot/);
    expect(narrate({ ...ev, propertyId: "nope", lotName: null, farmName: "Elsewhere" }, { lotsById: new Map(), currentYear: 2026 })).toMatch(/a buyer pledged for a lot of Elsewhere/);
  });
});

describe("CINEMATIC INTRO story", () => {
  const { snap } = realmFixture();
  const realm = buildRealm(snap, ASOF);

  it("tells the real story with real numbers", () => {
    const lines = realm.story.cards.map((c) => c.line).join("\n");
    expect(realm.story.hasData).toBe(true);
    expect(lines).toContain("3 farms across 1 county, cut into 13 lots.");
    expect(lines).toContain("$1,000,000 lent by 1 sponsor. $450,000 still owed.");
    expect(lines).toContain(`${realm.goal.closedLots} lots closed for ${proseMoney(realm.goal.netProfitToDate)} of net profit`);
    expect(lines).toContain(`${realm.oxygen.totalDaysGained} days gained toward the exit.`);
    expect(lines).toContain("Lady Ashcombe walked free of Northfield. 1 remains in chains.");
    expect(lines).toContain(`476 days left. ${proseMoney(realm.debt.requiredNetProfitPerDay)} of net profit needed every single day.`);
  });

  it("has nothing to say for an empty realm", () => {
    const empty = buildRealm(snapshot(), ASOF);
    expect(empty.story.hasData).toBe(false);
    expect(empty.story.cards).toHaveLength(0);
  });
});

describe("CELEBRATIONS since last visit", () => {
  const { snap } = realmFixture();
  const realm = buildRealm(snap, ASOF);
  const now = "2026-09-11T10:00:00Z";

  it("celebrates nothing on a first visit but remembers today's events", () => {
    const d = decideCelebrations(realm.events, null, [], now);
    expect(d.firstVisit).toBe(true);
    expect(d.toCelebrate).toEqual([]);
  });

  it("celebrates closings, note sales and liberations dated on/after the last visit, once", () => {
    const d = decideCelebrations(realm.events, "2026-08-01T09:00:00Z", [], now);
    expect(d.toCelebrate.map((e) => e.kind)).toEqual(["closing"]);
    expect(d.toCelebrate[0]?.date).toBe("2026-08-25");
    const again = decideCelebrations(realm.events, "2026-08-01T09:00:00Z", d.celebratedIds, now);
    expect(again.toCelebrate).toEqual([]);
  });

  it("does not celebrate reservations or future events", () => {
    const d = decideCelebrations(realm.events, "2025-01-01T00:00:00Z", [], now);
    expect(d.toCelebrate.every((e) => ["closing", "note_sale", "liberation"].includes(e.kind) && !e.future)).toBe(true);
    expect(d.toCelebrate.some((e) => e.kind === "liberation")).toBe(true);
  });
});
