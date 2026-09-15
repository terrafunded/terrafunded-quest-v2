import type { RealmEvent } from "./events";
import { cancelledFileCaseId, isCancelledPledge } from "./events";
import type { ExpectedLot } from "./expected";
import type { Lot } from "./lot";
import type { LotOxygen, ProvisionalOxygen } from "./oxygen";
import { daysBetween, parseDate } from "./dates";
import type { QualityLang } from "./quality_human";

/**
 * NARRATED CHRONICLE (Phase 2 §7) — one line of medieval-chronicle prose per real event, from
 * templates in code. No external API; every number comes from the row that produced the event.
 */
export interface NarrativeContext {
  lotsById: Map<string, Lot>;
  oxygenByLot?: Map<string, LotOxygen>;
  provisionalByLot?: Map<string, ProvisionalOxygen>;
  expectedByLot?: Map<string, ExpectedLot>;
  farmDealTypeByName?: Map<string, string | null>;
  currentYear?: number;
  asOf?: string;
  /** UI language for chronicle prose. Defaults to English so fixture tests stay green. */
  lang?: QualityLang;
}

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function proseDate(iso: string, currentYear?: number, lang: QualityLang = "en"): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const months = lang === "es" ? MONTHS_ES : MONTHS_EN;
  const month = months[m - 1] ?? iso.slice(5, 7);
  if (lang === "es") {
    return currentYear !== undefined && y === currentYear ? `${d} de ${month}` : `${d} de ${month} de ${y}`;
  }
  return currentYear !== undefined && y === currentYear ? `${month} ${d}` : `${month} ${d}, ${y}`;
}

export function proseMoney(n: number | null | undefined, lang: QualityLang = "en"): string {
  if (n === null || n === undefined || Number.isNaN(n)) return lang === "es" ? "una suma no revelada" : "an undisclosed sum";
  const abs = Math.abs(Math.round(n));
  return `${n < 0 ? "−" : ""}$${abs.toLocaleString("en-US")}`;
}

function lotPhrase(lot: Lot | undefined, fallbackLot: string | null, fallbackFarm: string | null, lang: QualityLang): string {
  if (lot) return lang === "es" ? `el Lote ${lot.lotNumber ?? "?"} de ${lot.farmName}` : `Lot ${lot.lotNumber ?? "?"} of ${lot.farmName}`;
  if (fallbackLot) return fallbackLot;
  if (fallbackFarm) return lang === "es" ? `un lote de ${fallbackFarm}` : `a lot of ${fallbackFarm}`;
  return lang === "es" ? "un lote" : "a lot";
}

function daysGainedSentence(o: LotOxygen | undefined, lang: QualityLang): string {
  if (!o) return "";
  if (lang === "es") {
    if (o.daysGained > 0) return ` El reino ganó ${o.daysGained} ${o.daysGained === 1 ? "día" : "días"}.`;
    if (o.daysGained < 0) return ` El reino perdió ${Math.abs(o.daysGained)} ${o.daysGained === -1 ? "día" : "días"}.`;
    return " La fecha de salida no se movió.";
  }
  if (o.daysGained > 0) return ` The realm gained ${o.daysGained} ${o.daysGained === 1 ? "day" : "days"}.`;
  if (o.daysGained < 0) return ` The realm lost ${Math.abs(o.daysGained)} ${o.daysGained === -1 ? "day" : "days"}.`;
  return " The exit date did not move.";
}

const days = (n: number, lang: QualityLang) => (lang === "es" ? `${n} ${n === 1 ? "día" : "días"}` : `${n} ${n === 1 ? "day" : "days"}`);

function possessive(name: string | null | undefined, lang: QualityLang): string {
  const first = name?.trim().split(/\s+/)[0];
  if (lang === "es") return first ? `de ${first}` : "de la";
  return first ? `${first}'s` : "the";
}

function expectedSentence(x: ExpectedLot | undefined, p: ProvisionalOxygen | undefined, ctx: NarrativeContext): string {
  const lang = ctx.lang ?? "en";
  const parts: string[] = [];
  if (x?.expectedCloseDate) {
    const late = ctx.asOf && x.expectedCloseDate < ctx.asOf ? daysBetween(parseDate(x.expectedCloseDate) as Date, parseDate(ctx.asOf) as Date) : 0;
    parts.push(
      late > 0
        ? lang === "es"
          ? `el cierre se esperaba alrededor del ${proseDate(x.expectedCloseDate, ctx.currentYear, lang)} y lleva ${days(late, lang)} de retraso`
          : `the closing was expected around ${proseDate(x.expectedCloseDate, ctx.currentYear, lang)} and is ${days(late, lang)} late`
        : lang === "es"
          ? `el cierre se espera alrededor del ${proseDate(x.expectedCloseDate, ctx.currentYear, lang)}`
          : `the closing is expected around ${proseDate(x.expectedCloseDate, ctx.currentYear, lang)}`,
    );
  }
  if (p && p.provisionalDays > 0) {
    parts.push(
      lang === "es"
        ? `${p.provisionalDays} ${p.provisionalDays === 1 ? "día" : "días"} provisionales ganados`
        : `${p.provisionalDays} provisional ${p.provisionalDays === 1 ? "day" : "days"} gained`,
    );
  }
  return parts.length > 0 ? ` — ${parts.join(", ")}` : "";
}

export function narrate(e: RealmEvent, ctx: NarrativeContext): string {
  const lang = ctx.lang ?? "en";
  const when = proseDate(e.date, ctx.currentYear, lang);
  const lot = e.propertyId ? ctx.lotsById.get(e.propertyId) : undefined;
  const cancelledCase = lot && cancelledFileCaseId(e) ? lot.cancellations.find((c) => c.fileCaseId === cancelledFileCaseId(e)) : undefined;
  const buyerName = cancelledCase ? cancelledCase.buyerName : lot?.buyerName ?? null;
  const buyerIsTest = cancelledCase ? cancelledCase.buyerIsTestClient : lot?.buyerIsTestClient ?? false;
  const who =
    buyerName ??
    (buyerIsTest
      ? lang === "es"
        ? "un comprador cuyo nombre los escribas ocultan"
        : "a buyer whose name the scribes withhold"
      : lang === "es"
        ? "un comprador"
        : "a buyer");
  const where = lotPhrase(lot, e.lotName, e.farmName, lang);
  const on = lang === "es" ? "El" : "On";

  switch (e.kind) {
    case "farm_acquired": {
      const own = (e.farmName ? ctx.farmDealTypeByName?.get(e.farmName) : null) === "own_capital";
      const gold = lang === "es" ? (own ? "de su propio oro" : "de oro de sponsors") : own ? "of its own gold" : "of sponsor gold";
      if (lang === "es") {
        return e.future
          ? `${on} ${when}, el reino reclamará las tierras de ${e.farmName ?? "una finca nueva"}${e.amount ? `, ${proseMoney(e.amount, lang)} ${gold} comprometidos` : ""}.`
          : `${on} ${when}, el reino reclamó las tierras de ${e.farmName ?? "una finca nueva"}${e.amount ? ` con ${proseMoney(e.amount, lang)} ${gold}` : ""}.`;
      }
      return e.future
        ? `On ${when}, the realm will claim the lands of ${e.farmName ?? "a new farm"}${e.amount ? `, ${proseMoney(e.amount)} ${gold} pledged` : ""}.`
        : `On ${when}, the realm claimed the lands of ${e.farmName ?? "a new farm"}${e.amount ? ` with ${proseMoney(e.amount)} ${gold}` : ""}.`;
    }
    case "reservation": {
      if (lang === "es") {
        const pledge = `${on} ${when}, ${who} se comprometió por ${where}${e.amount ? ` a ${proseMoney(e.amount, lang)}` : ""}`;
        if (isCancelledPledge(e)) return `${pledge}; el compromiso fue retirado después.`;
        if (lot?.stage !== "reserved") return `${pledge}.`;
        return `${pledge}${expectedSentence(e.propertyId ? ctx.expectedByLot?.get(e.propertyId) : undefined, e.propertyId ? ctx.provisionalByLot?.get(e.propertyId) : undefined, ctx)}.`;
      }
      const pledge = `On ${when}, ${who} pledged for ${where}${e.amount ? ` at ${proseMoney(e.amount)}` : ""}`;
      if (isCancelledPledge(e)) return `${pledge}; the pledge was later withdrawn.`;
      if (lot?.stage !== "reserved") return `${pledge}.`;
      return `${pledge}${expectedSentence(e.propertyId ? ctx.expectedByLot?.get(e.propertyId) : undefined, e.propertyId ? ctx.provisionalByLot?.get(e.propertyId) : undefined, ctx)}.`;
    }
    case "cancellation": {
      const reserved = parseDate(cancelledCase?.reservationDate);
      const cancelled = parseDate(e.date);
      const held = reserved && cancelled ? daysBetween(reserved, cancelled) : null;
      if (lang === "es") {
        return `${on} ${when}, ${who} retiró el compromiso por ${where}${held !== null && held >= 0 ? ` después de ${days(held, lang)}` : ""}; el lote volvió al mercado y los días que prometía se fueron con él.`;
      }
      return `On ${when}, ${who} withdrew the pledge for ${where}${held !== null && held >= 0 ? ` after ${days(held, lang)}` : ""}; the lot returned to the market and the days it promised went with it.`;
    }
    case "closing": {
      const price = lot?.salePrice ?? null;
      const cash = lot?.dealType === "cash" ? (lang === "es" ? " en moneda" : " in coin") : "";
      const oxygen = e.propertyId ? ctx.oxygenByLot?.get(e.propertyId) : undefined;
      const reserved = parseDate(lot?.reservationDate);
      const closed = parseDate(e.date);
      const waited = reserved && closed ? daysBetween(reserved, closed) : null;
      if (lang === "es") {
        const afterPledge = waited !== null && waited >= 0 ? `, ${days(waited, lang)} después de la reserva ${possessive(lot?.buyerName, lang)}` : "";
        return `${on} ${when}, ${who} reclamó ${where}${price !== null ? ` por ${proseMoney(price, lang)}` : ""}${cash}${afterPledge}.${daysGainedSentence(oxygen, lang)}`;
      }
      const afterPledge = waited !== null && waited >= 0 ? `, ${days(waited, lang)} after ${possessive(lot?.buyerName, lang)} reservation` : "";
      return `On ${when}, ${who} claimed ${where}${price !== null ? ` for ${proseMoney(price)}` : ""}${cash}${afterPledge}.${daysGainedSentence(oxygen, lang)}`;
    }
    case "note_sale": {
      const buyer = lot?.noteBuyerName ?? (lang === "es" ? "un comprador de pagarés" : "a note buyer");
      if (lang === "es") {
        return `${on} ${when}, el pagaré de ${where} se vendió a ${buyer} por ${proseMoney(e.amount, lang)}, y el oro volvió a casa.`;
      }
      return `On ${when}, the note on ${where} was sold to ${buyer} for ${proseMoney(e.amount)}, and the gold came home.`;
    }
    case "distribution": {
      const isCapital = e.title.startsWith("Capital returned") || e.title.startsWith("Capital devuelto");
      const to = e.title.replace(/^(Capital returned|Profit shared|Capital devuelto|Utilidad compartida) to |^(Capital returned|Profit shared|Capital devuelto|Utilidad compartida) a /, "");
      if (lang === "es") {
        return isCapital
          ? `${on} ${when}, se devolvieron ${proseMoney(e.amount, lang)} de capital a ${to}${e.farmName ? ` por ${e.farmName}` : ""}.`
          : `${on} ${when}, se compartieron ${proseMoney(e.amount, lang)} del botín con ${to}${e.farmName ? ` por ${e.farmName}` : ""}.`;
      }
      return isCapital
        ? `On ${when}, ${proseMoney(e.amount)} of capital was returned to ${to}${e.farmName ? ` for ${e.farmName}` : ""}.`
        : `On ${when}, ${proseMoney(e.amount)} of the spoils was shared with ${to}${e.farmName ? ` for ${e.farmName}` : ""}.`;
    }
    case "milestone":
      if (lang === "es") {
        return `${on} ${when}, los cronistas marcaron ${proseMoney(e.milestone, lang)} de utilidad neta${e.lotName ? `, cruzados con ${e.lotName}` : ""}. Sonaron las campanas.`;
      }
      return `On ${when}, the chroniclers marked ${proseMoney(e.milestone)} of net profit${e.lotName ? `, crossed with ${e.lotName}` : ""}. Bells rang.`;
    case "liberation":
      if (lang === "es") {
        return `${on} ${when}, ${e.title.replace(/ freed$/, "").replace(/ liberad[oa]$/, "")} quedó libre: cada moneda de ${e.farmName ?? "la finca"} reembolsada${e.amount ? ` (${proseMoney(e.amount, lang)})` : ""}.`;
      }
      return `On ${when}, ${e.title.replace(/ freed$/, "")} was freed: every coin of ${e.farmName ?? "the farm"} repaid${e.amount ? ` (${proseMoney(e.amount)})` : ""}.`;
    default:
      return lang === "es" ? `${on} ${when}, ${e.title}.` : `On ${when}, ${e.title}.`;
  }
}

export function narrateAll(events: RealmEvent[], ctx: NarrativeContext): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of events) out.set(e.id, narrate(e, ctx));
  return out;
}
