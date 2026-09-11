/**
 * EXODUS — return the limited partners' capital with cash and note fractions.
 *
 * One question: to return `LP_CAPITAL_TO_RETURN` by the deadline with `notesPct` of it paid in
 * fractions of promissory notes at 100 % of their unpaid principal balance and the rest in cash,
 * how many notes must be freed and from where, how much must be spent on partial releases, how
 * many farms must be bought with own cash and by when, how much cash must still be paid to LPs,
 * and how much discount is saved versus paying 100 % in cash.
 *
 * An LP who receives a note fraction is settled on the delivery date; what happens to the note
 * afterwards does not exist for this model.
 *
 * Production is the War Plan's required plan in cash mode (target = the LP capital, same
 * deadline): its closings, its partner-funded farms, its ad spend, month by month. The note layer
 * runs on top with its own lot-by-lot waterfalls (`docs`: PROGRESS.md "Exodus"). Pure: no React,
 * no Supabase.
 */
import type { FarmEconomics } from "./farm";
import type { NoteRow, NoteSaleRow, PaymentsSnapshot } from "./types";
import { buildMonthGrid, monthIndexFor, type InvestorMixEntry, type OracleFarm, type OracleMonthGrid, type OracleParams } from "./oracle";
import { solveWarPlan, usdCompact, warPlanMonthLabel, type WarPlan, type WarPlanContext, type WarPlanInputs } from "./warplan";
import { accruedOn, computeLotLedgers, outstandingAt, type LotLedgerLot } from "./lotLedger";
import { addDays, addMonths, daysBetween, monthsBetween, parseDate, toIsoDate } from "./dates";
import { mean, round2, sum } from "./math";
import { DAYS_PER_MONTH, GOAL_DEADLINE, LP_CAPITAL_TO_RETURN } from "../config/goal";
import { EXODUS_DEFAULT_EXCLUDED_NOTE_CODES, EXODUS_DEFAULT_NOTES_PCT, EXODUS_DEFAULT_STARTING_CASH, EXODUS_NOTES_PCT_MAX } from "../config/exodus";

// ———————————————————————————————————————————————————————————————————————————————————————————————
// Inputs, defaults, real values
// ———————————————————————————————————————————————————————————————————————————————————————————————

export interface ExodusInputs {
  /** Capital to return to the LPs (`LP_CAPITAL_TO_RETURN`). */
  lpCapital: number;
  /** Percent of `lpCapital` paid in note fractions, 0..`EXODUS_NOTES_PCT_MAX`. */
  notesPct: number;
  /** ISO date. */
  deadline: string;
  /** Sale price ÷ unpaid balance when a note is sold instead of delivered, as a fraction (0.81 = 81 %). */
  noteSaleRatio: number;
  /** `notes.note_code` values that may never be delivered. */
  excludedNoteCodes: string[];
  /** Portafolio cash when the loop starts (Payments holds no bank balance; default 0). */
  startingCash: number;
  /** Everything else — pace, farm cost, lags, conversion, funding mix, cycle, seasonality — inherited from the War Plan. */
  warPlan: WarPlanInputs;
}

export type NoteSaleRatioBasis = "combined" | "financed" | "oracle";

/** The real note-sale ratio, every way it can be read from `note_sales`. */
export interface NoteSaleRatioReal {
  /** The ratio the inputs are prefilled with. */
  used: number;
  basis: NoteSaleRatioBasis;
  /**
   * Σ sale_price ÷ Σ denominator over every sale, where the denominator is the unpaid balance the
   * recorded `discount_from_upb` implies when it is populated, else `notes.financed_amount`.
   */
  combined: number | null;
  /** Σ sale_price ÷ Σ implied unpaid balance over the sales with `discount_from_upb` populated. */
  discountBased: number | null;
  /** Σ sale_price ÷ Σ financed_amount over the sales whose note has one. */
  financedBased: number | null;
  /**
   * `sale_price ÷ (sale_price + discount_from_upb)` exactly as the brief wrote it. `discount_from_upb`
   * is a percent, not dollars, so this reads as ≈ 1 and is shown only to say why it is not used.
   */
  literal: number | null;
  sales: number;
  salesWithDiscount: number;
  salesWithFinanced: number;
  /** True when every recorded `discount_from_upb` equals 100 × (1 − sale_price ÷ current_upb) within 0.01. */
  discountIsPercent: boolean;
}

export interface ExodusRealValues {
  lpCapital: number;
  deadline: string;
  noteSaleRatio: NoteSaleRatioReal;
  /** Cash the fund has kept so far (receipts − payouts to sponsors), the War Plan's cash-mode start. Not assumed as starting cash. */
  cashKeptToday: number;
  /** Capital and accrued take the War Plan says is owed to sponsors today. */
  owedToday: number;
  excludedNoteCodes: string[];
  /** Real averages the future notes are built from. */
  futureNote: FutureNoteTerms;
}

export interface ExodusDefaults {
  inputs: ExodusInputs;
  real: ExodusRealValues;
}

/** The terms every projected note (pipeline closings, required-pace closings, new farms) is given. */
export interface FutureNoteTerms {
  /** avgSalePrice − down payment, from the Oracle's real averages. */
  faceValue: number;
  /** Annual rate as a FRACTION (0.0946 = 9.46 %), mean over the realm's farm notes. */
  annualRate: number;
  termMonths: number;
  monthlyPayment: number;
  /** Notes behind the rate and term averages. */
  notes: number;
  avgSalePrice: number;
  downPaymentPct: number;
}

export interface ExodusContext extends Omit<WarPlanContext, "snapshot"> {
  snapshot: PaymentsSnapshot;
}

// ———————————————————————————————————————————————————————————————————————————————————————————————
// Amortization
// ———————————————————————————————————————————————————————————————————————————————————————————————

/** Standard level payment for `principal` at `annualRate` (fraction) over `termMonths`. */
export function amortizationPayment(principal: number, annualRate: number, termMonths: number): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = annualRate / 12;
  if (r <= 0) return principal / termMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

/** UPB after `months` payments: `upb_next = upb × (1 + rate/12) − payment`, floored at 0. */
export function projectUpb(upb: number, annualRate: number, monthlyPayment: number, months: number): number {
  let u = Math.max(0, upb);
  for (let i = 0; i < months && u > 0; i++) u = Math.max(0, u * (1 + annualRate / 12) - monthlyPayment);
  return u;
}

/** `[upb after 0 payments, after 1, …, after months]`. */
export function upbSchedule(upb: number, annualRate: number, monthlyPayment: number, months: number): number[] {
  const out = [Math.max(0, upb)];
  for (let i = 1; i <= months; i++) out.push(Math.max(0, (out[i - 1] as number) * (1 + annualRate / 12) - monthlyPayment));
  return out;
}

// ———————————————————————————————————————————————————————————————————————————————————————————————
// The real note-sale ratio
// ———————————————————————————————————————————————————————————————————————————————————————————————

export function noteSaleRatioReal(notes: NoteRow[], noteSales: NoteSaleRow[], fallback: number): NoteSaleRatioReal {
  const noteById = new Map(notes.map((n) => [n.id, n]));
  let combinedPrice = 0;
  let combinedDenominator = 0;
  let discountPrice = 0;
  let discountUpb = 0;
  let discountSum = 0;
  let financedPrice = 0;
  let financed = 0;
  let sales = 0;
  let salesWithDiscount = 0;
  let salesWithFinanced = 0;
  let discountIsPercent = true;
  for (const s of noteSales) {
    if (!s.sale_price || s.sale_price <= 0) continue;
    const note = s.note_id ? noteById.get(s.note_id) : undefined;
    sales += 1;
    const d = s.discount_from_upb;
    const hasDiscount = d !== null && d !== undefined && d < 100;
    const fin = note?.financed_amount ?? 0;
    if (hasDiscount) {
      salesWithDiscount += 1;
      const implied = s.sale_price / (1 - d / 100);
      discountPrice += s.sale_price;
      discountUpb += implied;
      discountSum += d;
      combinedPrice += s.sale_price;
      combinedDenominator += implied;
      if (note?.current_upb && Math.abs(100 * (1 - s.sale_price / note.current_upb) - d) > 0.01) discountIsPercent = false;
    } else if (fin > 0) {
      combinedPrice += s.sale_price;
      combinedDenominator += fin;
    }
    if (fin > 0) {
      salesWithFinanced += 1;
      financedPrice += s.sale_price;
      financed += fin;
    }
  }
  const combined = combinedDenominator > 0 ? combinedPrice / combinedDenominator : null;
  const financedBased = financed > 0 ? financedPrice / financed : null;
  const discountBased = discountUpb > 0 ? discountPrice / discountUpb : null;
  const literal = salesWithDiscount > 0 ? discountPrice / (discountPrice + discountSum) : null;
  const used = combined ?? financedBased ?? fallback;
  const basis: NoteSaleRatioBasis = combined !== null ? "combined" : financedBased !== null ? "financed" : "oracle";
  return {
    used: Math.round(used * 10_000) / 10_000,
    basis,
    combined: combined === null ? null : Math.round(combined * 10_000) / 10_000,
    discountBased: discountBased === null ? null : Math.round(discountBased * 10_000) / 10_000,
    financedBased: financedBased === null ? null : Math.round(financedBased * 10_000) / 10_000,
    literal: literal === null ? null : Math.round(literal * 10_000) / 10_000,
    sales,
    salesWithDiscount,
    salesWithFinanced,
    discountIsPercent: salesWithDiscount > 0 && discountIsPercent,
  };
}

// ———————————————————————————————————————————————————————————————————————————————————————————————
// Today's note inventory
// ———————————————————————————————————————————————————————————————————————————————————————————————

export type NoteInventoryStatus = "free" | "needs_release" | "profit_share" | "excluded" | "no_farm";

export interface NoteInventoryRow {
  noteId: string;
  code: string;
  propertyId: string | null;
  farmId: string | null;
  farmName: string | null;
  farmDealType: string | null;
  lotNumber: string | null;
  upb: number;
  /** Annual rate in PERCENT for display (notes.interest_rate × 100). */
  ratePct: number;
  termMonths: number;
  /** term − months since start_date, floored at 0; null without a start date. */
  remainingMonths: number | null;
  monthlyPayment: number;
  startDate: string | null;
  commercialStatus: string | null;
  status: NoteInventoryStatus;
  /** The lot's outstanding balance today (needs_release), 0 when free, null otherwise. */
  releaseCostToday: number | null;
  /** upb ÷ releaseCostToday for needs_release; null otherwise (a free note settles at no cost). */
  settlementPerDollar: number | null;
}

export interface NoteInventoryBucket {
  notes: number;
  upb: number;
}

export interface NoteInventory {
  rows: NoteInventoryRow[];
  free: NoteInventoryBucket & { farms: string[] };
  needsRelease: NoteInventoryBucket & { costToday: number };
  profitShare: NoteInventoryBucket;
  excluded: NoteInventoryBucket;
  noFarm: NoteInventoryBucket;
  /** Non-test notes left out because they are sold. */
  sold: number;
  /** Non-test notes left out because `status` is not active. */
  inactive: number;
}

function monthsSince(iso: string | null, asOf: Date): number | null {
  const d = parseDate(iso);
  return d ? Math.max(0, Math.round(monthsBetween(d, asOf))) : null;
}

/** Every active, unsold, non-test note with its farm-type status and what freeing it costs today. */
export function computeNoteInventory(snapshot: PaymentsSnapshot, asOf: Date, excludedNoteCodes: readonly string[]): NoteInventory {
  const propertyById = new Map(snapshot.properties.map((p) => [p.id, p]));
  const farmById = new Map(snapshot.farmAcquisitions.map((f) => [f.id, f]));
  const soldNoteIds = new Set(snapshot.noteSales.map((s) => s.note_id));
  const ledgers = computeLotLedgers(snapshot, asOf, null);
  const excluded = new Set(excludedNoteCodes.map((c) => c.trim().toUpperCase()).filter(Boolean));
  const rows: NoteInventoryRow[] = [];
  let sold = 0;
  let inactive = 0;
  for (const n of snapshot.notes) {
    if (n.is_test) continue;
    if (n.is_sold || soldNoteIds.has(n.id)) {
      sold += 1;
      continue;
    }
    if (n.status !== "active") {
      inactive += 1;
      continue;
    }
    const property = n.property_id ? propertyById.get(n.property_id) : undefined;
    const farm = property?.farm_acquisition_id ? farmById.get(property.farm_acquisition_id) : undefined;
    const code = n.note_code ?? n.id;
    let status: NoteInventoryStatus;
    let releaseCostToday: number | null = null;
    if (excluded.has(code.toUpperCase())) status = "excluded";
    else if (!farm) status = "no_farm";
    else if (farm.deal_type === "profit_share") status = "profit_share";
    else if (farm.deal_type === "fixed_interest") {
      const lot = ledgers.get(farm.id)?.lots.find((l) => l.propertyId === property?.id);
      const cost = lot ? outstandingAt(lot, asOf) : 0;
      releaseCostToday = round2(cost);
      status = cost > 0.005 ? "needs_release" : "free";
    } else {
      status = "free";
      releaseCostToday = 0;
    }
    const upb = n.current_upb ?? 0;
    const elapsed = monthsSince(n.start_date, asOf);
    rows.push({
      noteId: n.id,
      code,
      propertyId: property?.id ?? null,
      farmId: farm?.id ?? null,
      farmName: farm?.farm_name ?? null,
      farmDealType: farm?.deal_type ?? null,
      lotNumber: property?.lot_number ?? null,
      upb,
      ratePct: round2((n.interest_rate ?? 0) * 100),
      termMonths: n.term_months ?? 0,
      remainingMonths: elapsed === null ? null : Math.max(0, (n.term_months ?? 0) - elapsed),
      monthlyPayment: n.monthly_payment ?? 0,
      startDate: n.start_date,
      commercialStatus: n.commercial_status,
      status,
      releaseCostToday,
      settlementPerDollar: status === "needs_release" && releaseCostToday ? round2(upb / releaseCostToday) : null,
    });
  }
  const order: Record<NoteInventoryStatus, number> = { free: 0, needs_release: 1, profit_share: 2, excluded: 3, no_farm: 4 };
  rows.sort((a, b) => order[a.status] - order[b.status] || (b.settlementPerDollar ?? 0) - (a.settlementPerDollar ?? 0) || (a.farmName ?? "").localeCompare(b.farmName ?? "") || a.code.localeCompare(b.code));
  const bucket = (status: NoteInventoryStatus): NoteInventoryBucket => {
    const xs = rows.filter((r) => r.status === status);
    return { notes: xs.length, upb: round2(sum(xs.map((r) => r.upb))) };
  };
  const freeRows = rows.filter((r) => r.status === "free");
  return {
    rows,
    free: { ...bucket("free"), farms: [...new Set(freeRows.map((r) => r.farmName ?? "—"))] },
    needsRelease: { ...bucket("needs_release"), costToday: round2(sum(rows.filter((r) => r.status === "needs_release").map((r) => r.releaseCostToday ?? 0))) },
    profitShare: bucket("profit_share"),
    excluded: bucket("excluded"),
    noFarm: bucket("no_farm"),
    sold,
    inactive,
  };
}

/** Mean rate (fraction) and term of the realm's farm notes — what a projected note is given. */
export function futureNoteTerms(snapshot: PaymentsSnapshot, avgSalePrice: number, downPaymentPct: number): FutureNoteTerms {
  const propertyById = new Map(snapshot.properties.map((p) => [p.id, p]));
  const farmNotes = snapshot.notes.filter((n) => !n.is_test && n.property_id && propertyById.get(n.property_id)?.farm_acquisition_id);
  const annualRate = mean(farmNotes.map((n) => n.interest_rate).filter((r): r is number => r !== null && r > 0)) ?? 0.1;
  const termMonths = Math.round(mean(farmNotes.map((n) => n.term_months).filter((t): t is number => t !== null && t > 0)) ?? 120);
  const faceValue = Math.max(0, avgSalePrice * (1 - downPaymentPct / 100));
  return {
    faceValue: round2(faceValue),
    annualRate: Math.round(annualRate * 10_000) / 10_000,
    termMonths,
    monthlyPayment: round2(amortizationPayment(faceValue, annualRate, termMonths)),
    notes: farmNotes.length,
    avgSalePrice,
    downPaymentPct,
  };
}

// ———————————————————————————————————————————————————————————————————————————————————————————————
// The prepared base: the War Plan's production, replayed farm by farm
// ———————————————————————————————————————————————————————————————————————————————————————————————

type Deliverability = "free" | "release" | "never";
type Waterfall = "own" | "fixed" | "profit_share";

/** A profit-share sponsor's capital on one farm: proceeds return it first, then split. */
interface TownsonPool {
  key: string;
  farmName: string;
  capital: number;
  /** Sponsor's share of the proceeds once the capital is back, in percent. */
  splitPct: number;
}

/** A source of projected notes: an existing farm's unsold lots (pool) or one of the War Plan's farms. */
interface NoteSource {
  key: string;
  farmName: string;
  /** wp_farm: who the War Plan has funding it ("Kevin Concua + unfunded"); "" for a pool. */
  fundingLabel: string;
  kind: "pool" | "wp_farm";
  wpFarm: OracleFarm | null;
  deliverability: Deliverability;
  waterfall: Waterfall;
  /** Partner rate in percent (fixed). */
  ratePct: number;
  /** wp_farm: cost ÷ lots. */
  capitalPerLot: number;
  purchaseMonth: number;
  /** pool fixed: the ledger lots still to sell (unreleased, no note), read at any month end. */
  ledgerLots: LotLedgerLot[];
  townson: TownsonPool | null;
  /** Units closing per month index (1-based), from the replay. */
  closings: number[];
}

interface ExistingNoteTemplate {
  row: NoteInventoryRow;
  deliverability: Deliverability;
  waterfall: Waterfall;
  ledgerLot: LotLedgerLot | null;
  townson: TownsonPool | null;
  /** upb after (t − 1) payments, t = month index. */
  schedule: number[];
  saleMonth: number;
}

/** The War Plan's cash-mode metric rebuilt from the replayed consumption, so the replay can be checked against the plan. */
export interface WarPlanCashReplay {
  /** cash kept − owed today: where the War Plan's cash mode starts. */
  start: number;
  /** Σ down payments + note cash landed by the deadline, at the Oracle's `noteSalePct` of the face value. */
  receipts: number;
  /** Σ farm costs bought by the deadline (the War Plan charges the whole farm, whoever funded it). */
  outlays: number;
  /** Σ sponsor take: blended take on today's lots, each farm's deal on its own lots, blended take on unfunded shares. */
  takePaid: number;
  /** start + receipts − outlays − takePaid, prorated inside the deadline month like the Oracle. */
  atDeadline: number;
  /** The War Plan's own `targetAtDeadline`; equal to `atDeadline` when the replay is faithful. */
  warPlanTargetAtDeadline: number;
}

export interface ExodusBase {
  asOf: Date;
  deadline: Date;
  grid: OracleMonthGrid;
  /** Month index containing the deadline. */
  k: number;
  warPlan: WarPlan;
  warPlanCash: WarPlanCashReplay;
  inventory: NoteInventory;
  futureNote: FutureNoteTerms;
  noteLag: number;
  downPerLot: number;
  /** Latest month index a farm bought with own cash still closes lots before the deadline (k − land lag − reservation→closing lag). */
  latestViablePurchaseMonth: number;
  sources: NoteSource[];
  existing: ExistingNoteTemplate[];
  townsonPools: TownsonPool[];
  /** upb of a projected note after n payments. */
  futureSchedule: number[];
  /** Σ lots closed per month index from the War Plan rows (deadline month prorated). */
  closingsByMonth: number[];
  adSpendByMonth: number[];
  /** Fixed-interest lots that never close in the plan, with their partner balance at the deadline. */
  unsoldLotsAtDeadline: { lots: number; partnerBalance: number };
}

function monthEndIso(grid: OracleMonthGrid, t: number): string {
  const mo = grid.months[Math.max(0, Math.min(grid.months.length, t) - 1)];
  return mo ? toIsoDate(mo.end) : toIsoDate(new Date(0));
}

/**
 * The partner balance a lot carries at `iso` for release purposes. Unlike `outstandingAt`, every
 * capital entry the ledger knows counts from day one — also the ones booked later (Franklin 2's
 * funding is dated 2026-10-15): the capital is committed even before Payments books it. Interest
 * still accrues only from each entry's own date, and only credits received by `iso` reduce it.
 */
export function lotClaimAt(lot: LotLedgerLot, iso: string): number {
  if (lot.released && lot.released <= iso) return 0;
  const capital = sum(lot.capitalEntries.map((e) => e.amt));
  const booked = lot.capitalEntries.filter((e) => e.dt <= iso);
  const credits = sum(lot.creditEntries.filter((c) => c.dt <= iso).map((c) => c.amt));
  return Math.max(0, capital + accruedOn(booked, lot.ratePct, iso) - credits);
}

/** The War Plan's farms classified by their largest funding slice; unfunded capital counts as fixed interest at `defaultFixedRate`. */
function classifyWpFarm(f: OracleFarm, defaultFixedRate: number, defaultSplitPct: number): { deliverability: Deliverability; waterfall: Waterfall; ratePct: number; splitPct: number } {
  const by = { fixed_interest: 0, profit_share: 0, own_capital: 0 };
  let rateWeighted = 0;
  let splitWeighted = 0;
  for (const s of f.funding) {
    by[s.dealType] += s.amount;
    if (s.dealType === "fixed_interest") rateWeighted += s.ratePct * s.amount;
    if (s.dealType === "profit_share") splitWeighted += s.ratePct * s.amount;
  }
  by.fixed_interest += f.unfunded;
  rateWeighted += defaultFixedRate * f.unfunded;
  const largest = (Object.keys(by) as (keyof typeof by)[]).sort((a, b) => by[b] - by[a])[0] ?? "fixed_interest";
  if (largest === "own_capital") return { deliverability: "free", waterfall: "own", ratePct: 0, splitPct: 0 };
  if (largest === "profit_share") return { deliverability: "never", waterfall: "profit_share", ratePct: 0, splitPct: by.profit_share > 0 ? splitWeighted / by.profit_share : defaultSplitPct };
  return { deliverability: "release", waterfall: "fixed", ratePct: by.fixed_interest > 0 ? rateWeighted / by.fixed_interest : defaultFixedRate, splitPct: 0 };
}

/**
 * Replays the Oracle's inventory consumption from the plan's rows: today's lots first, then each
 * farm's lots in the order they landed. Returns lots closed per month for the pool and per farm.
 */
function replayConsumption(plan: WarPlan, k: number): { pool: number[]; byFarm: Map<number, number[]> } {
  const rows = plan.required.rows;
  const batches = [...plan.required.schedule].sort((a, b) => a.landMonth - b.landMonth || a.index - b.index).map((f) => ({ farm: f, left: f.lots }));
  const pool = new Array<number>(k + 1).fill(0);
  const byFarm = new Map<number, number[]>();
  for (const b of batches) byFarm.set(b.farm.index, new Array<number>(k + 1).fill(0));
  let poolLeft = plan.startInventory;
  for (let t = 1; t <= k; t++) {
    const row = rows.find((r) => r.monthIndex === t);
    if (!row) continue;
    let closed = row.lotsClosed;
    const fromPool = Math.min(closed, poolLeft);
    poolLeft -= fromPool;
    pool[t] = fromPool;
    closed -= fromPool;
    for (const b of batches) {
      if (closed <= 1e-9) break;
      if (b.farm.landMonth > t || b.left <= 0) continue;
      const take = Math.min(closed, b.left);
      b.left -= take;
      closed -= take;
      const arr = byFarm.get(b.farm.index) as number[];
      arr[t] = (arr[t] ?? 0) + take;
    }
  }
  return { pool, byFarm };
}

/**
 * The Oracle's cash-mode arithmetic applied to the replayed consumption: down payments now, note
 * cash `noteLag` months later at `noteSalePct` of the face value, every farm's whole cost as an
 * outlay, the blended take on today's lots and each farm's own deal on its lots. When this lands on
 * the plan's `targetAtDeadline`, the replay is faithful to the War Plan.
 */
function replayWarPlanCash(plan: WarPlan, params: OracleParams, pool: number[], byFarm: Map<number, number[]>, k: number, deadlineFraction: number): WarPlanCashReplay {
  const downPerLot = params.avgSalePrice * (params.downPaymentPct / 100);
  const noteCashPerLot = (params.avgSalePrice - downPerLot) * (params.noteSalePct / 100);
  const grossPerLot = params.avgSalePrice - params.avgLandCost;
  const poolTakePerLot = grossPerLot * (params.investorTakePct / 100);
  const noteLag = plan.noteLag;
  const receiptsAt = new Array<number>(k + 2).fill(0);
  const takeAt = new Array<number>(k + 2).fill(0);
  const outlaysAt = new Array<number>(k + 2).fill(0);
  for (let t = 1; t <= k; t++) {
    const fromPool = pool[t] ?? 0;
    receiptsAt[t] = (receiptsAt[t] ?? 0) + fromPool * downPerLot;
    if (t + noteLag <= k) receiptsAt[t + noteLag] = (receiptsAt[t + noteLag] ?? 0) + fromPool * noteCashPerLot;
    takeAt[t] = (takeAt[t] ?? 0) + fromPool * poolTakePerLot;
  }
  for (const f of plan.required.schedule) {
    if (f.purchaseMonth >= 1 && f.purchaseMonth <= k) outlaysAt[f.purchaseMonth] = (outlaysAt[f.purchaseMonth] ?? 0) + f.cost;
    const closings = byFarm.get(f.index) ?? [];
    const capitalPerLot = f.lots > 0 ? f.cost / f.lots : 0;
    const gross = params.avgSalePrice - capitalPerLot;
    for (let t = 1; t <= k; t++) {
      const take = closings[t] ?? 0;
      if (take <= 0) continue;
      let takePerLot = 0;
      for (const s of f.funding) {
        const share = f.cost > 0 ? s.amount / f.cost : 0;
        if (s.dealType === "fixed_interest") takePerLot += capitalPerLot * share * (s.ratePct / 100) * (Math.max(0, t - f.purchaseMonth) / 12);
        else if (s.dealType === "profit_share") takePerLot += gross * share * (s.ratePct / 100);
      }
      if (f.cost > 0) takePerLot += gross * (f.unfunded / f.cost) * (params.investorTakePct / 100);
      receiptsAt[t] = (receiptsAt[t] ?? 0) + take * downPerLot;
      if (t + noteLag <= k) receiptsAt[t + noteLag] = (receiptsAt[t + noteLag] ?? 0) + take * noteCashPerLot;
      takeAt[t] = (takeAt[t] ?? 0) + take * takePerLot;
    }
  }
  const start = plan.ledger.cashKept - plan.ledger.owedToday;
  let receipts = 0;
  let outlays = 0;
  let takePaid = 0;
  let prev = start;
  let atDeadline = start;
  for (let t = 1; t <= k; t++) {
    receipts += receiptsAt[t] ?? 0;
    outlays += outlaysAt[t] ?? 0;
    takePaid += takeAt[t] ?? 0;
    const value = start + receipts - outlays - takePaid;
    if (t === k) atDeadline = prev + deadlineFraction * (value - prev);
    prev = value;
  }
  return {
    start: round2(start),
    receipts: round2(receipts),
    outlays: round2(outlays),
    takePaid: round2(takePaid),
    atDeadline: round2(atDeadline),
    warPlanTargetAtDeadline: round2(plan.required.targetAtDeadline),
  };
}

/** Shares `total` among farms by their remaining unsold lots, never above what each has left. */
function shareAmongFarms(total: number, remaining: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  let left = total;
  for (let pass = 0; pass < 8 && left > 1e-9; pass++) {
    const open = [...remaining.entries()].filter(([key, r]) => r - (out.get(key) ?? 0) > 1e-9);
    const capacity = sum(open.map(([key, r]) => r - (out.get(key) ?? 0)));
    if (capacity <= 1e-9) break;
    const portion = Math.min(left, capacity);
    let given = 0;
    for (const [key, r] of open) {
      const room = r - (out.get(key) ?? 0);
      const share = Math.min(room, (portion * room) / capacity);
      out.set(key, (out.get(key) ?? 0) + share);
      given += share;
    }
    left -= given;
    if (given <= 1e-12) break;
  }
  return out;
}

/** Solves the War Plan in cash mode for the LP capital and lays out every source of notes. Expensive; run once per deadline. */
export function prepareExodus(inputs: Pick<ExodusInputs, "lpCapital" | "deadline" | "warPlan" | "excludedNoteCodes">, ctx: ExodusContext): ExodusBase {
  const asOf = ctx.asOf;
  const plan = solveWarPlan({ ...inputs.warPlan, target: inputs.lpCapital, deadline: inputs.deadline, targetMode: "cash_in_bank" }, ctx);
  const deadline = parseDate(inputs.deadline) ?? asOf;
  const grid = buildMonthGrid(asOf, deadline, true);
  const k = grid.deadlineIndex;
  const params = plan.required.params;
  const futureNote = futureNoteTerms(ctx.snapshot, params.avgSalePrice, params.downPaymentPct);
  const downPerLot = params.avgSalePrice * (params.downPaymentPct / 100);
  const noteLag = plan.noteLag;
  const inventory = computeNoteInventory(ctx.snapshot, asOf, inputs.excludedNoteCodes);
  // Ledgers as of the deadline carry costs booked after today (Franklin 2's funding); outstandingAt reads them at any month end.
  const ledgers = computeLotLedgers(ctx.snapshot, deadline, null);
  const notedLots = new Set(ctx.snapshot.notes.filter((n) => !n.is_test && n.property_id).map((n) => n.property_id as string));
  const { pool, byFarm } = k > 0 ? replayConsumption(plan, k) : { pool: [0], byFarm: new Map<number, number[]>() };
  // The Exodus closes only the share of the deadline month that lies before the deadline.
  const beforeDeadline = (t: number) => (t === k ? grid.deadlineFraction : 1);

  const townsonPools: TownsonPool[] = [];
  const townsonFor = (farm: FarmEconomics): TownsonPool => {
    const found = townsonPools.find((p) => p.key === farm.farmId);
    if (found) return found;
    const pool: TownsonPool = { key: farm.farmId, farmName: farm.name, capital: Math.max(0, farm.capitalOutstanding), splitPct: farm.profitSharePct ?? 50 };
    townsonPools.push(pool);
    return pool;
  };

  // The pool: today's unsold lots, shared out month by month by what each farm still has to sell.
  const remaining = new Map<string, number>();
  const poolFarms = ctx.farms.filter((f) => f.stages.available + f.stages.reserved > 0);
  for (const f of poolFarms) remaining.set(f.farmId, f.stages.available + f.stages.reserved);
  const poolClosings = new Map<string, number[]>();
  for (const f of poolFarms) poolClosings.set(f.farmId, new Array<number>(k + 1).fill(0));
  for (let t = 1; t <= k; t++) {
    const shares = shareAmongFarms((pool[t] ?? 0) * beforeDeadline(t), remaining);
    for (const [farmId, units] of shares) {
      remaining.set(farmId, (remaining.get(farmId) ?? 0) - units);
      const arr = poolClosings.get(farmId) as number[];
      arr[t] = units;
    }
  }
  const sources: NoteSource[] = [];
  for (const f of poolFarms) {
    const ledger = ledgers.get(f.farmId);
    const open = ledger ? ledger.lots.filter((l) => !l.released) : [];
    const openNoNote = open.filter((l) => !notedLots.has(l.propertyId));
    const dealType = f.dealType;
    // A farm whose purchase has not closed yet (Franklin 2 closes 2026-10-15) has no cost rows, so its
    // ledger lots carry nothing. The partner's capital is committed all the same: each lot is given
    // the realm's land cost per lot, dated the farm's closing (or today when that date is unknown).
    const committedFrom = f.closingDate && f.closingDate > toIsoDate(asOf) ? f.closingDate : toIsoDate(asOf);
    const withCommittedCapital = (lots: LotLedgerLot[]): LotLedgerLot[] =>
      dealType === "fixed_interest" && f.landCostPerLot > 0
        ? lots.map((l) => (l.capitalEntries.length === 0 ? { ...l, ratePct: f.annualRatePct, capitalEntries: [{ amt: f.landCostPerLot, dt: committedFrom }] } : l))
        : lots;
    sources.push({
      key: `pool:${f.farmId}`,
      farmName: f.name,
      fundingLabel: "",
      kind: "pool",
      wpFarm: null,
      deliverability: dealType === "profit_share" ? "never" : dealType === "fixed_interest" ? "release" : "free",
      waterfall: dealType === "profit_share" ? "profit_share" : dealType === "fixed_interest" ? "fixed" : "own",
      ratePct: f.annualRatePct,
      capitalPerLot: f.landCostPerLot,
      purchaseMonth: 0,
      ledgerLots: withCommittedCapital(openNoNote.length > 0 ? openNoNote : open),
      townson: dealType === "profit_share" ? townsonFor(f) : null,
      closings: poolClosings.get(f.farmId) as number[],
    });
  }
  const mix: InvestorMixEntry[] = inputs.warPlan.investorMix;
  const defaultFixedRate = mix.find((m) => m.dealType === "fixed_interest")?.ratePct ?? 20;
  const defaultSplit = mix.find((m) => m.dealType === "profit_share")?.ratePct ?? 50;
  for (const f of plan.required.schedule) {
    const c = classifyWpFarm(f, defaultFixedRate, defaultSplit);
    const label = f.funding.length > 0 ? f.funding.map((s) => s.name).join(" + ") + (f.unfunded > 0 ? " + unfunded" : "") : "unfunded";
    let townson: TownsonPool | null = null;
    if (c.waterfall === "profit_share") {
      townson = { key: `wp:${f.index}`, farmName: `Farm ${f.index + 1}`, capital: f.cost, splitPct: c.splitPct };
      townsonPools.push(townson);
    }
    sources.push({
      key: `wp:${f.index}`,
      farmName: `Farm ${f.index + 1} (${label})`,
      fundingLabel: label,
      kind: "wp_farm",
      wpFarm: f,
      deliverability: c.deliverability,
      waterfall: c.waterfall,
      ratePct: c.ratePct,
      capitalPerLot: f.lots > 0 ? f.cost / f.lots : 0,
      purchaseMonth: f.purchaseMonth,
      ledgerLots: [],
      townson,
      closings: (byFarm.get(f.index) ?? new Array<number>(k + 1).fill(0)).map((units, t) => units * beforeDeadline(t)),
    });
  }

  // Existing notes: the ones that can be delivered or must be sold. Excluded and farm-less notes stay out.
  const existing: ExistingNoteTemplate[] = [];
  for (const row of inventory.rows) {
    if (row.status === "excluded" || row.status === "no_farm") continue;
    const farm = ctx.farms.find((f) => f.farmId === row.farmId) ?? null;
    const ledgerLot = row.farmId && row.propertyId ? (ledgers.get(row.farmId)?.lots.find((l) => l.propertyId === row.propertyId) ?? null) : null;
    const start = parseDate(row.startDate);
    const saleAt = start ? monthIndexFor(addMonths(start, noteLag), grid) : 1;
    const deliverability: Deliverability = row.status === "profit_share" ? "never" : row.status === "needs_release" ? "release" : "free";
    const waterfall: Waterfall = row.farmDealType === "profit_share" ? "profit_share" : row.farmDealType === "fixed_interest" ? "fixed" : "own";
    const townson = waterfall === "profit_share" && farm ? townsonFor(farm) : null;
    existing.push({
      row,
      deliverability,
      waterfall,
      ledgerLot,
      townson,
      schedule: upbSchedule(row.upb, row.ratePct / 100, row.monthlyPayment, Math.max(1, k)),
      saleMonth: Math.max(1, Math.min(Math.max(1, k), saleAt ?? 1)),
    });
  }

  const closingsByMonth = new Array<number>(k + 1).fill(0);
  const adSpendByMonth = new Array<number>(k + 1).fill(0);
  for (const row of plan.required.rows) {
    if (row.monthIndex > k) continue;
    const w = row.monthIndex === k ? grid.deadlineFraction : 1;
    closingsByMonth[row.monthIndex] = row.lotsClosed * w;
    adSpendByMonth[row.monthIndex] = row.adSpend * w;
  }

  // The War Plan's cash metric, rebuilt from the replay with the Oracle's own arithmetic.
  const warPlanCash = replayWarPlanCash(plan, params, pool, byFarm, k, grid.deadlineFraction);

  // Fixed-interest lots the plan never sells, with the partner balance they still carry at the deadline.
  let unsoldLots = 0;
  let unsoldBalance = 0;
  const deadlineIso = toIsoDate(deadline);
  for (const s of sources) {
    if (s.waterfall !== "fixed") continue;
    const closed = sum(s.closings);
    if (s.kind === "pool") {
      const total = remaining.get(s.key.slice("pool:".length)) ?? 0;
      const left = Math.max(0, total);
      if (left > 1e-9) {
        unsoldLots += left;
        unsoldBalance += left * (mean(s.ledgerLots.map((l) => lotClaimAt(l, deadlineIso))) ?? 0);
      }
    } else if (s.wpFarm) {
      const left = Math.max(0, s.wpFarm.lots - closed);
      if (left > 1e-9) {
        unsoldLots += left;
        unsoldBalance += left * s.capitalPerLot * (1 + (s.ratePct / 100) * (Math.max(0, k - s.purchaseMonth) / 12));
      }
    }
  }

  return {
    asOf,
    deadline,
    grid,
    k,
    warPlan: plan,
    warPlanCash,
    inventory,
    futureNote,
    noteLag,
    downPerLot,
    latestViablePurchaseMonth: Math.max(0, k - plan.landLag - plan.closeLag),
    sources,
    existing,
    townsonPools,
    futureSchedule: upbSchedule(futureNote.faceValue, futureNote.annualRate, futureNote.monthlyPayment, Math.max(1, k)),
    closingsByMonth,
    adSpendByMonth,
    unsoldLotsAtDeadline: { lots: round2(unsoldLots), partnerBalance: round2(unsoldBalance) },
  };
}

// ———————————————————————————————————————————————————————————————————————————————————————————————
// One scenario: the monthly loop
// ———————————————————————————————————————————————————————————————————————————————————————————————

export interface ExodusMonthRow {
  monthIndex: number;
  /** Last day of the month (ISO); the deadline month ends at the deadline. */
  date: string;
  lotsClosed: number;
  /** Notes deliverable at no cost this month, before delivery (today's free inventory in month 1, free closings after). */
  freeNotesAvailable: number;
  notesDelivered: number;
  notesDeliveredValue: number;
  partialReleases: number;
  partialReleaseCost: number;
  cashFarmsBought: number;
  cashFarmCost: number;
  notesSold: number;
  noteSaleProceeds: number;
  /** Portafolio's share of the month's proceeds after the farm waterfalls (down payments, note sales, residuals). */
  portafolioCashIn: number;
  adSpend: number;
  cashPaidToLPs: number;
  /** Portafolio cash carried into the next month (negative when ad spend exceeded the inflows). */
  cashCarried: number;
  cumulativeNotes: number;
  cumulativeCash: number;
  cumulativeReturned: number;
}

export interface CashFarmPurchase {
  wpFarmIndex: number;
  label: string;
  monthIndex: number;
  date: string;
  cost: number;
  /** Free note value the farm's lots produce before the deadline. */
  freeNoteValue: number;
  ratio: number;
}

export interface PartialRelease {
  label: string;
  farmName: string;
  monthIndex: number;
  /** Month the release is paid (month end). */
  date: string;
  /** Month end of the closing batch for projected lots; null for a note that exists today. */
  closingDate: string | null;
  /** Whole notes for today's inventory; fractional lots for projected notes. */
  units: number;
  cost: number;
  upbDelivered: number;
  ratio: number;
  source: "existing" | "projected";
}

/** How a delivered note reached the LPs. */
export type DeliveredVia = "existingFree" | "existingReleased" | "projectedFree" | "projectedReleased" | "cashFarm";

/** One delivery to the LPs: a note (or fraction) at its UPB of the delivery month. */
export interface DeliveredNote {
  /** Note code for today's notes; "<farm> · <closing month>" for a projected batch. */
  label: string;
  farmName: string;
  source: "existing" | "projected";
  via: DeliveredVia;
  monthIndex: number;
  date: string;
  /** Whole notes or the fraction of the last one. */
  units: number;
  /** UPB per unit in the delivery month. */
  upbPerUnit: number;
  /** units × upbPerUnit. */
  value: number;
}

export interface DeliveredPackage {
  totalUpb: number;
  notes: number;
  /** UPB-weighted annual rate in percent. */
  avgRatePct: number | null;
  /** UPB-weighted original term in months. */
  avgTermMonths: number | null;
  /** UPB-weighted months left at delivery. */
  avgRemainingMonths: number | null;
  existingFree: NoteInventoryBucket;
  existingReleased: NoteInventoryBucket;
  projectedFree: NoteInventoryBucket;
  projectedReleased: NoteInventoryBucket;
  cashFarm: NoteInventoryBucket;
}

export interface ExodusScenario {
  notesPct: number;
  noteTarget: number;
  notesDelivered: number;
  cashPaidToLPs: number;
  totalReturned: number;
  /** notes + cash ≥ lpCapital by the deadline. */
  feasible: boolean;
  /** notesDelivered ≥ noteTarget by the deadline. */
  notesCovered: boolean;
  shortfall: number;
  hitMonthIndex: number | null;
  hitDate: string | null;
  /** Lots closed up to the day the capital is returned (every planned lot when it is not). */
  lotsNeeded: number;
  lotsClosedTotal: number;
  partialReleases: { count: number; cost: number; list: PartialRelease[] };
  cashFarms: { count: number; cost: number; purchases: CashFarmPurchase[]; lastPurchaseDate: string | null };
  notesSold: { count: number; proceeds: number };
  adSpend: number;
  /** Notes freed and delivered at no cost. */
  freeNotesDelivered: number;
  rows: ExodusMonthRow[];
  /** Every delivery in order, month by month. */
  deliveries: DeliveredNote[];
  package: DeliveredPackage;
  /** Partner balances no lot proceeds pay in this model: unsold fixed-interest lots, sold notes that fell short, sponsor capital not yet returned. */
  partnerBalanceAtDeadline: number;
  flows: ExodusCashFlows;
}

/** Where Portafolio's cash came from and went. `cashPaidToLPs` = start + receipts − partners − settlement spend − ad spend − carry. */
export interface ExodusCashFlows {
  startingCash: number;
  /** Down payments and note sale proceeds of the lots the plan closes, before the waterfalls. */
  projectedReceipts: number;
  /** Sale proceeds of today's notes, before the waterfalls. */
  existingReceipts: number;
  /** Partner share of the projected lots' proceeds (fixed claims, sponsor capital, profit split). */
  projectedPartnerPaid: number;
  /** Partner share of today's notes' proceeds. */
  existingPartnerPaid: number;
  partialReleaseCost: number;
  cashFarmCost: number;
  adSpend: number;
  /** Cash carried past the deadline: negative when ad spend outran the inflows, never positive. */
  cashCarriedAtDeadline: number;
}

interface Tranche {
  id: string;
  label: string;
  farmName: string;
  source: "existing" | "projected";
  sourceKey: string;
  deliverability: Deliverability;
  waterfall: Waterfall;
  townson: TownsonPool | null;
  /** upb per unit at month t. */
  upbAt: (t: number) => number;
  /** partner balance per unit at month t before any credit. */
  baseCostAt: (t: number) => number;
  partnerPaidPerUnit: number;
  units: number;
  unitsHeld: number;
  closeMonth: number;
  saleMonth: number;
  /** Tie-break: the earliest date wins. */
  sortDate: string;
  ratePct: number;
  termMonths: number;
  /** Months already paid at month 1 (existing) — remaining term = term − elapsed − (t − closeMonth). */
  elapsedAtClose: number;
  /** Whole notes only (today's inventory): a lot is released entirely or not at all. */
  indivisible: boolean;
  /** Reserved for LP delivery — not sold while the target is unmet. */
  reserved: boolean;
  /** The partner's claim has been paid in full (by proceeds or a release): nothing accrues after that. */
  released: boolean;
}

interface MutableTownson {
  pool: TownsonPool;
  capital: number;
}

type PackageBucket = DeliveredVia;

/** One way to spend Portafolio cash on settlement this month, ranked by settlement per dollar. */
type AllocationOption =
  | { kind: "release"; tr: Tranche; ratio: number; cost: number; upb: number; sortDate: string; label: string }
  | { kind: "farm"; source: NoteSource; ratio: number; cost: number; value: number; sortDate: string; label: string };

/** What the allocation ranks: settlement per dollar, and the earliest date on a tie. */
export interface RankedOption {
  ratio: number;
  /** ISO date used to break ties: the note's start date or the batch's closing month end. */
  sortDate: string;
  label: string;
}

/** Highest settlement per dollar first; equal ratios go to the earliest date, then the label. */
export function compareAllocationOptions(a: RankedOption, b: RankedOption): number {
  return b.ratio - a.ratio || a.sortDate.localeCompare(b.sortDate) || a.label.localeCompare(b.label);
}

const EPS = 1e-9;

function claimOf(tr: Tranche, t: number): number {
  if (tr.waterfall !== "fixed" || tr.released) return 0;
  return Math.max(0, tr.baseCostAt(t) - tr.partnerPaidPerUnit);
}

/** Runs one scenario on a prepared base. Cheap; the slider, the search for `maxNotesPct` and the baseline all call it. */
export function runExodus(base: ExodusBase, inputs: Pick<ExodusInputs, "lpCapital" | "notesPct" | "noteSaleRatio" | "startingCash">): ExodusScenario {
  const { grid, k, sources, downPerLot, noteLag, futureNote, futureSchedule } = base;
  const lpCapital = Math.max(0, inputs.lpCapital);
  const notesPct = Math.max(0, Math.min(EXODUS_NOTES_PCT_MAX, inputs.notesPct));
  const target = (lpCapital * notesPct) / 100;
  const ratio = Math.max(0, Math.min(1, inputs.noteSaleRatio));

  const townson = new Map<string, MutableTownson>();
  for (const p of base.townsonPools) townson.set(p.key, { pool: p, capital: p.capital });
  const swapped = new Set<string>();

  let cash = inputs.startingCash;
  let delivered = 0;
  let cashPaid = 0;
  const rows: ExodusMonthRow[] = [];
  const releases: PartialRelease[] = [];
  const purchases: CashFarmPurchase[] = [];
  const deliveries: DeliveredNote[] = [];
  const pkg = { upb: 0, notes: 0, rate: 0, term: 0, remaining: 0, existingFree: { notes: 0, upb: 0 }, existingReleased: { notes: 0, upb: 0 }, projectedFree: { notes: 0, upb: 0 }, projectedReleased: { notes: 0, upb: 0 }, cashFarm: { notes: 0, upb: 0 } };
  let soldCount = 0;
  let soldProceeds = 0;
  let adTotal = 0;
  let freeDelivered = 0;
  const flows = { projectedReceipts: 0, existingReceipts: 0, projectedPartnerPaid: 0, existingPartnerPaid: 0, releases: 0, farms: 0 };
  let releaseUnits = 0;

  const tranches: Tranche[] = base.existing.map((e) => ({
    id: `note:${e.row.noteId}`,
    label: e.row.code,
    farmName: e.row.farmName ?? "—",
    source: "existing",
    sourceKey: e.row.farmId ?? "",
    deliverability: e.deliverability,
    waterfall: e.waterfall,
    townson: e.townson,
    upbAt: (t) => e.schedule[Math.max(0, Math.min(e.schedule.length - 1, t - 1))] ?? 0,
    baseCostAt: (t) => (e.ledgerLot ? lotClaimAt(e.ledgerLot, monthEndIso(grid, t)) : 0),
    partnerPaidPerUnit: 0,
    units: 1,
    unitsHeld: 1,
    closeMonth: 1,
    saleMonth: e.saleMonth,
    sortDate: e.row.startDate ?? "0000-00-00",
    ratePct: e.row.ratePct,
    termMonths: e.row.termMonths,
    elapsedAtClose: e.row.remainingMonths === null ? 0 : Math.max(0, e.row.termMonths - e.row.remainingMonths),
    indivisible: true,
    reserved: false,
    released: e.deliverability === "free",
  }));

  const isFree = (s: NoteSource) => s.deliverability === "free" || swapped.has(s.key);
  /** A War Plan farm Portafolio buys with its own cash instead of the plan's funding. */
  const cashFarmName = (s: NoteSource) => `Farm ${(s.wpFarm?.index ?? 0) + 1} (own cash instead of ${s.fundingLabel})`;
  const sourceName = (s: NoteSource) => (s.kind === "wp_farm" && swapped.has(s.key) ? cashFarmName(s) : s.farmName);
  const projectedUpb = (closeMonth: number) => (t: number) => futureSchedule[Math.max(0, Math.min(futureSchedule.length - 1, t - closeMonth))] ?? 0;
  const baseCostFor = (s: NoteSource): ((t: number) => number) => {
    if (s.waterfall !== "fixed") return () => 0;
    if (s.kind === "pool") return (t) => mean(s.ledgerLots.map((l) => lotClaimAt(l, monthEndIso(grid, t)))) ?? 0;
    return (t) => s.capitalPerLot * (1 + (s.ratePct / 100) * (Math.max(0, t - s.purchaseMonth) / 12));
  };
  const isFreeTranche = (tr: Tranche, t: number) => tr.deliverability === "free" || (tr.deliverability === "release" && claimOf(tr, t) <= EPS);
  /** Free note value still to come after month t from sources whose notes need no release (own capital, swapped farms). */
  const futureFree = (t: number) => {
    let v = 0;
    for (const s of sources) {
      if (!isFree(s)) continue;
      for (let m = t + 1; m <= k; m++) v += (s.closings[m] ?? 0) * futureNote.faceValue;
    }
    return v;
  };
  /** Free notes in hand this month plus the ones still to come: what the target gets at no cost. */
  const committedFree = (t: number) => {
    let held = 0;
    for (const tr of tranches) if (tr.unitsHeld > EPS && tr.closeMonth <= t && isFreeTranche(tr, t)) held += tr.unitsHeld * tr.upbAt(t);
    return held + futureFree(t);
  };

  /** Routes proceeds of one tranche's lot(s) through its farm's waterfall; returns Portafolio's share. */
  const waterfall = (tr: Tranche, amount: number, t: number, units: number): number => {
    if (amount <= 0) return 0;
    const share = (() => {
      if (tr.waterfall === "own") return amount;
      if (tr.waterfall === "fixed") {
        const claim = claimOf(tr, t) * units;
        const toPartner = Math.min(claim, amount);
        if (units > 0) tr.partnerPaidPerUnit += toPartner / units;
        if (toPartner >= claim - 1e-6) tr.released = true;
        return amount - toPartner;
      }
      const pool = tr.townson ? townson.get(tr.townson.key) : undefined;
      if (!pool) return amount;
      const toCapital = Math.min(pool.capital, amount);
      pool.capital -= toCapital;
      const rest = amount - toCapital;
      return rest * (1 - pool.pool.splitPct / 100);
    })();
    if (tr.source === "existing") {
      flows.existingReceipts += amount;
      flows.existingPartnerPaid += amount - share;
    } else {
      flows.projectedReceipts += amount;
      flows.projectedPartnerPaid += amount - share;
    }
    return share;
  };

  const deliver = (tr: Tranche, units: number, t: number, via: PackageBucket) => {
    const upb = tr.upbAt(t);
    const value = units * upb;
    delivered += value;
    tr.unitsHeld -= units;
    deliveries.push({ label: tr.label, farmName: tr.farmName, source: tr.source, via, monthIndex: t, date: monthEndIso(grid, t), units: round2(units), upbPerUnit: round2(upb), value: round2(value) });
    pkg.upb += value;
    pkg.notes += units;
    pkg.rate += value * tr.ratePct;
    pkg.term += value * tr.termMonths;
    pkg.remaining += value * Math.max(0, tr.termMonths - tr.elapsedAtClose - (t - tr.closeMonth));
    pkg[via].notes += units;
    pkg[via].upb += value;
    return value;
  };

  const sell = (tr: Tranche, units: number, t: number, month: { sold: number; proceeds: number; cashIn: number }) => {
    if (units <= EPS) return;
    const proceeds = units * tr.upbAt(t) * ratio;
    tr.unitsHeld -= units;
    soldCount += units;
    soldProceeds += proceeds;
    month.sold += units;
    month.proceeds += proceeds;
    const share = waterfall(tr, proceeds, t, units);
    month.cashIn += share;
    cash += share;
  };

  let cumNotes = 0;
  let cumCash = 0;
  for (let t = 1; t <= Math.max(1, k); t++) {
    const month = { sold: 0, proceeds: 0, cashIn: 0, freeAvailable: 0, deliveredUnits: 0, deliveredValue: 0, releases: 0, releaseCost: 0, farms: 0, farmCost: 0 };
    if (k === 0) {
      rows.push({ monthIndex: 1, date: toIsoDate(base.asOf), lotsClosed: 0, freeNotesAvailable: 0, notesDelivered: 0, notesDeliveredValue: 0, partialReleases: 0, partialReleaseCost: 0, cashFarmsBought: 0, cashFarmCost: 0, notesSold: 0, noteSaleProceeds: 0, portafolioCashIn: 0, adSpend: 0, cashPaidToLPs: 0, cashCarried: round2(cash), cumulativeNotes: 0, cumulativeCash: 0, cumulativeReturned: 0 });
      break;
    }
    const targetMet = () => delivered >= target - 0.005;

    // 1. Closings exactly as the War Plan projects them: one tranche per source per month, down payments through the waterfall.
    for (const s of sources) {
      const units = s.closings[t] ?? 0;
      if (units <= EPS) continue;
      const free = isFree(s);
      const tr: Tranche = {
        id: `${s.key}:${t}`,
        label: `${sourceName(s)} · ${warPlanMonthLabel(monthEndIso(grid, t))}`,
        farmName: sourceName(s),
        source: "projected",
        sourceKey: s.key,
        deliverability: free ? "free" : s.deliverability,
        waterfall: free ? "own" : s.waterfall,
        townson: free ? null : s.townson,
        upbAt: projectedUpb(t),
        baseCostAt: free ? () => 0 : baseCostFor(s),
        partnerPaidPerUnit: 0,
        units,
        unitsHeld: units,
        closeMonth: t,
        saleMonth: Math.min(k, t + noteLag),
        sortDate: monthEndIso(grid, t),
        ratePct: futureNote.annualRate * 100,
        termMonths: futureNote.termMonths,
        elapsedAtClose: 0,
        indivisible: false,
        reserved: false,
        released: free || s.waterfall !== "fixed",
      };
      tranches.push(tr);
      const share = waterfall(tr, units * downPerLot, t, units);
      month.cashIn += share;
      cash += share;
    }

    // 2. Reserve the best release candidates the target still needs; sell everything else that is due.
    const need = Math.max(0, target - delivered - committedFree(t));
    const candidates = tranches
      .filter((tr) => tr.unitsHeld > EPS && tr.closeMonth <= t && tr.deliverability === "release")
      .map((tr) => ({ tr, claim: claimOf(tr, t), upb: tr.upbAt(t) }))
      .map((c) => ({ ...c, ratio: c.claim > EPS ? c.upb / c.claim : Number.POSITIVE_INFINITY, sortDate: c.tr.sortDate, label: c.tr.label }))
      .sort(compareAllocationOptions);
    let covered = 0;
    for (const c of candidates) {
      c.tr.reserved = !targetMet() && covered < need - EPS;
      if (c.tr.reserved) covered += c.upb * c.tr.unitsHeld;
    }
    for (const tr of tranches) {
      if (tr.unitsHeld <= EPS || tr.closeMonth > t) continue;
      const deliverable = tr.deliverability !== "never" && !targetMet() && (tr.deliverability === "free" || tr.reserved);
      if (!deliverable && tr.saleMonth <= t) sell(tr, tr.unitsHeld, t, month);
    }

    // 3. Ad spend is paid.
    const ads = base.adSpendByMonth[t] ?? 0;
    cash -= ads;
    adTotal += ads;

    // 4. Allocation while delivered note value < target: free notes first, then by settlement per dollar.
    for (const tr of tranches) if (tr.unitsHeld > EPS && tr.closeMonth <= t && isFreeTranche(tr, t)) month.freeAvailable += tr.unitsHeld;
    const free = tranches
      .filter((tr) => tr.unitsHeld > EPS && tr.closeMonth <= t && isFreeTranche(tr, t))
      .sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.label.localeCompare(b.label));
    for (const tr of free) {
      if (targetMet()) break;
      const upb = tr.upbAt(t);
      if (upb <= EPS) continue;
      const units = Math.min(tr.unitsHeld, (target - delivered) / upb);
      const via = tr.source === "existing" ? "existingFree" : swapped.has(tr.sourceKey) ? "cashFarm" : "projectedFree";
      month.deliveredValue += deliver(tr, units, t, via);
      month.deliveredUnits += units;
      freeDelivered += units;
      if (tr.indivisible && tr.unitsHeld > EPS) sell(tr, tr.unitsHeld, t, month);
    }
    if (!targetMet()) {
      const options: AllocationOption[] = [];
      for (const tr of tranches) {
        if (tr.unitsHeld <= EPS || tr.closeMonth > t || tr.deliverability !== "release") continue;
        const claim = claimOf(tr, t);
        if (claim <= EPS) continue;
        const upb = tr.upbAt(t);
        options.push({ kind: "release", tr, ratio: upb / claim, cost: claim, upb, sortDate: tr.sortDate, label: tr.label });
      }
      for (const s of sources) {
        if (s.kind !== "wp_farm" || !s.wpFarm || s.purchaseMonth !== t || swapped.has(s.key) || s.deliverability === "free") continue;
        if (s.purchaseMonth > base.latestViablePurchaseMonth) continue;
        const value = sum(s.closings.slice(t)) * futureNote.faceValue;
        if (value <= EPS || s.wpFarm.cost <= 0) continue;
        options.push({ kind: "farm", source: s, ratio: value / s.wpFarm.cost, cost: s.wpFarm.cost, value, sortDate: monthEndIso(grid, t), label: s.farmName });
      }
      options.sort(compareAllocationOptions);
      for (const o of options) {
        if (targetMet() || cash <= EPS) break;
        // Paying LPs in cash settles $1 per $1: nothing below that ratio is worth buying.
        if (o.ratio <= 1) break;
        const remainingNeed = Math.max(0, target - delivered - futureFree(t));
        if (remainingNeed <= EPS) break;
        if (o.kind === "farm") {
          if (cash + EPS < o.cost) continue;
          cash -= o.cost;
          flows.farms += o.cost;
          swapped.add(o.source.key);
          month.farms += 1;
          month.farmCost += o.cost;
          purchases.push({ wpFarmIndex: o.source.wpFarm?.index ?? -1, label: cashFarmName(o.source), monthIndex: t, date: monthEndIso(grid, t), cost: round2(o.cost), freeNoteValue: round2(o.value), ratio: round2(o.ratio) });
          continue;
        }
        const tr = o.tr;
        if (tr.indivisible) {
          if (cash + EPS < o.cost) continue;
          cash -= o.cost;
          flows.releases += o.cost;
          releaseUnits += 1;
          tr.partnerPaidPerUnit += o.cost;
          tr.released = true;
          month.releases += 1;
          month.releaseCost += o.cost;
          const units = Math.min(1, (target - delivered) / o.upb);
          const value = deliver(tr, units, t, "existingReleased");
          month.deliveredValue += value;
          month.deliveredUnits += units;
          releases.push({ label: tr.label, farmName: tr.farmName, monthIndex: t, date: monthEndIso(grid, t), closingDate: null, units: 1, cost: round2(o.cost), upbDelivered: round2(value), ratio: round2(o.ratio), source: "existing" });
          if (tr.unitsHeld > EPS) sell(tr, tr.unitsHeld, t, month);
        } else {
          const units = Math.min(tr.unitsHeld, cash / o.cost, remainingNeed / o.upb);
          if (units <= EPS) continue;
          cash -= units * o.cost;
          flows.releases += units * o.cost;
          releaseUnits += units;
          month.releases += units;
          month.releaseCost += units * o.cost;
          // The released units leave the tranche settled: their claim is paid and their notes delivered;
          // the units left behind keep the per-unit balance.
          tr.units -= units;
          const value = deliver(tr, units, t, "projectedReleased");
          month.deliveredValue += value;
          month.deliveredUnits += units;
          releases.push({
            label: tr.label,
            farmName: tr.farmName,
            monthIndex: t,
            date: monthEndIso(grid, t),
            closingDate: monthEndIso(grid, tr.closeMonth),
            units: round2(units),
            cost: round2(units * o.cost),
            upbDelivered: round2(value),
            ratio: round2(o.ratio),
            source: "projected",
          });
        }
      }
    }

    // 5. Option A: once the target is reached nothing waits for more LPs — every note still held and due is sold.
    if (targetMet()) {
      for (const tr of tranches) {
        tr.reserved = false;
        if (tr.unitsHeld > EPS && tr.closeMonth <= t && tr.saleMonth <= t) sell(tr, tr.unitsHeld, t, month);
      }
    }
    // The deadline: whatever is still held is sold on the last day.
    if (t === k) for (const tr of tranches) if (tr.unitsHeld > EPS && tr.closeMonth <= t) sell(tr, tr.unitsHeld, t, month);

    // 6. Every remaining Portafolio dollar goes to the LPs.
    let paidNow = 0;
    if (cash > EPS) {
      paidNow = cash;
      cashPaid += cash;
      cash = 0;
    }
    cumNotes += month.deliveredValue;
    cumCash += paidNow;
    rows.push({
      monthIndex: t,
      date: t === k && grid.deadlineFraction < 1 ? toIsoDate(base.deadline) : monthEndIso(grid, t),
      lotsClosed: round2(base.closingsByMonth[t] ?? 0),
      freeNotesAvailable: round2(month.freeAvailable),
      notesDelivered: round2(month.deliveredUnits),
      notesDeliveredValue: round2(month.deliveredValue),
      partialReleases: round2(month.releases),
      partialReleaseCost: round2(month.releaseCost),
      cashFarmsBought: month.farms,
      cashFarmCost: round2(month.farmCost),
      notesSold: round2(month.sold),
      noteSaleProceeds: round2(month.proceeds),
      portafolioCashIn: round2(month.cashIn),
      adSpend: round2(ads),
      cashPaidToLPs: round2(paidNow),
      cashCarried: round2(cash),
      cumulativeNotes: round2(cumNotes),
      cumulativeCash: round2(cumCash),
      cumulativeReturned: round2(cumNotes + cumCash),
    });
  }

  // When the capital is back: interpolated inside the month it is crossed.
  let hitMonthIndex: number | null = null;
  let hitDate: string | null = null;
  let lotsNeeded = 0;
  let prev = 0;
  for (const row of rows) {
    const cum = row.cumulativeReturned;
    if (hitMonthIndex === null && cum >= lpCapital - 0.005 && lpCapital > 0) {
      hitMonthIndex = row.monthIndex;
      const frac = cum > prev ? Math.min(1, Math.max(0, (lpCapital - prev) / (cum - prev))) : 1;
      const mo = grid.months[row.monthIndex - 1];
      if (mo) {
        const span = daysBetween(mo.open, mo.end);
        hitDate = toIsoDate(addDays(mo.open, Math.min(span, Math.max(1, Math.ceil(frac * span)))));
      }
      lotsNeeded += frac * (base.closingsByMonth[row.monthIndex] ?? 0);
      break;
    }
    lotsNeeded += base.closingsByMonth[row.monthIndex] ?? 0;
    prev = cum;
  }
  if (lpCapital <= 0) {
    hitMonthIndex = 0;
    hitDate = toIsoDate(base.asOf);
    lotsNeeded = 0;
  }
  const lotsClosedTotal = sum(base.closingsByMonth);
  const totalReturned = delivered + cashPaid;

  // Partner balances the loop never paid.
  let partnerBalance = base.unsoldLotsAtDeadline.partnerBalance;
  for (const tr of tranches) if (tr.waterfall === "fixed" && tr.units > EPS) partnerBalance += claimOf(tr, Math.max(1, k)) * tr.units;
  for (const p of townson.values()) partnerBalance += p.capital;

  return {
    notesPct,
    noteTarget: round2(target),
    notesDelivered: round2(delivered),
    cashPaidToLPs: round2(cashPaid),
    totalReturned: round2(totalReturned),
    feasible: totalReturned >= lpCapital - 0.005,
    notesCovered: delivered >= target - 0.5,
    shortfall: round2(Math.max(0, lpCapital - totalReturned)),
    hitMonthIndex,
    hitDate,
    lotsNeeded: round2(hitMonthIndex === null ? lotsClosedTotal : lotsNeeded),
    lotsClosedTotal: round2(lotsClosedTotal),
    partialReleases: { count: round2(releaseUnits), cost: round2(flows.releases), list: releases },
    cashFarms: { count: purchases.length, cost: round2(sum(purchases.map((p) => p.cost))), purchases, lastPurchaseDate: purchases.length > 0 ? (purchases[purchases.length - 1]?.date ?? null) : null },
    notesSold: { count: round2(soldCount), proceeds: round2(soldProceeds) },
    adSpend: round2(adTotal),
    freeNotesDelivered: round2(freeDelivered),
    rows,
    deliveries,
    package: {
      totalUpb: round2(pkg.upb),
      notes: round2(pkg.notes),
      avgRatePct: pkg.upb > 0 ? round2(pkg.rate / pkg.upb) : null,
      avgTermMonths: pkg.upb > 0 ? round2(pkg.term / pkg.upb) : null,
      avgRemainingMonths: pkg.upb > 0 ? round2(pkg.remaining / pkg.upb) : null,
      existingFree: { notes: round2(pkg.existingFree.notes), upb: round2(pkg.existingFree.upb) },
      existingReleased: { notes: round2(pkg.existingReleased.notes), upb: round2(pkg.existingReleased.upb) },
      projectedFree: { notes: round2(pkg.projectedFree.notes), upb: round2(pkg.projectedFree.upb) },
      projectedReleased: { notes: round2(pkg.projectedReleased.notes), upb: round2(pkg.projectedReleased.upb) },
      cashFarm: { notes: round2(pkg.cashFarm.notes), upb: round2(pkg.cashFarm.upb) },
    },
    partnerBalanceAtDeadline: round2(partnerBalance),
    flows: {
      startingCash: round2(inputs.startingCash),
      projectedReceipts: round2(flows.projectedReceipts),
      existingReceipts: round2(flows.existingReceipts),
      projectedPartnerPaid: round2(flows.projectedPartnerPaid),
      existingPartnerPaid: round2(flows.existingPartnerPaid),
      partialReleaseCost: round2(flows.releases),
      cashFarmCost: round2(flows.farms),
      adSpend: round2(adTotal),
      cashCarriedAtDeadline: round2(Math.min(0, cash)),
    },
  };
}

// ———————————————————————————————————————————————————————————————————————————————————————————————
// The plan: scenario + baseline + the search for maxNotesPct + the verdict
// ———————————————————————————————————————————————————————————————————————————————————————————————

export interface ExodusCoveragePoint {
  pct: number;
  noteTarget: number;
  notesDelivered: number;
  cashPaidToLPs: number;
  totalReturned: number;
  notesCovered: boolean;
  feasible: boolean;
  lotsNeeded: number;
  partialReleases: number;
  partialReleaseCost: number;
  cashFarms: number;
  hitDate: string | null;
}

export interface ExodusVersusCash {
  /** Σ delivered UPB × (1 − noteSaleRatio): the discount the delivered notes would have taken if sold. */
  discountSaved: number;
  /** Baseline lots needed − scenario lots needed (null when the scenario never returns the capital). */
  lotsNotNeeded: number | null;
  /** Months between the baseline's and the scenario's return dates (null when either misses). */
  monthsEarlier: number | null;
  daysEarlier: number | null;
  baselineHitDate: string | null;
  scenarioHitDate: string | null;
}

/**
 * How the 100 %-cash baseline relates to the War Plan it runs on. Production is the War Plan's,
 * month for month. Cash is not the same number by design: the Exodus pays ad spend, sells today's
 * notes, starts from `startingCash` instead of cash kept − owed today, sells notes at the real
 * ratio on the amortized balance, and pays partners lot by lot through the waterfalls instead of
 * charging every farm's whole cost plus the take. The bridge lists each of those, and the residual
 * is what none of them explains.
 */
export interface ExodusReconciliation {
  production: {
    lotsClosed: number;
    warPlanLotsClosed: number;
    farmsBought: number;
    warPlanFarmsBought: number;
    adSpend: number;
    warPlanAdSpend: number;
    /** Every month's closings equal the War Plan's required row within 0.01 lots. */
    closingsMatch: boolean;
  };
  warPlanCash: WarPlanCashReplay;
  baselineCashPaid: number;
  /** Terms that carry `warPlanCash.warPlanTargetAtDeadline` to `baselineCashPaid`; they sum to the gap up to `residual`. */
  bridge: {
    /** The replayed metric − the War Plan's own figure (rounded rows). */
    replayDrift: number;
    /** startingCash − (cash kept − owed today). */
    startingPosition: number;
    /** Projected lots' receipts at the real ratio on the amortized balance − the Oracle's receipts. */
    receipts: number;
    /** Today's notes sold: proceeds − the partners' share (the War Plan does not model them). */
    existingNotes: number;
    /** War Plan farm outlays + take − the partners' share of the projected lots' proceeds. */
    partnerPayments: number;
    /** Partial releases and cash farms (zero in the baseline unless notes are requested). */
    settlementSpend: number;
    adSpend: number;
    /** Cash the loop still owed at the deadline (negative carry), never paid. */
    unpaidCarry: number;
    residual: number;
  };
}

export function reconcileWithWarPlan(base: ExodusBase, baseline: ExodusScenario): ExodusReconciliation {
  const wp = base.warPlan.required;
  const rows = wp.rows.filter((r) => r.monthIndex <= base.k);
  const wpLots = sum(rows.map((r) => r.lotsClosed * (r.monthIndex === base.k ? base.grid.deadlineFraction : 1)));
  const wpAds = sum(rows.map((r) => r.adSpend * (r.monthIndex === base.k ? base.grid.deadlineFraction : 1)));
  const closingsMatch = baseline.rows.every((r) => Math.abs(r.lotsClosed - (rows.find((w) => w.monthIndex === r.monthIndex)?.lotsClosed ?? 0) * (r.monthIndex === base.k ? base.grid.deadlineFraction : 1)) < 0.01);
  const f = baseline.flows;
  const cash = base.warPlanCash;
  const bridge = {
    replayDrift: round2(cash.atDeadline - cash.warPlanTargetAtDeadline),
    startingPosition: round2(f.startingCash - cash.start),
    receipts: round2(f.projectedReceipts - cash.receipts),
    existingNotes: round2(f.existingReceipts - f.existingPartnerPaid),
    partnerPayments: round2(cash.outlays + cash.takePaid - f.projectedPartnerPaid),
    settlementSpend: round2(-(f.partialReleaseCost + f.cashFarmCost)),
    adSpend: round2(-f.adSpend),
    unpaidCarry: round2(f.cashCarriedAtDeadline),
    residual: 0,
  };
  const explained = cash.warPlanTargetAtDeadline + bridge.replayDrift + bridge.startingPosition + bridge.receipts + bridge.existingNotes + bridge.partnerPayments + bridge.settlementSpend + bridge.adSpend + bridge.unpaidCarry;
  bridge.residual = round2(baseline.cashPaidToLPs - explained) || 0;
  return {
    production: {
      lotsClosed: round2(baseline.lotsClosedTotal),
      warPlanLotsClosed: round2(wpLots),
      farmsBought: base.sources.filter((s) => s.kind === "wp_farm").length,
      warPlanFarmsBought: wp.farmsToBuy,
      adSpend: round2(baseline.adSpend),
      warPlanAdSpend: round2(wpAds),
      closingsMatch,
    },
    warPlanCash: cash,
    baselineCashPaid: baseline.cashPaidToLPs,
    bridge,
  };
}

export interface ExodusPlan {
  inputs: ExodusInputs;
  asOf: string;
  deadline: string;
  deadlineMonthIndex: number;
  monthsToDeadline: number;
  scenario: ExodusScenario;
  baseline: ExodusScenario;
  reconciliation: ExodusReconciliation;
  versusCash: ExodusVersusCash;
  maxNotesPct: number;
  coverage: ExodusCoveragePoint[];
  inventory: NoteInventory;
  futureNote: FutureNoteTerms;
  latestViablePurchaseMonth: number;
  latestViablePurchaseDate: string | null;
  /** Fixed-interest lots the plan never sells and the partner balance they carry at the deadline. */
  unsoldLotsAtDeadline: { lots: number; partnerBalance: number };
  /** The War Plan the production comes from (cash mode, target = LP capital). */
  warPlan: { verdict: string; feasible: boolean; closingsPerMonth: number; farmsToBuy: number; lotsNeeded: number; capitalToRaise: number; unfunded: number; adSpendPerMonth: number; targetAtDeadline: number; lastClosingDate: string | null; cashKept: number; owedToday: number };
  verdict: string;
}

/** The scenario at every percent of the slider; `maxNotesPct` is the highest one the note inventory covers by the deadline. */
export function scanNotesPct(base: ExodusBase, inputs: Pick<ExodusInputs, "lpCapital" | "noteSaleRatio" | "startingCash">, max = EXODUS_NOTES_PCT_MAX): { coverage: ExodusCoveragePoint[]; maxNotesPct: number } {
  const coverage: ExodusCoveragePoint[] = [];
  let maxNotesPct = 0;
  for (let pct = 0; pct <= max; pct++) {
    const s = runExodus(base, { ...inputs, notesPct: pct });
    coverage.push({
      pct,
      noteTarget: s.noteTarget,
      notesDelivered: s.notesDelivered,
      cashPaidToLPs: s.cashPaidToLPs,
      totalReturned: s.totalReturned,
      notesCovered: s.notesCovered,
      feasible: s.feasible,
      lotsNeeded: s.lotsNeeded,
      partialReleases: s.partialReleases.count,
      partialReleaseCost: s.partialReleases.cost,
      cashFarms: s.cashFarms.count,
      hitDate: s.hitDate,
    });
    if (s.notesCovered) maxNotesPct = pct;
  }
  return { coverage, maxNotesPct };
}

export function compareVersusCash(scenario: ExodusScenario, baseline: ExodusScenario, noteSaleRatio: number): ExodusVersusCash {
  const a = parseDate(baseline.hitDate);
  const b = parseDate(scenario.hitDate);
  const days = a && b ? daysBetween(b, a) : null;
  return {
    discountSaved: round2(scenario.notesDelivered * (1 - Math.max(0, Math.min(1, noteSaleRatio)))),
    lotsNotNeeded: scenario.hitMonthIndex === null ? null : round2(Math.max(0, (baseline.hitMonthIndex === null ? baseline.lotsClosedTotal : baseline.lotsNeeded) - scenario.lotsNeeded)),
    monthsEarlier: days === null ? null : round2(days / DAYS_PER_MONTH),
    daysEarlier: days,
    baselineHitDate: baseline.hitDate,
    scenarioHitDate: scenario.hitDate,
  };
}

const plural = (n: number, one: string, many: string) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? one : many}`;

export type ExodusLang = "en" | "es";

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "Mar 2027" / "mar 2027" from an ISO date. */
export function exodusMonthLabel(iso: string, lang: ExodusLang): string {
  if (lang === "en") return warPlanMonthLabel(iso);
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : `${MONTHS_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** One sentence, in English or Spanish. Pure so it can be tested. */
export function exodusVerdict(plan: Pick<ExodusPlan, "scenario" | "inputs" | "maxNotesPct" | "deadline" | "deadlineMonthIndex">, lang: ExodusLang = "en"): string {
  const s = plan.scenario;
  const pct = `${Math.round(s.notesPct)}%`;
  const lp = usdCompact(plan.inputs.lpCapital);
  const es = lang === "es";
  if (plan.deadlineMonthIndex === 0) {
    return es
      ? `La fecha límite ${plan.deadline} no está en el futuro: nada puede liberarse ni venderse antes.`
      : `The deadline ${plan.deadline} is not in the future: nothing can be freed or sold before it.`;
  }
  if (!s.feasible) {
    const atMost = s.notesCovered ? "" : es ? ` — el inventario cubre como máximo ${plan.maxNotesPct}%` : ` — the inventory can cover at most ${plan.maxNotesPct}%`;
    const notes = s.notesPct > 0 ? (es ? ` Los pagarés cubren ${usdCompact(s.notesDelivered)} de la meta de ${usdCompact(s.noteTarget)}${atMost}.` : ` Notes cover ${usdCompact(s.notesDelivered)} of the ${usdCompact(s.noteTarget)} target${atMost}.`) : "";
    return es
      ? `No es factible con ${pct} en pagarés: se devuelven ${usdCompact(s.totalReturned)} de ${lp} al ${plan.deadline}, faltan ${usdCompact(s.shortfall)} (${usdCompact(s.notesDelivered)} en pagarés, ${usdCompact(s.cashPaidToLPs)} en efectivo).${notes}`
      : `Not feasible with ${pct} in notes: ${usdCompact(s.totalReturned)} of ${lp} is returned by ${plan.deadline}, ${usdCompact(s.shortfall)} short (${usdCompact(s.notesDelivered)} in notes, ${usdCompact(s.cashPaidToLPs)} in cash).${notes}`;
  }
  const soldN = Math.round(s.notesSold.count);
  const sold = es ? `vender ${plural(soldN, "pagaré", "pagarés")}` : `sell ${plural(soldN, "note", "notes")}`;
  const cash = es ? `pagar ${usdCompact(s.cashPaidToLPs)} a los LP en efectivo` : `pay ${usdCompact(s.cashPaidToLPs)} to LPs in cash`;
  if (s.notesPct <= 0 || s.notesDelivered <= 0) return es ? `Con ${pct} en pagarés: ${sold} y ${cash}.` : `With ${pct} in notes: ${sold} and ${cash}.`;
  const freed = s.package.existingReleased.upb + s.package.projectedReleased.upb + s.package.cashFarm.upb;
  const relN = Math.round(s.partialReleases.count);
  const releases =
    s.partialReleases.count > 0
      ? es
        ? `mediante ${plural(relN, "liberación parcial", "liberaciones parciales")} por ${usdCompact(s.partialReleases.cost)}`
        : `through ${plural(relN, "partial release", "partial releases")} costing ${usdCompact(s.partialReleases.cost)}`
      : es
        ? "sin liberaciones parciales"
        : "with no partial release";
  const lastFarm = s.cashFarms.lastPurchaseDate ? exodusMonthLabel(s.cashFarms.lastPurchaseDate, lang) : "—";
  const farms =
    s.cashFarms.count > 0
      ? es
        ? `comprar ${plural(s.cashFarms.count, "finca con efectivo propio", "fincas con efectivo propio")} antes de ${lastFarm}`
        : `buy ${plural(s.cashFarms.count, "cash farm", "cash farms")} before ${lastFarm}`
      : es
        ? "no comprar fincas con efectivo propio"
        : "buy no cash farm";
  const head =
    freed > 0.5
      ? es
        ? `liberar ${usdCompact(freed)} ${releases}`
        : `free ${usdCompact(freed)} ${releases}`
      : es
        ? `entregar ${usdCompact(s.notesDelivered)} en pagarés que ya están libres, sin liberaciones parciales`
        : `deliver ${usdCompact(s.notesDelivered)} of notes that are already free, with no partial release`;
  return es
    ? `Con ${pct} en pagarés (${usdCompact(s.notesDelivered)} entregados): ${head}, ${farms}, ${sold} y ${cash}.`
    : `With ${pct} in notes (${usdCompact(s.notesDelivered)} delivered): ${head}, ${farms}, ${sold} and ${cash}.`;
}

/** Parts a caller may compute once and reuse: the base changes with the deadline, the scan with everything but `notesPct`. */
export interface ExodusPrepared {
  base?: ExodusBase;
  scan?: ReturnType<typeof scanNotesPct>;
}

/** The whole page in one call: prepare, run, compare with 100 % cash, search the slider, speak the verdict. */
export function solveExodus(inputs: ExodusInputs, ctx: ExodusContext, prepared: ExodusPrepared = {}): ExodusPlan {
  const base = prepared.base ?? prepareExodus(inputs, ctx);
  const scenario = runExodus(base, inputs);
  const baseline = runExodus(base, { ...inputs, notesPct: 0 });
  const { coverage, maxNotesPct } = prepared.scan ?? scanNotesPct(base, inputs);
  const plan: Omit<ExodusPlan, "verdict"> = {
    inputs,
    asOf: toIsoDate(base.asOf),
    deadline: inputs.deadline,
    deadlineMonthIndex: base.k,
    monthsToDeadline: round2(base.grid.monthsToDeadline),
    scenario,
    baseline,
    reconciliation: reconcileWithWarPlan(base, baseline),
    versusCash: compareVersusCash(scenario, baseline, inputs.noteSaleRatio),
    maxNotesPct,
    coverage,
    inventory: base.inventory,
    futureNote: base.futureNote,
    latestViablePurchaseMonth: base.latestViablePurchaseMonth,
    latestViablePurchaseDate: base.latestViablePurchaseMonth > 0 ? monthEndIso(base.grid, base.latestViablePurchaseMonth) : null,
    unsoldLotsAtDeadline: base.unsoldLotsAtDeadline,
    warPlan: {
      verdict: base.warPlan.verdict,
      feasible: base.warPlan.feasible,
      closingsPerMonth: base.warPlan.required.closingsPerMonth,
      farmsToBuy: base.warPlan.required.farmsToBuy,
      lotsNeeded: base.warPlan.required.lotsNeeded,
      capitalToRaise: base.warPlan.required.capitalToRaise,
      unfunded: base.warPlan.required.unfunded,
      adSpendPerMonth: base.warPlan.required.adSpendPerMonth,
      targetAtDeadline: base.warPlan.required.targetAtDeadline,
      lastClosingDate: base.warPlan.lastClosingDate,
      cashKept: base.warPlan.ledger.cashKept,
      owedToday: base.warPlan.ledger.owedToday,
    },
  };
  return { ...plan, verdict: exodusVerdict(plan) };
}

/** The inputs /exodus starts from, each next to the real figure it came from. */
export function deriveExodusDefaults(ctx: ExodusContext, warPlan: WarPlanInputs): ExodusDefaults {
  const ratio = noteSaleRatioReal(ctx.snapshot.notes, ctx.snapshot.noteSales, ctx.oracleDefaults.noteSalePct / 100);
  const plan = solveWarPlan({ ...warPlan, target: LP_CAPITAL_TO_RETURN, deadline: GOAL_DEADLINE, targetMode: "cash_in_bank" }, ctx);
  return {
    inputs: {
      lpCapital: LP_CAPITAL_TO_RETURN,
      notesPct: EXODUS_DEFAULT_NOTES_PCT,
      deadline: GOAL_DEADLINE,
      noteSaleRatio: ratio.used,
      excludedNoteCodes: [...EXODUS_DEFAULT_EXCLUDED_NOTE_CODES],
      startingCash: EXODUS_DEFAULT_STARTING_CASH,
      warPlan,
    },
    real: {
      lpCapital: LP_CAPITAL_TO_RETURN,
      deadline: GOAL_DEADLINE,
      noteSaleRatio: ratio,
      cashKeptToday: plan.ledger.cashKept,
      owedToday: plan.ledger.owedToday,
      excludedNoteCodes: [...EXODUS_DEFAULT_EXCLUDED_NOTE_CODES],
      futureNote: futureNoteTerms(ctx.snapshot, ctx.oracleDefaults.avgSalePrice, ctx.oracleDefaults.downPaymentPct),
    },
  };
}
