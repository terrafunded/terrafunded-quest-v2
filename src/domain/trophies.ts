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
import type { QualityLang } from "./quality_human";

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
  /** UI language for titles/descriptions. Defaults to English for tests. */
  lang?: QualityLang;
}

const pct = (value: number, target: number) => (target <= 0 ? 100 : round2(Math.max(0, Math.min(100, (value / target) * 100))));
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;


const TROPHY_COPY: Record<string, { title: Record<QualityLang, string>; description: Record<QualityLang, string> }> = {
  first_blood: { title: { en: "First sale", es: "Primera venta" }, description: { en: "Close the first lot sale.", es: "Cierra la primera venta de lote." } },
  first_note_sold: { title: { en: "First note sold", es: "Primer pagaré vendido" }, description: { en: "Sell the first promissory note for cash.", es: "Vende el primer pagaré por efectivo." } },
  net_profit_1m: { title: { en: "$1M net profit", es: "$1M de utilidad neta" }, description: { en: "Cumulative net profit crosses $1,000,000.", es: "La utilidad neta acumulada cruza $1,000,000." } },
  net_profit_2m: { title: { en: "$2M net profit", es: "$2M de utilidad neta" }, description: { en: "Cumulative net profit crosses $2,000,000.", es: "La utilidad neta acumulada cruza $2,000,000." } },
  net_profit_5m: { title: { en: "$5M net profit", es: "$5M de utilidad neta" }, description: { en: "Cumulative net profit crosses $5,000,000.", es: "La utilidad neta acumulada cruza $5,000,000." } },
  net_profit_10m: { title: { en: "Exodus", es: "Exodus" }, description: { en: "Reach $10,000,000 of net profit. The fund closes.", es: "Alcanza $10,000,000 de utilidad neta. El fondo cierra." } },
  farm_fully_sold: { title: { en: "Farm sold out", es: "Finca vendida" }, description: { en: "Every lot on a farm has closed.", es: "Cada lote de una finca ha cerrado." } },
  farm_half_sold: { title: { en: "Farm half sold", es: "Finca a la mitad" }, description: { en: "A farm has closed at least half of its lots.", es: "Una finca ha cerrado al menos la mitad de sus lotes." } },
  swift_sword: { title: { en: "Fast close", es: "Cierre rápido" }, description: { en: "Close a lot within 30 days of reservation.", es: "Cierra un lote dentro de 30 días de la reserva." } },
  best_month_5: { title: { en: "Five closings in a month", es: "Cinco cierres en un mes" }, description: { en: "Close five or more lots in a single month.", es: "Cierra cinco o más lotes en un solo mes." } },
  treasury_100k_month: { title: { en: "$100k cash in a month", es: "$100k de efectivo en un mes" }, description: { en: "Bring $100,000 of real cash in one month.", es: "Trae $100,000 de efectivo real en un mes." } },
  cash_1m: { title: { en: "$1M cash realized", es: "$1M de efectivo realizado" }, description: { en: "Cumulative cash realized (down payments + note sales) passes $1,000,000.", es: "El efectivo acumulado realizado (enganches + ventas de pagarés) supera $1,000,000." } },
  sponsor_repaid: { title: { en: "Sponsor repaid", es: "Sponsor reembolsado" }, description: { en: "Return all capital to a sponsor.", es: "Devuelve todo el capital a un sponsor." } },
  ten_notes: { title: { en: "Ten notes sold", es: "Diez pagarés vendidos" }, description: { en: "Sell ten promissory notes.", es: "Vende diez pagarés." } },
  fifty_lots: { title: { en: "Fifty lots closed", es: "Cincuenta lotes cerrados" }, description: { en: "Close fifty lots.", es: "Cierra cincuenta lotes." } },
  hundred_lots: { title: { en: "One hundred lots closed", es: "Cien lotes cerrados" }, description: { en: "Close one hundred lots.", es: "Cierra cien lotes." } },
  nine_realms: { title: { en: "Nine farms", es: "Nueve fincas" }, description: { en: "Hold nine subdivided farms.", es: "Posee nueve fincas subdivididas." } },
  golden_lot: { title: { en: "High-profit lot", es: "Lote de alta utilidad" }, description: { en: "Net more than $75,000 on a single lot.", es: "Obtén más de $75,000 netos en un solo lote." } },
  pace_keeper: { title: { en: "Pace on track", es: "Ritmo al día" }, description: { en: "Current pace is enough to hit the selected exit horizon. Changes when you switch 2027 / 2028 / 2029.", es: "El ritmo actual basta para el horizonte de salida elegido. Cambia al pasar de 2027 / 2028 / 2029." } },
  streak_3: { title: { en: "Three months of closings", es: "Tres meses de cierres" }, description: { en: "Close at least one lot in three consecutive months.", es: "Cierra al menos un lote en tres meses consecutivos." } },
  streak_weeks_3: { title: { en: "Three weeks of closings", es: "Tres semanas de cierres" }, description: { en: "Close at least one lot in three consecutive weeks.", es: "Cierra al menos un lote en tres semanas consecutivas." } },
  streak_weeks_6: { title: { en: "Six weeks of closings", es: "Seis semanas de cierres" }, description: { en: "Six consecutive weeks with a closing.", es: "Seis semanas consecutivas con un cierre." } },
  busy_week_3: { title: { en: "Three closings in a week", es: "Tres cierres en una semana" }, description: { en: "Three closings inside a single week.", es: "Tres cierres en una sola semana." } },
  pledge_streak_3: { title: { en: "Three months of reservations", es: "Tres meses de reservas" }, description: { en: "Take at least one reservation in three consecutive months.", es: "Toma al menos una reserva en tres meses consecutivos." } },
  pledge_streak_weeks_3: { title: { en: "Three weeks of reservations", es: "Tres semanas de reservas" }, description: { en: "Take at least one reservation in three consecutive weeks.", es: "Toma al menos una reserva en tres semanas consecutivas." } },
  pledge_streak_weeks_6: { title: { en: "Six weeks of reservations", es: "Seis semanas de reservas" }, description: { en: "Six consecutive weeks with a reservation.", es: "Seis semanas consecutivas con una reserva." } },
  busy_pledge_week_3: { title: { en: "Three reservations in a week", es: "Tres reservas en una semana" }, description: { en: "Three reservations inside a single week.", es: "Tres reservas en una sola semana." } },
  first_liberation: { title: { en: "First capital returned", es: "Primer capital devuelto" }, description: { en: "Return 100% of a sponsor's capital on one farm.", es: "Devuelve el 100% del capital de un sponsor en una finca." } },
  all_free: { title: { en: "All capital returned", es: "Todo el capital devuelto" }, description: { en: "Every sponsor position fully repaid.", es: "Cada posición de sponsor reembolsada por completo." } },
};

/** At least 15 achievements, every one derived from real rows. */
export function computeTrophies(i: TrophyInputs): Trophy[] {
  const lang = i.lang ?? "en";
  const es = lang === "es";
  const sold = i.lots.filter(isSold);
  const closings = i.events.filter((e) => e.kind === "closing");
  const noteSales = i.events.filter((e) => e.kind === "note_sale");
  const milestones = i.events.filter((e) => e.kind === "milestone");
  const firstAt = (list: RealmEvent[]) => list[0]?.date ?? null;

  const d = {
    closings: (n: number) => (es ? `${n} cierres` : `${n} closings`),
    notesSold: (n: number) => (es ? `${n} pagarés vendidos` : `${n} notes sold`),
    ratio: (a: string, b: string) => `${a} / ${b}`,
    noFarms: es ? "sin fincas" : "no farms",
    atPct: (name: string, pctClosed: number) => (es ? `${name} al ${pctClosed}%` : `${name} at ${pctClosed}%`),
    farmsPast50: (n: number) =>
      es ? `${n} finca${n === 1 ? "" : "s"} pasadas del 50%` : `${n} farm${n === 1 ? "" : "s"} past 50%`,
    daysOnLot: (name: string, days: number) => (es ? `${name}: ${days} días` : `${name}: ${days} days`),
    noClosingsWithDates: es ? "sin cierres con fechas" : "no closings with dates",
    monthClosings: (month: string, count: number, profit: string) =>
      es ? `${month}: ${count} cierres, ${profit} neto` : `${month}: ${count} closings, ${profit} net`,
    noClosings: es ? "sin cierres" : "no closings",
    monthCash: (month: string, amount: string) => `${month}: ${amount}`,
    noCashYet: es ? "aún sin efectivo" : "no cash yet",
    stillOutstanding: (amount: string) => (es ? `${amount} aún pendiente` : `${amount} still outstanding`),
    farms: (n: number) => (es ? `${n} fincas` : `${n} farms`),
    lotProfit: (name: string, amount: string) => `${name}: ${amount}`,
    lotsPerMonth: (a: string | number, b: string | number) =>
      es ? `${a} / ${b} lotes por mes` : `${a} / ${b} lots per month`,
    consecutiveMonths: (n: number) =>
      es ? `${n} mes${n === 1 ? "" : "es"} consecutivos` : `${n} consecutive month${n === 1 ? "" : "s"}`,
    bestWeeksCurrent: (best: number, current: number) =>
      es
        ? `mejor ${best} semana${best === 1 ? "" : "s"} · actual ${current}`
        : `best ${best} week${best === 1 ? "" : "s"} · current ${current}`,
    bestWeeks: (n: number) => (es ? `mejor ${n} semanas` : `best ${n} weeks`),
    inWeek: (count: number, week: string) => (es ? `${count} en semana ${week}` : `${count} in week ${week}`),
    noClosingsYet: es ? "aún sin cierres" : "no closings yet",
    bestMonthsCurrent: (best: number, current: number) =>
      es
        ? `mejor ${best} mes${best === 1 ? "" : "es"} consecutivos · actual ${current}`
        : `best ${best} consecutive month${best === 1 ? "" : "s"} · current ${current}`,
    noReservationsYet: es ? "aún sin reservas" : "no reservations yet",
    noSponsorCapital: es ? "sin capital de sponsors" : "no sponsor capital",
    positionsFreed: (freed: number, total: number) =>
      es ? `${freed} / ${total} posiciones con capital de vuelta` : `${freed} / ${total} positions with capital back`,
  };

  const trophies: Omit<Trophy, "rarity">[] = [];

  trophies.push({
    id: "first_blood",
    title: "First sale",
    description: "Close the first lot sale.",
    tier: "bronze",
    earned: closings.length > 0,
    earnedAt: firstAt(closings),
    progress: pct(closings.length, 1),
    detail: d.closings(closings.length),
  });

  trophies.push({
    id: "first_note_sold",
    title: "First note sold",
    description: "Sell the first promissory note for cash.",
    tier: "bronze",
    earned: noteSales.length > 0,
    earnedAt: firstAt(noteSales),
    progress: pct(noteSales.length, 1),
    detail: d.notesSold(noteSales.length),
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
      title: n === 10 ? "Exodus" : `$${n}M net profit`,
      description: n === 10 ? "Reach $10,000,000 of net profit. The fund closes." : `Cumulative net profit crosses ${money(target)}.`,
      tier,
      earned: !!hit,
      earnedAt: hit?.date ?? null,
      progress: pct(i.goal.netProfitToDate, target),
      detail: d.ratio(money(i.goal.netProfitToDate), money(target)),
    });
  }

  const fullySold = i.farms.filter((f) => f.totalLots > 0 && f.soldLots >= f.totalLots);
  const bestFarm = [...i.farms].sort((a, b) => b.pctClosed - a.pctClosed)[0];
  trophies.push({
    id: "farm_fully_sold",
    title: "Farm sold out",
    description: "Every lot on a farm has closed.",
    tier: "gold",
    earned: fullySold.length > 0,
    earnedAt: fullySold.length > 0 ? lastCloseDate(fullySold[0]?.lots ?? []) : null,
    progress: bestFarm ? bestFarm.pctClosed : 0,
    detail: fullySold.length > 0 ? `${fullySold.map((f) => f.name).join(", ")}` : bestFarm ? d.atPct(bestFarm.name, bestFarm.pctClosed) : d.noFarms,
  });

  const halfSold = i.farms.filter((f) => f.pctClosed >= 50);
  trophies.push({
    id: "farm_half_sold",
    title: "Farm half sold",
    description: "A farm has closed at least half of its lots.",
    tier: "silver",
    earned: halfSold.length > 0,
    earnedAt: null,
    progress: bestFarm ? pct(bestFarm.pctClosed, 50) : 0,
    detail: d.farmsPast50(halfSold.length),
  });

  const paced = sold.filter((l) => l.daysInPipeline !== null && l.reservationDate && l.closeDate);
  const fastest = [...paced].sort((a, b) => (a.daysInPipeline ?? 0) - (b.daysInPipeline ?? 0))[0];
  trophies.push({
    id: "swift_sword",
    title: "Fast close",
    description: "Close a lot within 30 days of reservation.",
    tier: "silver",
    earned: !!fastest && (fastest.daysInPipeline ?? Infinity) <= 30,
    earnedAt: fastest && (fastest.daysInPipeline ?? Infinity) <= 30 ? fastest.closeDate : null,
    progress: fastest ? pct(30, Math.max(30, fastest.daysInPipeline ?? 30)) : 0,
    detail: fastest ? d.daysOnLot(fastest.name, fastest.daysInPipeline ?? 0) : d.noClosingsWithDates,
  });

  const byMonth = groupBy(closings, (e) => e.date.slice(0, 7));
  let bestMonth: { month: string; count: number; profit: number } | null = null;
  for (const [month, list] of byMonth) {
    const profit = list.reduce((s, e) => s + (e.amount ?? 0), 0);
    if (!bestMonth || list.length > bestMonth.count) bestMonth = { month, count: list.length, profit };
  }
  trophies.push({
    id: "best_month_5",
    title: "Five closings in a month",
    description: "Close five or more lots in a single month.",
    tier: "gold",
    earned: (bestMonth?.count ?? 0) >= 5,
    earnedAt: bestMonth && bestMonth.count >= 5 ? `${bestMonth.month}-01` : null,
    progress: pct(bestMonth?.count ?? 0, 5),
    detail: bestMonth ? d.monthClosings(bestMonth.month, bestMonth.count, money(bestMonth.profit)) : d.noClosings,
  });

  const bigCash = i.treasury.months.reduce((best, m) => (m.cashIn > (best?.cashIn ?? 0) ? m : best), null as Treasury["months"][number] | null);
  trophies.push({
    id: "treasury_100k_month",
    title: "$100k cash in a month",
    description: "Bring $100,000 of real cash into the treasury in one month.",
    tier: "silver",
    earned: (bigCash?.cashIn ?? 0) >= 100_000,
    earnedAt: bigCash && bigCash.cashIn >= 100_000 ? `${bigCash.month}-01` : null,
    progress: pct(bigCash?.cashIn ?? 0, 100_000),
    detail: bigCash ? d.monthCash(bigCash.month, money(bigCash.cashIn)) : d.noCashYet,
  });

  trophies.push({
    id: "cash_1m",
    title: "$1M cash realized",
    description: "Cumulative cash realized (down payments + note sales) passes $1,000,000.",
    tier: "gold",
    earned: i.treasury.totalCashIn >= 1_000_000,
    earnedAt: i.treasury.months.find((m) => m.cumulativeCashIn >= 1_000_000)?.month.concat("-01") ?? null,
    progress: pct(i.treasury.totalCashIn, 1_000_000),
    detail: d.ratio(money(i.treasury.totalCashIn), "$1,000,000"),
  });

  const repaid = i.investors.filter((inv) => inv.capitalDeployed > 0 && inv.capitalOutstanding === 0);
  trophies.push({
    id: "sponsor_repaid",
    title: "Sponsor repaid",
    description: "Return all capital to a sponsor.",
    tier: "gold",
    earned: repaid.length > 0,
    earnedAt: null,
    progress: (() => {
      const best = [...i.investors].filter((v) => v.capitalDeployed > 0).sort((a, b) => b.capitalReturned / b.capitalDeployed - a.capitalReturned / a.capitalDeployed)[0];
      return best ? pct(best.capitalReturned, best.capitalDeployed) : 0;
    })(),
    detail: repaid.length > 0 ? repaid.map((r) => r.name).join(", ") : d.stillOutstanding(money(i.goal.capitalOutstanding)),
  });

  const noteSoldCount = i.lots.filter((l) => l.stage === "note_sold").length;
  trophies.push({
    id: "ten_notes",
    title: "Ten notes sold",
    description: "Sell ten promissory notes.",
    tier: "silver",
    earned: noteSoldCount >= 10,
    earnedAt: noteSales[9]?.date ?? null,
    progress: pct(noteSoldCount, 10),
    detail: d.ratio(String(noteSoldCount), "10"),
  });

  trophies.push({
    id: "fifty_lots",
    title: "Fifty lots closed",
    description: "Close fifty lots.",
    tier: "gold",
    earned: sold.length >= 50,
    earnedAt: closings[49]?.date ?? null,
    progress: pct(sold.length, 50),
    detail: d.ratio(String(sold.length), "50"),
  });

  trophies.push({
    id: "hundred_lots",
    title: "One hundred lots closed",
    description: "Close one hundred lots.",
    tier: "legendary",
    earned: sold.length >= 100,
    earnedAt: closings[99]?.date ?? null,
    progress: pct(sold.length, 100),
    detail: d.ratio(String(sold.length), "100"),
  });

  const farmCount = i.farms.length;
  trophies.push({
    id: "nine_realms",
    title: "Nine farms",
    description: "Hold nine subdivided farms.",
    tier: "silver",
    earned: farmCount >= 9,
    earnedAt: farmCount >= 9 ? i.farms[8]?.fundingDate ?? null : null,
    progress: pct(farmCount, 9),
    detail: d.farms(farmCount),
  });

  const bestLot = [...sold].sort((a, b) => (b.netProfit ?? 0) - (a.netProfit ?? 0))[0];
  trophies.push({
    id: "golden_lot",
    title: "High-profit lot",
    description: "Net more than $75,000 on a single lot.",
    tier: "gold",
    earned: (bestLot?.netProfit ?? 0) >= 75_000,
    earnedAt: bestLot && (bestLot.netProfit ?? 0) >= 75_000 ? bestLot.closeDate : null,
    progress: pct(bestLot?.netProfit ?? 0, 75_000),
    detail: bestLot ? d.lotProfit(bestLot.name, money(bestLot.netProfit ?? 0)) : d.noClosings,
  });

  trophies.push({
    id: "pace_keeper",
    title: "Pace on track",
    description: "Current pace is enough to hit the selected exit horizon. Changes when you switch 2027 / 2028 / 2029.",
    tier: "legendary",
    earned: i.goal.onTrack === true,
    earnedAt: null,
    progress:
      i.goal.requiredLotsPerMonthToHitDeadline && i.goal.requiredLotsPerMonthToHitDeadline > 0
        ? pct(i.goal.closedLotsPerMonth, i.goal.requiredLotsPerMonthToHitDeadline)
        : 0,
    detail: d.lotsPerMonth(i.goal.closedLotsPerMonth, i.goal.requiredLotsPerMonthToHitDeadline ?? "?"),
  });

  const streakMonths = consecutiveMonthsWithClosings(closings);
  trophies.push({
    id: "streak_3",
    title: "Three months of closings",
    description: "Close at least one lot in three consecutive months.",
    tier: "bronze",
    earned: streakMonths >= 3,
    earnedAt: null,
    progress: pct(streakMonths, 3),
    detail: d.consecutiveMonths(streakMonths),
  });

  if (i.streaks) {
    const s = i.streaks;
    trophies.push({
      id: "streak_weeks_3",
      title: "Three weeks of closings",
      description: "Close at least one lot in three consecutive weeks.",
      tier: "silver",
      earned: s.bestWeeks >= 3,
      earnedAt: s.bestWeeks >= 3 ? s.bestWeeksEndedOn : null,
      progress: pct(s.bestWeeks, 3),
      detail: d.bestWeeksCurrent(s.bestWeeks, s.currentWeeks),
    });
    trophies.push({
      id: "streak_weeks_6",
      title: "Six weeks of closings",
      description: "Six consecutive weeks with a closing.",
      tier: "gold",
      earned: s.bestWeeks >= 6,
      earnedAt: s.bestWeeks >= 6 ? s.bestWeeksEndedOn : null,
      progress: pct(s.bestWeeks, 6),
      detail: d.bestWeeks(s.bestWeeks),
    });
    trophies.push({
      id: "busy_week_3",
      title: "Three closings in a week",
      description: "Three closings inside a single week.",
      tier: "silver",
      earned: (s.bestWeek?.count ?? 0) >= 3,
      earnedAt: (s.bestWeek?.count ?? 0) >= 3 ? s.bestWeek?.weekStart ?? null : null,
      progress: pct(s.bestWeek?.count ?? 0, 3),
      detail: s.bestWeek ? d.inWeek(s.bestWeek.count, s.bestWeek.week) : d.noClosingsYet,
    });
  }

  if (i.reservationStreaks) {
    const r = i.reservationStreaks;
    trophies.push({
      id: "pledge_streak_3",
      title: "Three months of reservations",
      description: "Take at least one reservation in three consecutive months.",
      tier: "bronze",
      earned: r.bestMonths >= 3,
      earnedAt: null,
      progress: pct(r.bestMonths, 3),
      detail: d.bestMonthsCurrent(r.bestMonths, r.currentMonths),
    });
    trophies.push({
      id: "pledge_streak_weeks_3",
      title: "Three weeks of reservations",
      description: "Take at least one reservation in three consecutive weeks.",
      tier: "silver",
      earned: r.bestWeeks >= 3,
      earnedAt: r.bestWeeks >= 3 ? r.bestWeeksEndedOn : null,
      progress: pct(r.bestWeeks, 3),
      detail: d.bestWeeksCurrent(r.bestWeeks, r.currentWeeks),
    });
    trophies.push({
      id: "pledge_streak_weeks_6",
      title: "Six weeks of reservations",
      description: "Six consecutive weeks with a reservation.",
      tier: "gold",
      earned: r.bestWeeks >= 6,
      earnedAt: r.bestWeeks >= 6 ? r.bestWeeksEndedOn : null,
      progress: pct(r.bestWeeks, 6),
      detail: d.bestWeeks(r.bestWeeks),
    });
    trophies.push({
      id: "busy_pledge_week_3",
      title: "Three reservations in a week",
      description: "Three reservations inside a single week.",
      tier: "silver",
      earned: (r.bestWeek?.count ?? 0) >= 3,
      earnedAt: (r.bestWeek?.count ?? 0) >= 3 ? r.bestWeek?.weekStart ?? null : null,
      progress: pct(r.bestWeek?.count ?? 0, 3),
      detail: r.bestWeek ? d.inWeek(r.bestWeek.count, r.bestWeek.week) : d.noReservationsYet,
    });
  }

  if (i.liberation) {
    const freed = i.liberation.freedHostages;
    const captiveBest = [...i.liberation.hostages].sort((a, b) => b.pctReturned - a.pctReturned)[0];
    trophies.push({
      id: "first_liberation",
      title: "First capital returned",
      description: "Return 100% of a sponsor's capital on one farm.",
      tier: "gold",
      earned: freed.length > 0,
      earnedAt: freed.map((h) => h.freedAt ?? "").filter(Boolean).sort()[0] ?? null,
      progress: freed.length > 0 ? 100 : captiveBest?.pctReturned ?? 0,
      detail:
        freed.length > 0
          ? freed.map((h) => `${h.investorName} · ${h.farmName}`).join(", ")
          : captiveBest
            ? d.atPct(captiveBest.farmName, captiveBest.pctReturned)
            : d.noSponsorCapital,
    });
    trophies.push({
      id: "all_free",
      title: "All capital returned",
      description: "Every sponsor position fully repaid.",
      tier: "legendary",
      earned: i.liberation.hostages.length > 0 && i.liberation.captiveHostages.length === 0,
      earnedAt: null,
      progress: i.liberation.pctReturned,
      detail: d.positionsFreed(freed.length, i.liberation.hostages.length),
    });
  }

  return trophies.map((t) => {
    const copy = TROPHY_COPY[t.id];
    return {
      ...t,
      title: copy?.title[lang] ?? t.title,
      description: copy?.description[lang] ?? t.description,
      rarity: RARITY_BY_TIER[t.tier],
    };
  });
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
