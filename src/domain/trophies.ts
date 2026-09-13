import type { FarmEconomics } from "./farm";
import type { GoalStatus } from "./goal";
import type { Lot } from "./lot";
import type { RealmEvent } from "./events";
import type { Treasury } from "./treasury";
import type { InvestorSummary } from "./investors";
import { isSold } from "./lot";
import type { Streaks } from "./streaks";
import type { Liberation } from "./liberation";
import { groupBy, round2 } from "./math";
import { monthKey, parseDate } from "./dates";

export type TrophyTier = "bronze" | "silver" | "gold" | "legendary";
/** Rarity tiers (Phase 2 §5): how hard the trophy is to earn. Derived from the tier. */
export type TrophyRarity = "common" | "rare" | "epic" | "legendary";

export const RARITY_BY_TIER: Record<TrophyTier, TrophyRarity> = {
  bronze: "common",
  silver: "rare",
  gold: "epic",
  legendary: "legendary",
};

export interface Trophy {
  id: string;
  title: string;
  description: string;
  tier: TrophyTier;
  rarity: TrophyRarity;
  earned: boolean;
  /** ISO date when earned, if known. */
  earnedAt: string | null;
  /** 0–100 progress toward the trophy. */
  progress: number;
  /** Human-readable current value, e.g. "$1.2M / $1M". */
  detail: string;
}

export interface TrophyInputs {
  lots: Lot[];
  farms: FarmEconomics[];
  goal: GoalStatus;
  events: RealmEvent[];
  treasury: Treasury;
  investors: InvestorSummary[];
  streaks?: Streaks;
  /** Streaks of reservations made (realm.reservationStreaks). */
  reservationStreaks?: Streaks;
  liberation?: Liberation;
}

const pct = (value: number, target: number) => (target <= 0 ? 100 : round2(Math.max(0, Math.min(100, (value / target) * 100))));
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** At least 15 achievements, every one derived from real rows. */
export function computeTrophies(i: TrophyInputs): Trophy[] {
  const sold = i.lots.filter(isSold);
  const closings = i.events.filter((e) => e.kind === "closing");
  const noteSales = i.events.filter((e) => e.kind === "note_sale");
  const milestones = i.events.filter((e) => e.kind === "milestone");
  const firstAt = (list: RealmEvent[]) => list[0]?.date ?? null;

  const trophies: Omit<Trophy, "rarity">[] = [];

  trophies.push({
    id: "first_blood",
    title: "First Blood",
    description: "Close the first lot sale in the realm.",
    tier: "bronze",
    earned: closings.length > 0,
    earnedAt: firstAt(closings),
    progress: pct(closings.length, 1),
    detail: `${closings.length} closings`,
  });

  trophies.push({
    id: "first_note_sold",
    title: "The First Scroll",
    description: "Sell the first promissory note for cash.",
    tier: "bronze",
    earned: noteSales.length > 0,
    earnedAt: firstAt(noteSales),
    progress: pct(noteSales.length, 1),
    detail: `${noteSales.length} notes sold`,
  });

  for (const [n, tier] of [
    [1, "silver"],
    [2, "silver"],
    [5, "gold"],
    [10, "legendary"],
  ] as const) {
    const target = n * 1_000_000;
    const hit = milestones.find((m) => m.milestone === target);
    trophies.push({
      id: `net_profit_${n}m`,
      title: n === 10 ? "Exodus" : `${n}M Banner`,
      description: n === 10 ? "Reach $10,000,000 of net profit. The fund closes." : `Cumulative net profit crosses ${money(target)}.`,
      tier,
      earned: !!hit,
      earnedAt: hit?.date ?? null,
      progress: pct(i.goal.netProfitToDate, target),
      detail: `${money(i.goal.netProfitToDate)} / ${money(target)}`,
    });
  }

  const fullySold = i.farms.filter((f) => f.totalLots > 0 && f.soldLots >= f.totalLots);
  const bestFarm = [...i.farms].sort((a, b) => b.pctClosed - a.pctClosed)[0];
  trophies.push({
    id: "farm_fully_sold",
    title: "Territory Conquered",
    description: "Every lot on a farm has closed.",
    tier: "gold",
    earned: fullySold.length > 0,
    earnedAt: fullySold.length > 0 ? lastCloseDate(fullySold[0]?.lots ?? []) : null,
    progress: bestFarm ? bestFarm.pctClosed : 0,
    detail: fullySold.length > 0 ? `${fullySold.map((f) => f.name).join(", ")}` : bestFarm ? `${bestFarm.name} at ${bestFarm.pctClosed}%` : "no farms",
  });

  const halfSold = i.farms.filter((f) => f.pctClosed >= 50);
  trophies.push({
    id: "farm_half_sold",
    title: "Halfway Banner",
    description: "A farm has closed at least half of its lots.",
    tier: "silver",
    earned: halfSold.length > 0,
    earnedAt: null,
    progress: bestFarm ? pct(bestFarm.pctClosed, 50) : 0,
    detail: `${halfSold.length} farm${halfSold.length === 1 ? "" : "s"} past 50%`,
  });

  const paced = sold.filter((l) => l.daysInPipeline !== null && l.reservationDate && l.closeDate);
  const fastest = [...paced].sort((a, b) => (a.daysInPipeline ?? 0) - (b.daysInPipeline ?? 0))[0];
  trophies.push({
    id: "swift_sword",
    title: "Swift Sword",
    description: "Close a lot within 30 days of reservation.",
    tier: "silver",
    earned: !!fastest && (fastest.daysInPipeline ?? Infinity) <= 30,
    earnedAt: fastest && (fastest.daysInPipeline ?? Infinity) <= 30 ? fastest.closeDate : null,
    progress: fastest ? pct(30, Math.max(30, fastest.daysInPipeline ?? 30)) : 0,
    detail: fastest ? `${fastest.name}: ${fastest.daysInPipeline} days` : "no closings with dates",
  });

  const byMonth = groupBy(closings, (e) => e.date.slice(0, 7));
  let bestMonth: { month: string; count: number; profit: number } | null = null;
  for (const [month, list] of byMonth) {
    const profit = list.reduce((s, e) => s + (e.amount ?? 0), 0);
    if (!bestMonth || list.length > bestMonth.count) bestMonth = { month, count: list.length, profit };
  }
  trophies.push({
    id: "best_month_5",
    title: "Harvest Moon",
    description: "Close five or more lots in a single month.",
    tier: "gold",
    earned: (bestMonth?.count ?? 0) >= 5,
    earnedAt: bestMonth && bestMonth.count >= 5 ? `${bestMonth.month}-01` : null,
    progress: pct(bestMonth?.count ?? 0, 5),
    detail: bestMonth ? `${bestMonth.month}: ${bestMonth.count} closings, ${money(bestMonth.profit)} net` : "no closings",
  });

  const bigCash = i.treasury.months.reduce((best, m) => (m.cashIn > (best?.cashIn ?? 0) ? m : best), null as Treasury["months"][number] | null);
  trophies.push({
    id: "treasury_100k_month",
    title: "Overflowing Coffers",
    description: "Bring $100,000 of real cash into the treasury in one month.",
    tier: "silver",
    earned: (bigCash?.cashIn ?? 0) >= 100_000,
    earnedAt: bigCash && bigCash.cashIn >= 100_000 ? `${bigCash.month}-01` : null,
    progress: pct(bigCash?.cashIn ?? 0, 100_000),
    detail: bigCash ? `${bigCash.month}: ${money(bigCash.cashIn)}` : "no cash yet",
  });

  trophies.push({
    id: "cash_1m",
    title: "War Chest",
    description: "Cumulative cash realized (down payments + note sales) passes $1,000,000.",
    tier: "gold",
    earned: i.treasury.totalCashIn >= 1_000_000,
    earnedAt: i.treasury.months.find((m) => m.cumulativeCashIn >= 1_000_000)?.month.concat("-01") ?? null,
    progress: pct(i.treasury.totalCashIn, 1_000_000),
    detail: `${money(i.treasury.totalCashIn)} / $1,000,000`,
  });

  const repaid = i.investors.filter((inv) => inv.capitalDeployed > 0 && inv.capitalOutstanding === 0);
  trophies.push({
    id: "sponsor_repaid",
    title: "Debt of Honor",
    description: "Return all capital to a sponsor.",
    tier: "gold",
    earned: repaid.length > 0,
    earnedAt: null,
    progress: (() => {
      const best = [...i.investors].filter((v) => v.capitalDeployed > 0).sort((a, b) => b.capitalReturned / b.capitalDeployed - a.capitalReturned / a.capitalDeployed)[0];
      return best ? pct(best.capitalReturned, best.capitalDeployed) : 0;
    })(),
    detail: repaid.length > 0 ? repaid.map((r) => r.name).join(", ") : `${money(i.goal.capitalOutstanding)} still outstanding`,
  });

  const noteSoldCount = i.lots.filter((l) => l.stage === "note_sold").length;
  trophies.push({
    id: "ten_notes",
    title: "Ten Scrolls",
    description: "Sell ten promissory notes.",
    tier: "silver",
    earned: noteSoldCount >= 10,
    earnedAt: noteSales[9]?.date ?? null,
    progress: pct(noteSoldCount, 10),
    detail: `${noteSoldCount} / 10`,
  });

  trophies.push({
    id: "fifty_lots",
    title: "Half a Hundred",
    description: "Close fifty lots.",
    tier: "gold",
    earned: sold.length >= 50,
    earnedAt: closings[49]?.date ?? null,
    progress: pct(sold.length, 50),
    detail: `${sold.length} / 50`,
  });

  trophies.push({
    id: "hundred_lots",
    title: "Centurion",
    description: "Close one hundred lots.",
    tier: "legendary",
    earned: sold.length >= 100,
    earnedAt: closings[99]?.date ?? null,
    progress: pct(sold.length, 100),
    detail: `${sold.length} / 100`,
  });

  const farmCount = i.farms.length;
  trophies.push({
    id: "nine_realms",
    title: "Nine Realms",
    description: "Hold nine subdivided farms.",
    tier: "silver",
    earned: farmCount >= 9,
    earnedAt: farmCount >= 9 ? i.farms[8]?.fundingDate ?? null : null,
    progress: pct(farmCount, 9),
    detail: `${farmCount} farms`,
  });

  const bestLot = [...sold].sort((a, b) => (b.netProfit ?? 0) - (a.netProfit ?? 0))[0];
  trophies.push({
    id: "golden_lot",
    title: "Golden Acre",
    description: "Net more than $75,000 on a single lot.",
    tier: "gold",
    earned: (bestLot?.netProfit ?? 0) >= 75_000,
    earnedAt: bestLot && (bestLot.netProfit ?? 0) >= 75_000 ? bestLot.closeDate : null,
    progress: pct(bestLot?.netProfit ?? 0, 75_000),
    detail: bestLot ? `${bestLot.name}: ${money(bestLot.netProfit ?? 0)}` : "no closings",
  });

  trophies.push({
    id: "pace_keeper",
    title: "Pace Keeper",
    description: "Current pace is enough to hit the deadline.",
    tier: "legendary",
    earned: i.goal.onTrack === true,
    earnedAt: null,
    progress:
      i.goal.requiredLotsPerMonthToHitDeadline && i.goal.requiredLotsPerMonthToHitDeadline > 0
        ? pct(i.goal.closedLotsPerMonth, i.goal.requiredLotsPerMonthToHitDeadline)
        : 0,
    detail: `${i.goal.closedLotsPerMonth} / ${i.goal.requiredLotsPerMonthToHitDeadline ?? "?"} lots per month`,
  });

  const streakMonths = consecutiveMonthsWithClosings(closings);
  trophies.push({
    id: "streak_3",
    title: "Unbroken Chain",
    description: "Close at least one lot in three consecutive months.",
    tier: "bronze",
    earned: streakMonths >= 3,
    earnedAt: null,
    progress: pct(streakMonths, 3),
    detail: `${streakMonths} consecutive month${streakMonths === 1 ? "" : "s"}`,
  });

  if (i.streaks) {
    const s = i.streaks;
    trophies.push({
      id: "streak_weeks_3",
      title: "Week After Week",
      description: "Close at least one lot in three consecutive weeks.",
      tier: "silver",
      earned: s.bestWeeks >= 3,
      earnedAt: s.bestWeeks >= 3 ? s.bestWeeksEndedOn : null,
      progress: pct(s.bestWeeks, 3),
      detail: `best ${s.bestWeeks} week${s.bestWeeks === 1 ? "" : "s"} · current ${s.currentWeeks}`,
    });
    trophies.push({
      id: "streak_weeks_6",
      title: "Relentless",
      description: "Six consecutive weeks with a closing.",
      tier: "gold",
      earned: s.bestWeeks >= 6,
      earnedAt: s.bestWeeks >= 6 ? s.bestWeeksEndedOn : null,
      progress: pct(s.bestWeeks, 6),
      detail: `best ${s.bestWeeks} weeks`,
    });
    trophies.push({
      id: "busy_week_3",
      title: "Harvest Week",
      description: "Three closings inside a single week.",
      tier: "silver",
      earned: (s.bestWeek?.count ?? 0) >= 3,
      earnedAt: (s.bestWeek?.count ?? 0) >= 3 ? s.bestWeek?.weekStart ?? null : null,
      progress: pct(s.bestWeek?.count ?? 0, 3),
      detail: s.bestWeek ? `${s.bestWeek.count} in week ${s.bestWeek.week}` : "no closings yet",
    });
  }

  if (i.reservationStreaks) {
    const r = i.reservationStreaks;
    trophies.push({
      id: "pledge_streak_3",
      title: "Steady Pledges",
      description: "Take at least one reservation in three consecutive months.",
      tier: "bronze",
      earned: r.bestMonths >= 3,
      earnedAt: null,
      progress: pct(r.bestMonths, 3),
      detail: `best ${r.bestMonths} consecutive month${r.bestMonths === 1 ? "" : "s"} · current ${r.currentMonths}`,
    });
    trophies.push({
      id: "pledge_streak_weeks_3",
      title: "Pledge After Pledge",
      description: "Take at least one reservation in three consecutive weeks.",
      tier: "silver",
      earned: r.bestWeeks >= 3,
      earnedAt: r.bestWeeks >= 3 ? r.bestWeeksEndedOn : null,
      progress: pct(r.bestWeeks, 3),
      detail: `best ${r.bestWeeks} week${r.bestWeeks === 1 ? "" : "s"} · current ${r.currentWeeks}`,
    });
    trophies.push({
      id: "pledge_streak_weeks_6",
      title: "The Long Line",
      description: "Six consecutive weeks with a reservation.",
      tier: "gold",
      earned: r.bestWeeks >= 6,
      earnedAt: r.bestWeeks >= 6 ? r.bestWeeksEndedOn : null,
      progress: pct(r.bestWeeks, 6),
      detail: `best ${r.bestWeeks} weeks`,
    });
    trophies.push({
      id: "busy_pledge_week_3",
      title: "Market Day",
      description: "Three reservations inside a single week.",
      tier: "silver",
      earned: (r.bestWeek?.count ?? 0) >= 3,
      earnedAt: (r.bestWeek?.count ?? 0) >= 3 ? r.bestWeek?.weekStart ?? null : null,
      progress: pct(r.bestWeek?.count ?? 0, 3),
      detail: r.bestWeek ? `${r.bestWeek.count} in week ${r.bestWeek.week}` : "no reservations yet",
    });
  }

  if (i.liberation) {
    const freed = i.liberation.freedHostages;
    const captiveBest = [...i.liberation.hostages].sort((a, b) => b.pctReturned - a.pctReturned)[0];
    trophies.push({
      id: "first_liberation",
      title: "Chains Broken",
      description: "Return 100% of a sponsor's capital on one farm.",
      tier: "gold",
      earned: freed.length > 0,
      earnedAt: freed.map((h) => h.freedAt ?? "").filter(Boolean).sort()[0] ?? null,
      progress: freed.length > 0 ? 100 : captiveBest?.pctReturned ?? 0,
      detail: freed.length > 0 ? freed.map((h) => `${h.investorName} · ${h.farmName}`).join(", ") : captiveBest ? `${captiveBest.farmName} at ${captiveBest.pctReturned}%` : "no sponsor capital",
    });
    trophies.push({
      id: "all_free",
      title: "No Hostages",
      description: "Every sponsor position fully repaid.",
      tier: "legendary",
      earned: i.liberation.hostages.length > 0 && i.liberation.captiveHostages.length === 0,
      earnedAt: null,
      progress: i.liberation.pctReturned,
      detail: `${freed.length} / ${i.liberation.hostages.length} positions freed`,
    });
  }

  return trophies.map((t) => ({ ...t, rarity: RARITY_BY_TIER[t.tier] }));
}

function lastCloseDate(lots: Lot[]): string | null {
  return lots.map((l) => l.closeDate).filter((d): d is string => !!d).sort().at(-1) ?? null;
}

function consecutiveMonthsWithClosings(closings: RealmEvent[]): number {
  const months = new Set(closings.map((e) => e.date.slice(0, 7)));
  if (months.size === 0) return 0;
  const sorted = [...months].sort();
  let best = 1;
  let run = 1;
  for (let idx = 1; idx < sorted.length; idx++) {
    const prev = parseDate(`${sorted[idx - 1]}-01`);
    const cur = parseDate(`${sorted[idx]}-01`);
    if (!prev || !cur) continue;
    const next = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1));
    if (monthKey(next) === monthKey(cur)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}
