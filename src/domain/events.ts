import type { FarmAcquisitionRow, InvestorDistributionRow, InvestorRow } from "./types";
import type { Lot } from "./lot";
import { isSold } from "./lot";
import { indexBy, round2 } from "./math";
import { toIsoDate } from "./dates";
import { MILESTONE_STEP } from "../config/goal";

export type EventKind = "farm_acquired" | "reservation" | "closing" | "note_sale" | "distribution" | "milestone";

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
  closing: 2,
  milestone: 3,
  note_sale: 4,
  distribution: 5,
};

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
): RealmEvent[] {
  const investorById = indexBy(investors, (i) => i.id);
  const farmById = indexBy(farms, (f) => f.id);
  const asOfIso = toIsoDate(asOf);
  const raw: Omit<RealmEvent, "cumulativeNetProfit" | "milestone" | "future">[] = [];

  for (const farm of farms) {
    const date = farm.funding_date ?? farm.closing_date;
    if (!date) continue;
    raw.push({
      id: `farm:${farm.id}`,
      date,
      kind: "farm_acquired",
      title: `${farm.farm_name ?? "A farm"} joins the realm`,
      description: `${farm.total_lots ?? "?"} lots · ${farm.deal_type ?? "unknown deal"}${farm.investor_id ? ` · ${investorById.get(farm.investor_id)?.name ?? "investor"}` : ""}`,
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
        title: `${lot.name} reserved`,
        description: lot.buyerName ? `by ${lot.buyerName}` : "buyer withheld",
        amount: lot.salePrice,
        farmName: lot.farmName,
        lotName: lot.name,
        propertyId: lot.propertyId,
      });
    }
    if (isSold(lot) && lot.closeDate) {
      raw.push({
        id: `closing:${lot.propertyId}`,
        date: lot.closeDate,
        kind: "closing",
        title: `${lot.name} closed`,
        description: `${lot.dealType ?? "deal"} · net ${money(lot.netProfit)}`,
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
        title: `${lot.name} note sold`,
        description: lot.noteBuyerName ? `to ${lot.noteBuyerName}` : "to a note buyer",
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
    raw.push({
      id: `distribution:${d.id}`,
      date: d.distribution_date,
      kind: "distribution",
      title: `${d.kind === "capital_return" ? "Capital returned" : "Profit shared"} to ${investor?.name ?? "investor"}`,
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
        title: `${money(nextMilestone)} of net profit`,
        description: `Crossed with ${e.lotName ?? "a closing"}`,
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
