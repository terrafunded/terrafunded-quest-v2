/**
 * Lot ledger — a pure TypeScript port of Payments' Postgres function
 * `compute_lot_ledger(p_farm_id uuid, p_as_of date)`.
 *
 * Every lot of a farm carries the capital spent on it (its share of the farm's
 * costs), accrues the farm's annual rate on that capital day by day, and is
 * credited with what the lot brings in (down payments, note sales, cash sales).
 * The day the credits cover capital + accrued interest the lot is *released*:
 * the partner's money on that lot is back; anything above the balance is
 * residual. A released lot's note is free.
 *
 * Units: `farm_acquisitions.annual_interest_rate` is a PERCENT (20 = 20 %).
 * `notes.interest_rate` is a FRACTION (0.10 = 10 %) and is never used here.
 *
 * Parity with the RPC is pinned in `__tests__/lotLedger.test.ts` against the raw
 * results `scripts/snapshot.ts` stores in the fixture (`lotLedgers`).
 */
import type { FarmAcquisitionRow, FileCaseRow, NoteRow, NoteSaleRow, PropertyCostRow, PropertyRow } from "./types";
import { daysBetween, parseDate, toIsoDate } from "./dates";

export interface LotLedgerCapitalEntry {
  amt: number;
  /** ISO date the cost was booked (`property_costs.cost_date`). */
  dt: string;
}

export type LotLedgerCreditKind = "down_payment" | "note_sale" | "cash_sale";

export interface LotLedgerCreditEntry {
  amt: number;
  dt: string;
  kind: LotLedgerCreditKind;
}

export interface LotLedgerLot {
  propertyId: string;
  lotNumber: string | null;
  /** Annual rate in percent, copied from the farm so a lot can be projected on its own. */
  ratePct: number;
  /** Σ capital entries. */
  capital: number;
  /** Interest accrued on each capital entry up to min(asOf, released ?? asOf). */
  accruedInterest: number;
  /** Credits applied, capped at the balance on the release day. */
  credits: number;
  /** max(0, capital + accruedInterest − credits): what a partial release costs today. */
  outstanding: number;
  /** ISO date the credits covered the balance, or null while the partner still holds the lot. */
  released: string | null;
  /** Credits received above the balance (after the release, or on the release day). */
  residual: number;
  firstCostDate: string | null;
  capitalEntries: LotLedgerCapitalEntry[];
  creditEntries: LotLedgerCreditEntry[];
}

export interface LotLedger {
  farmId: string;
  farmName: string | null;
  asOf: string;
  ratePct: number;
  lots: LotLedgerLot[];
}

export interface LotLedgerSource {
  farmAcquisitions: FarmAcquisitionRow[];
  properties: PropertyRow[];
  propertyCosts: PropertyCostRow[];
  notes: NoteRow[];
  noteSales: NoteSaleRow[];
  fileCases: FileCaseRow[];
}

interface LotState {
  propertyId: string;
  lotNumber: string | null;
  capital: LotLedgerCapitalEntry[];
  credits: number;
  released: string | null;
  residual: number;
  creditEntries: LotLedgerCreditEntry[];
}

type LedgerEvent =
  | { kind: "cost"; dt: string; propertyId: string | null; amt: number }
  | { kind: "credit"; dt: string; propertyId: string; amt: number; creditKind: LotLedgerCreditKind };

const DAYS_PER_YEAR = 365;

function days(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b) return 0;
  return Math.max(0, daysBetween(a, b));
}

/** Simple interest on every capital entry from its date to `to`, at `ratePct` percent per year. */
export function accruedOn(entries: readonly LotLedgerCapitalEntry[], ratePct: number, to: string): number {
  let acc = 0;
  for (const e of entries) acc += (e.amt * ratePct) / 100 * (days(e.dt, to) / DAYS_PER_YEAR);
  return acc;
}

/**
 * What it costs to release the lot on `date`: capital booked by that day + interest accrued to it
 * − credits received by it, never below zero. Grows every day the lot stays unreleased. Zero from
 * the release day on. Costs and credits dated after `date` do not exist yet, so a ledger computed
 * as of a later day (e.g. the deadline) can still be read at any earlier day.
 */
export function outstandingAt(lot: LotLedgerLot, date: Date | string): number {
  const to = typeof date === "string" ? date : toIsoDate(date);
  if (lot.released && lot.released <= to) return 0;
  const entries = lot.capitalEntries.filter((e) => e.dt <= to);
  const capital = entries.reduce((a, e) => a + e.amt, 0);
  const credits = lot.creditEntries.filter((c) => c.dt <= to).reduce((a, c) => a + c.amt, 0);
  return Math.max(0, capital + accruedOn(entries, lot.ratePct, to) - credits);
}

/**
 * The ledger of one farm as of `asOf`. Returns null when the farm is not in the source.
 * Events dated after `asOf` do not exist; on one date costs are processed before credits.
 */
export function computeLotLedger(farmId: string, source: LotLedgerSource, asOf: Date): LotLedger | null {
  const farm = source.farmAcquisitions.find((f) => f.id === farmId);
  if (!farm) return null;
  const asOfIso = toIsoDate(asOf);
  const ratePct = farm.annual_interest_rate ?? 0;

  const lots = new Map<string, LotState>();
  for (const p of source.properties) {
    if (p.farm_acquisition_id !== farmId) continue;
    lots.set(p.id, { propertyId: p.id, lotNumber: p.lot_number, capital: [], credits: 0, released: null, residual: 0, creditEntries: [] });
  }

  const events: LedgerEvent[] = [];

  for (const c of source.propertyCosts) {
    if (c.farm_acquisition_id !== farmId || !c.cost_date || c.amount === null) continue;
    const dt = c.cost_date.slice(0, 10);
    if (dt > asOfIso) continue;
    events.push({ kind: "cost", dt, propertyId: c.property_id, amt: c.amount });
  }

  const notesById = new Map<string, NoteRow>();
  const lotsWithNotes = new Set<string>();
  for (const n of source.notes) {
    if (!n.property_id || !lots.has(n.property_id)) continue;
    notesById.set(n.id, n);
    lotsWithNotes.add(n.property_id);
    if (n.is_test) continue;
    if (n.start_date && (n.down_payment ?? 0) > 0) {
      const dt = n.start_date.slice(0, 10);
      if (dt <= asOfIso) events.push({ kind: "credit", dt, propertyId: n.property_id, amt: n.down_payment ?? 0, creditKind: "down_payment" });
    }
  }

  for (const s of source.noteSales) {
    const note = s.note_id ? notesById.get(s.note_id) : undefined;
    if (!note?.property_id || !s.sale_date || s.sale_price === null) continue;
    const dt = s.sale_date.slice(0, 10);
    if (dt <= asOfIso) events.push({ kind: "credit", dt, propertyId: note.property_id, amt: s.sale_price, creditKind: "note_sale" });
  }

  for (const fc of source.fileCases) {
    if (!fc.property_id || !lots.has(fc.property_id)) continue;
    if (fc.deal_type !== "cash" || fc.status !== "completed" || !fc.closing_date || fc.sale_price === null) continue;
    if (lotsWithNotes.has(fc.property_id)) continue;
    const dt = fc.closing_date.slice(0, 10);
    if (dt <= asOfIso) events.push({ kind: "credit", dt, propertyId: fc.property_id, amt: fc.sale_price, creditKind: "cash_sale" });
  }

  // Same date: costs before credits. Array.prototype.sort is stable, so equal keys keep source order.
  events.sort((a, b) => (a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : (a.kind === "cost" ? 0 : 1) - (b.kind === "cost" ? 0 : 1)));

  for (const ev of events) {
    if (ev.kind === "cost") {
      if (ev.propertyId) {
        lots.get(ev.propertyId)?.capital.push({ amt: ev.amt, dt: ev.dt });
        continue;
      }
      const open = [...lots.values()].filter((l) => l.released === null || l.released > ev.dt);
      if (open.length === 0) continue;
      const share = ev.amt / open.length;
      for (const l of open) l.capital.push({ amt: share, dt: ev.dt });
      continue;
    }
    const lot = lots.get(ev.propertyId);
    if (!lot) continue;
    lot.creditEntries.push({ amt: ev.amt, dt: ev.dt, kind: ev.creditKind });
    if (lot.released) {
      lot.residual += ev.amt;
      continue;
    }
    lot.credits += ev.amt;
    const capital = lot.capital.reduce((a, e) => a + e.amt, 0);
    const balance = capital + accruedOn(lot.capital, ratePct, ev.dt) - lot.credits;
    if (balance <= 0) {
      lot.released = ev.dt;
      lot.residual = -balance;
      lot.credits += balance;
    }
  }

  const out: LotLedgerLot[] = [];
  for (const l of lots.values()) {
    const capital = l.capital.reduce((a, e) => a + e.amt, 0);
    const accrueTo = l.released && l.released < asOfIso ? l.released : asOfIso;
    const accruedInterest = accruedOn(l.capital, ratePct, accrueTo);
    const firstCostDate = l.capital.reduce<string | null>((min, e) => (min === null || e.dt < min ? e.dt : min), null);
    out.push({
      propertyId: l.propertyId,
      lotNumber: l.lotNumber,
      ratePct,
      capital,
      accruedInterest,
      credits: l.credits,
      outstanding: Math.max(0, capital + accruedInterest - l.credits),
      released: l.released,
      residual: l.residual,
      firstCostDate,
      capitalEntries: l.capital,
      creditEntries: l.creditEntries,
    });
  }
  out.sort((a, b) => lotOrder(a.lotNumber) - lotOrder(b.lotNumber) || a.propertyId.localeCompare(b.propertyId));

  return { farmId, farmName: farm.farm_name, asOf: asOfIso, ratePct, lots: out };
}

/** Ledgers for every farm of one deal type (default: the fixed-interest farms the partial-release rule applies to). */
export function computeLotLedgers(source: LotLedgerSource, asOf: Date, dealType: string | null = "fixed_interest"): Map<string, LotLedger> {
  const out = new Map<string, LotLedger>();
  for (const f of source.farmAcquisitions) {
    if (dealType !== null && f.deal_type !== dealType) continue;
    const ledger = computeLotLedger(f.id, source, asOf);
    if (ledger) out.set(f.id, ledger);
  }
  return out;
}

function lotOrder(lotNumber: string | null): number {
  const n = Number(lotNumber);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}
