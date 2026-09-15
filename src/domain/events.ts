import type { FarmAcquisitionRow, InvestorDistributionRow, InvestorRow } from "./types";
import type { Lot } from "./lot";
import { isSold } from "./lot";
import { indexBy, round2 } from "./math";
import { daysBetween, parseDate, toIsoDate } from "./dates";
import { MILESTONE_STEP } from "../config/goal";
import type { QualityLang } from "./quality_human";

export type EventKind = "farm_acquired" | "reservation" | "cancellation" | "closing" | "note_sale" | "distribution" | "milestone" | "liberation";

export interface RealmEvent {
  id: string;
  /** ISO date. */
  date: string;
  kind: EventKind;
  title: string;
  description: string;
  amount: number | null;
  farmName: string | null;
  lotName: string | null;
  propertyId: string | null;
  /** Cumulative net profit after this event (only changes on closings). */
  cumulativeNetProfit: number;
  /** Set on milestone events: which $1M line was crossed. */
  milestone: number | null;
  /** True when the event is dated after `asOf` (e.g. a farm closing scheduled next month). */
  future: boolean;
}

const KIND_ORDER: Record<EventKind, number> = {
  farm_acquired: 0,
  reservation: 1,
  cancellation: 2,
  closing: 3,
  milestone: 4,
  note_sale: 5,
  distribution: 6,
  liberation: 7,
};

/** Id of the reservation event behind a cancelled file case (the live case keeps the plain `reservation:<property>` id). */
export function cancelledPledgeEventId(propertyId: string, fileCaseId: string): string {
  return `reservation:${propertyId}:${fileCaseId}`;
}

export function cancellationEventId(fileCaseId: string): string {
  return `cancellation:${fileCaseId}`;
}

/** True for the reservation event of a file case that was later cancelled. */
export function isCancelledPledge(e: Pick<RealmEvent, "kind" | "id">): boolean {
  return e.kind === "reservation" && e.id.split(":").length === 3;
}

/** The cancelled file case a `reservation` or `cancellation` event refers to, when any. */
export function cancelledFileCaseId(e: Pick<RealmEvent, "kind" | "id">): string | null {
  if (e.kind === "cancellation") return e.id.slice("cancellation:".length) || null;
  if (isCancelledPledge(e)) return e.id.split(":")[2] ?? null;
  return null;
}

function copy(lang: QualityLang) {
  const es = lang === "es";
  return {
    aFarm: es ? "Una finca" : "A farm",
    joins: (name: string) => (es ? `${name} entra como sponsor` : `${name} joins as a sponsor`),
    lotsDeal: (lots: string | number, deal: string, investor: string | null) =>
      es
        ? `${lots} lotes · ${deal}${investor ? ` · ${investor}` : ""}`
        : `${lots} lots · ${deal}${investor ? ` · ${investor}` : ""}`,
    unknownDeal: es ? "trato desconocido" : "unknown deal",
    investor: es ? "inversionista" : "investor",
    reserved: (lot: string) => (es ? `${lot} reservado` : `${lot} reserved`),
    byBuyer: (who: string) => (es ? `por ${who}` : `by ${who}`),
    buyerWithheld: es ? "comprador omitido" : "buyer withheld",
    buyerUnknown: es ? "comprador desconocido" : "buyer unknown",
    laterCancelled: es ? " · cancelada después" : " · later cancelled",
    cancelled: (lot: string) => (es ? `Reserva de ${lot} cancelada` : `${lot} reservation cancelled`),
    withdrew: (who: string | null) =>
      who ? (es ? `${who} se retiró` : `${who} withdrew`) : es ? "el comprador se retiró" : "the buyer withdrew",
    afterDays: (n: number) => (es ? ` después de ${n} ${n === 1 ? "día" : "días"}` : ` after ${n} ${n === 1 ? "day" : "days"}`),
    closed: (lot: string) => (es ? `${lot} cerrado` : `${lot} closed`),
    dealNet: (deal: string, net: string) => (es ? `${deal} · neto ${net}` : `${deal} · net ${net}`),
    deal: es ? "trato" : "deal",
    noteSold: (lot: string) => (es ? `Pagaré de ${lot} vendido` : `${lot} note sold`),
    toBuyer: (who: string) => (es ? `a ${who}` : `to ${who}`),
    toNoteBuyer: es ? "a un comprador de pagarés" : "to a note buyer",
    capitalReturned: (who: string) => (es ? `Capital devuelto a ${who}` : `Capital returned to ${who}`),
    profitShared: (who: string) => (es ? `Utilidad compartida con ${who}` : `Profit shared to ${who}`),
    milestone: (amount: string) => (es ? `${amount} de utilidad neta al cierre` : `${amount} of net profit at closing`),
    crossedWith: (lot: string) => (es ? `Cruzado con ${lot}` : `Crossed with ${lot}`),
    aClosing: es ? "un cierre" : "a closing",
    freed: (who: string) => (es ? `${who}: capital devuelto` : `${who}: capital returned`),
    repaidInFull: (farm: string, days: number | null) =>
      es
        ? `${farm} reembolsada por completo${days !== null ? ` después de ${days} días` : ""}`
        : `${farm} repaid in full${days !== null ? ` after ${days} days` : ""}`,
  };
}

/**
 * Every real event derived from the tables, oldest → newest, with cumulative
 * net profit and a synthetic `milestone` event every time it crosses $1M.
 */
export function computeEvents(
  lots: Lot[],
  farms: FarmAcquisitionRow[],
  distributions: InvestorDistributionRow[],
  investors: InvestorRow[],
  asOf: Date,
  milestoneStep = MILESTONE_STEP,
  lang: QualityLang = "en",
): RealmEvent[] {
  const t = copy(lang);
  const investorById = indexBy(investors, (i) => i.id);
  const farmById = indexBy(farms, (f) => f.id);
  const asOfIso = toIsoDate(asOf);
  const raw: Omit<RealmEvent, "cumulativeNetProfit" | "milestone" | "future">[] = [];

  for (const farm of farms) {
    const date = farm.funding_date ?? farm.closing_date;
    if (!date) continue;
    const name = farm.farm_name ?? t.aFarm;
    raw.push({
      id: `farm:${farm.id}`,
      date,
      kind: "farm_acquired",
      title: t.joins(name),
      description: t.lotsDeal(
        farm.total_lots ?? "?",
        farm.deal_type ?? t.unknownDeal,
        farm.investor_id ? (investorById.get(farm.investor_id)?.name ?? t.investor) : null,
      ),
      amount: farm.investor_capital,
      farmName: farm.farm_name,
      lotName: null,
      propertyId: null,
    });
  }

  for (const lot of lots) {
    if (lot.reservationDate) {
      raw.push({
        id: `reservation:${lot.propertyId}`,
        date: lot.reservationDate,
        kind: "reservation",
        title: t.reserved(lot.name),
        description: lot.buyerName ? t.byBuyer(lot.buyerName) : t.buyerWithheld,
        amount: lot.salePrice,
        farmName: lot.farmName,
        lotName: lot.name,
        propertyId: lot.propertyId,
      });
    }
    for (const c of lot.cancellations) {
      const who = c.buyerName ?? (c.buyerIsTestClient ? t.buyerWithheld : null);
      if (c.reservationDate) {
        raw.push({
          id: cancelledPledgeEventId(lot.propertyId, c.fileCaseId),
          date: c.reservationDate,
          kind: "reservation",
          title: t.reserved(lot.name),
          description: `${who ? t.byBuyer(who) : t.buyerUnknown}${t.laterCancelled}`,
          amount: c.salePrice,
          farmName: lot.farmName,
          lotName: lot.name,
          propertyId: lot.propertyId,
        });
      }
      if (c.cancelledOn) {
        const held = c.reservationDate ? daysBetween(parseDate(c.reservationDate) as Date, parseDate(c.cancelledOn) as Date) : null;
        raw.push({
          id: cancellationEventId(c.fileCaseId),
          date: c.cancelledOn,
          kind: "cancellation",
          title: t.cancelled(lot.name),
          description: `${t.withdrew(who)}${held !== null && held >= 0 ? t.afterDays(held) : ""}`,
          amount: c.salePrice,
          farmName: lot.farmName,
          lotName: lot.name,
          propertyId: lot.propertyId,
        });
      }
    }
    if (isSold(lot) && lot.closeDate) {
      raw.push({
        id: `closing:${lot.propertyId}`,
        date: lot.closeDate,
        kind: "closing",
        title: t.closed(lot.name),
        description: t.dealNet(lot.dealType ?? t.deal, money(lot.netProfit)),
        amount: lot.netProfit,
        farmName: lot.farmName,
        lotName: lot.name,
        propertyId: lot.propertyId,
      });
    }
    if (lot.noteSaleDate) {
      raw.push({
        id: `note_sale:${lot.noteSaleId ?? lot.propertyId}`,
        date: lot.noteSaleDate,
        kind: "note_sale",
        title: t.noteSold(lot.name),
        description: lot.noteBuyerName ? t.toBuyer(lot.noteBuyerName) : t.toNoteBuyer,
        amount: lot.noteSalePrice,
        farmName: lot.farmName,
        lotName: lot.name,
        propertyId: lot.propertyId,
      });
    }
  }

  for (const d of distributions) {
    if (!d.distribution_date) continue;
    const farm = d.farm_acquisition_id ? farmById.get(d.farm_acquisition_id) : undefined;
    const investor = d.investor_id ? investorById.get(d.investor_id) : undefined;
    const who = investor?.name ?? t.investor;
    raw.push({
      id: `distribution:${d.id}`,
      date: d.distribution_date,
      kind: "distribution",
      title: d.kind === "capital_return" ? t.capitalReturned(who) : t.profitShared(who),
      description: d.notes ?? farm?.farm_name ?? "",
      amount: d.amount,
      farmName: farm?.farm_name ?? null,
      lotName: null,
      propertyId: null,
    });
  }

  raw.sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id));

  const out: RealmEvent[] = [];
  let cumulative = 0;
  let nextMilestone = milestoneStep;
  for (const e of raw) {
    const future = e.date > asOfIso;
    if (e.kind === "closing" && !future) cumulative = round2(cumulative + (e.amount ?? 0));
    out.push({ ...e, cumulativeNetProfit: cumulative, milestone: null, future });
    while (cumulative >= nextMilestone) {
      out.push({
        id: `milestone:${nextMilestone}`,
        date: e.date,
        kind: "milestone",
        title: t.milestone(money(nextMilestone)),
        description: t.crossedWith(e.lotName ?? t.aClosing),
        amount: nextMilestone,
        farmName: e.farmName,
        lotName: e.lotName,
        propertyId: e.propertyId,
        cumulativeNetProfit: cumulative,
        milestone: nextMilestone,
        future,
      });
      nextMilestone += milestoneStep;
    }
  }
  return out;
}

/**
 * Inserts one `liberation` event per fully repaid sponsor position (Phase 2 §3), keeping the
 * chronological order and the running cumulative net profit of the surrounding events.
 */
export function withLiberationEvents(
  events: RealmEvent[],
  moments: { id: string; date: string; hostage: { investorName: string; farmName: string; farmId: string; capital: number; daysHeld: number | null } }[],
  asOf: Date,
  lang: QualityLang = "en",
): RealmEvent[] {
  if (moments.length === 0) return events;
  const t = copy(lang);
  const asOfIso = toIsoDate(asOf);
  const extra: RealmEvent[] = moments.map((m) => ({
    id: m.id,
    date: m.date,
    kind: "liberation",
    title: t.freed(m.hostage.investorName),
    description: t.repaidInFull(m.hostage.farmName, m.hostage.daysHeld),
    amount: m.hostage.capital,
    farmName: m.hostage.farmName,
    lotName: null,
    propertyId: null,
    cumulativeNetProfit: 0,
    milestone: null,
    future: m.date > asOfIso,
  }));
  // Insert after every existing event of the same date so milestones keep their place right
  // behind the closing that crossed them; only the liberation rows are new.
  const merged = [...events];
  for (const ev of extra.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    let idx = merged.findIndex((e) => e.date > ev.date);
    if (idx === -1) idx = merged.length;
    const prev = merged[idx - 1];
    merged.splice(idx, 0, { ...ev, cumulativeNetProfit: prev?.cumulativeNetProfit ?? 0 });
  }
  return merged;
}

/** Newest first (past events only), optionally limited to some kinds. */
export function latestEvents(events: RealmEvent[], limit?: number, kinds?: EventKind[]): RealmEvent[] {
  const filtered = events.filter((e) => !e.future && (!kinds || kinds.includes(e.kind)));
  const reversed = [...filtered].reverse();
  return limit ? reversed.slice(0, limit) : reversed;
}

function money(n: number | null): string {
  if (n === null) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
