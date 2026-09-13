import type { RealmEvent } from "./events";
import { cancelledFileCaseId, isCancelledPledge } from "./events";
import type { ExpectedLot } from "./expected";
import type { Lot } from "./lot";
import type { LotOxygen, ProvisionalOxygen } from "./oxygen";
import { daysBetween, parseDate } from "./dates";

/**
 * NARRATED CHRONICLE (Phase 2 §7) — one line of medieval-chronicle prose per real event, from
 * templates in code. No external API; every number comes from the row that produced the event.
 */
export interface NarrativeContext {
  lotsById: Map<string, Lot>;
  oxygenByLot?: Map<string, LotOxygen>;
  /** Provisional days per live reservation (oxygen.ts). */
  provisionalByLot?: Map<string, ProvisionalOxygen>;
  /** Expected close per live reservation (expected.ts). */
  expectedByLot?: Map<string, ExpectedLot>;
  /** farm name → deal type, to tell sponsor gold from the realm's own. */
  farmDealTypeByName?: Map<string, string | null>;
  /** Year that needs no mention in dates (usually the current one). */
  currentYear?: number;
  /** Today (ISO), to call an expected close overdue. */
  asOf?: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "May 30" for the current year, "May 30, 2025" otherwise. */
export function proseDate(iso: string, currentYear?: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const month = MONTHS[m - 1] ?? iso.slice(5, 7);
  return currentYear !== undefined && y === currentYear ? `${month} ${d}` : `${month} ${d}, ${y}`;
}

export function proseMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "an undisclosed sum";
  const abs = Math.abs(Math.round(n));
  return `${n < 0 ? "−" : ""}$${abs.toLocaleString("en-US")}`;
}

function lotPhrase(lot: Lot | undefined, fallbackLot: string | null, fallbackFarm: string | null): string {
  if (lot) return `Lot ${lot.lotNumber ?? "?"} of ${lot.farmName}`;
  if (fallbackLot) return fallbackLot;
  return fallbackFarm ? `a lot of ${fallbackFarm}` : "a lot";
}

function daysGainedSentence(o: LotOxygen | undefined): string {
  if (!o) return "";
  if (o.daysGained > 0) return ` The realm gained ${o.daysGained} ${o.daysGained === 1 ? "day" : "days"}.`;
  if (o.daysGained < 0) return ` The realm lost ${Math.abs(o.daysGained)} ${o.daysGained === -1 ? "day" : "days"}.`;
  return " The exit date did not move.";
}

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** "Rocío's" (first name only, the full name was just spoken) — or "the" when the scribes have no name. */
function possessive(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${first}'s` : "the";
}

/** What a live reservation promises: its expected close (or how late it is) and its provisional days. */
function expectedSentence(x: ExpectedLot | undefined, p: ProvisionalOxygen | undefined, ctx: NarrativeContext): string {
  const parts: string[] = [];
  if (x?.expectedCloseDate) {
    const late = ctx.asOf && x.expectedCloseDate < ctx.asOf ? daysBetween(parseDate(x.expectedCloseDate) as Date, parseDate(ctx.asOf) as Date) : 0;
    parts.push(
      late > 0
        ? `the closing was expected around ${proseDate(x.expectedCloseDate, ctx.currentYear)} and is ${days(late)} late`
        : `the closing is expected around ${proseDate(x.expectedCloseDate, ctx.currentYear)}`,
    );
  }
  if (p && p.provisionalDays > 0) parts.push(`${p.provisionalDays} provisional ${p.provisionalDays === 1 ? "day" : "days"} gained`);
  return parts.length > 0 ? ` — ${parts.join(", ")}` : "";
}

export function narrate(e: RealmEvent, ctx: NarrativeContext): string {
  const when = proseDate(e.date, ctx.currentYear);
  const lot = e.propertyId ? ctx.lotsById.get(e.propertyId) : undefined;
  const cancelledCase = lot && cancelledFileCaseId(e) ? lot.cancellations.find((c) => c.fileCaseId === cancelledFileCaseId(e)) : undefined;
  const buyerName = cancelledCase ? cancelledCase.buyerName : lot?.buyerName ?? null;
  const buyerIsTest = cancelledCase ? cancelledCase.buyerIsTestClient : lot?.buyerIsTestClient ?? false;
  const who = buyerName ?? (buyerIsTest ? "a buyer whose name the scribes withhold" : "a buyer");
  const where = lotPhrase(lot, e.lotName, e.farmName);

  switch (e.kind) {
    case "farm_acquired": {
      const own = (e.farmName ? ctx.farmDealTypeByName?.get(e.farmName) : null) === "own_capital";
      const gold = own ? "of its own gold" : "of sponsor gold";
      return e.future
        ? `On ${when}, the realm will claim the lands of ${e.farmName ?? "a new farm"}${e.amount ? `, ${proseMoney(e.amount)} ${gold} pledged` : ""}.`
        : `On ${when}, the realm claimed the lands of ${e.farmName ?? "a new farm"}${e.amount ? ` with ${proseMoney(e.amount)} ${gold}` : ""}.`;
    }
    case "reservation": {
      const pledge = `On ${when}, ${who} pledged for ${where}${e.amount ? ` at ${proseMoney(e.amount)}` : ""}`;
      if (isCancelledPledge(e)) return `${pledge}; the pledge was later withdrawn.`;
      if (lot?.stage !== "reserved") return `${pledge}.`;
      return `${pledge}${expectedSentence(e.propertyId ? ctx.expectedByLot?.get(e.propertyId) : undefined, e.propertyId ? ctx.provisionalByLot?.get(e.propertyId) : undefined, ctx)}.`;
    }
    case "cancellation": {
      const reserved = parseDate(cancelledCase?.reservationDate);
      const cancelled = parseDate(e.date);
      const held = reserved && cancelled ? daysBetween(reserved, cancelled) : null;
      return `On ${when}, ${who} withdrew the pledge for ${where}${held !== null && held >= 0 ? ` after ${days(held)}` : ""}; the lot returned to the market and the days it promised went with it.`;
    }
    case "closing": {
      const price = lot?.salePrice ?? null;
      const cash = lot?.dealType === "cash" ? " in coin" : "";
      const oxygen = e.propertyId ? ctx.oxygenByLot?.get(e.propertyId) : undefined;
      const reserved = parseDate(lot?.reservationDate);
      const closed = parseDate(e.date);
      const waited = reserved && closed ? daysBetween(reserved, closed) : null;
      const afterPledge = waited !== null && waited >= 0 ? `, ${days(waited)} after ${possessive(lot?.buyerName)} reservation` : "";
      return `On ${when}, ${who} claimed ${where}${price !== null ? ` for ${proseMoney(price)}` : ""}${cash}${afterPledge}.${daysGainedSentence(oxygen)}`;
    }
    case "note_sale": {
      const buyer = lot?.noteBuyerName ?? "a note buyer";
      return `On ${when}, the note on ${where} was sold to ${buyer} for ${proseMoney(e.amount)}, and the gold came home.`;
    }
    case "distribution": {
      const isCapital = e.title.startsWith("Capital returned");
      const to = e.title.replace(/^(Capital returned|Profit shared) to /, "");
      return isCapital
        ? `On ${when}, ${proseMoney(e.amount)} of capital was returned to ${to}${e.farmName ? ` for ${e.farmName}` : ""}.`
        : `On ${when}, ${proseMoney(e.amount)} of the spoils was shared with ${to}${e.farmName ? ` for ${e.farmName}` : ""}.`;
    }
    case "milestone":
      return `On ${when}, the chroniclers marked ${proseMoney(e.milestone)} of net profit${e.lotName ? `, crossed with ${e.lotName}` : ""}. Bells rang.`;
    case "liberation":
      return `On ${when}, ${e.title.replace(/ freed$/, "")} was freed: every coin of ${e.farmName ?? "the farm"} repaid${e.amount ? ` (${proseMoney(e.amount)})` : ""}.`;
    default:
      return `On ${when}, ${e.title}.`;
  }
}

export function narrateAll(events: RealmEvent[], ctx: NarrativeContext): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of events) out.set(e.id, narrate(e, ctx));
  return out;
}
