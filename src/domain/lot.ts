import type {
  ClientRow,
  FarmAcquisitionRow,
  FileCaseRow,
  InvestorRow,
  NoteRow,
  NoteSaleRow,
  PropertyCostRow,
  PropertyRow,
} from "./types";
import type { InterestLedger } from "./interest";
import { daysBetween, parseDate, toIsoDate } from "./dates";
import { groupBy, indexBy, round2, sum } from "./math";
import { LEGACY_FARM_NAMES } from "../config/goal";

export type LotStage = "available" | "reserved" | "closed" | "note_sold";
export const LOT_STAGES: readonly LotStage[] = ["available", "reserved", "closed", "note_sold"];

export type PriceSource = "note" | "file_case" | null;

export interface Lot {
  propertyId: string;
  farmId: string;
  farmName: string;
  farmDealType: string | null;
  investorId: string | null;
  investorName: string | null;
  lotNumber: string | null;
  /** Display name, e.g. "Wichita — Lot 14". */
  name: string;
  acres: number | null;

  stage: LotStage;
  priceSource: PriceSource;
  dealType: "financed" | "cash" | null;

  landCost: number;
  /** Price per the GOAL.md rule: note.original_amount, else file_cases.sale_price. */
  salePrice: number | null;
  downPayment: number | null;
  /** Raw contract price on the file case (what the ledger totals row reconciles to). */
  fileCaseSalePrice: number | null;
  fileCaseDownPayment: number | null;
  noteOriginalAmount: number | null;
  noteDownPayment: number | null;
  grossProfit: number | null;
  investorTake: number | null;
  netProfit: number | null;
  cashRealized: number;

  fileCaseId: string | null;
  fileCaseStatus: string | null;
  clientId: string | null;
  /** Null when the buyer is a test client or unknown. */
  buyerName: string | null;
  buyerIsTestClient: boolean;
  reservationDate: string | null;
  /** Effective closing date: file_cases.closing_date ?? notes.start_date. */
  closeDate: string | null;
  estimatedClosingDate: string | null;
  daysInPipeline: number | null;

  noteId: string | null;
  noteCode: string | null;
  noteFinancedAmount: number | null;
  noteStartDate: string | null;
  noteIsSold: boolean;
  noteSaleId: string | null;
  noteSalePrice: number | null;
  noteSaleDate: string | null;
  noteBuyerName: string | null;
}

export interface FarmContext {
  farm: FarmAcquisitionRow;
  landCostPerLot: number;
  /** Capital that lot economics are based on (investor_capital, or Σ purchase costs). */
  capitalBasis: number;
  capitalBasisSource: "investor_capital" | "property_costs" | "none";
  interest: InterestLedger;
  lotCount: number;
}

export interface LotInputs {
  farms: FarmAcquisitionRow[];
  properties: PropertyRow[];
  fileCases: FileCaseRow[];
  notes: NoteRow[];
  noteSales: NoteSaleRow[];
  propertyCosts: PropertyCostRow[];
  clients: ClientRow[];
  investors: InvestorRow[];
  interestByFarm: Map<string, InterestLedger>;
  asOf: Date;
}

/** A farm is "subdivided" when it was carved into more than one lot and is not a documented legacy one-off. */
export function isSubdividedFarm(farm: FarmAcquisitionRow): boolean {
  if ((farm.total_lots ?? 0) <= 1) return false;
  return !LEGACY_FARM_NAMES.includes(farm.farm_name ?? "");
}

export function farmCapitalBasis(
  farm: FarmAcquisitionRow,
  propertyCosts: PropertyCostRow[],
): { basis: number; source: FarmContext["capitalBasisSource"] } {
  if (farm.investor_capital !== null && farm.investor_capital !== undefined) {
    return { basis: farm.investor_capital, source: "investor_capital" };
  }
  const costs = sum(propertyCosts.filter((c) => c.farm_acquisition_id === farm.id).map((c) => c.amount));
  return costs > 0 ? { basis: costs, source: "property_costs" } : { basis: 0, source: "none" };
}

export function landCostPerLot(farm: FarmAcquisitionRow, propertyCosts: PropertyCostRow[]): number {
  const lots = farm.total_lots ?? 0;
  if (lots <= 0) return 0;
  return farmCapitalBasis(farm, propertyCosts).basis / lots;
}

/** Picks the effective file case for a lot: ignore cancelled, prefer completed, then newest. */
export function pickFileCase(cases: FileCaseRow[]): FileCaseRow | null {
  const live = cases.filter((c) => c.status === "active" || c.status === "completed");
  if (live.length === 0) return null;
  return [...live].sort((a, b) => {
    if (a.status !== b.status) return a.status === "completed" ? -1 : 1;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  })[0] ?? null;
}

/** Picks the effective note for a lot: prefer sold, then newest start_date. */
export function pickNote(notes: NoteRow[]): NoteRow | null {
  if (notes.length === 0) return null;
  return [...notes].sort((a, b) => {
    if (!!a.is_sold !== !!b.is_sold) return a.is_sold ? -1 : 1;
    return (b.start_date ?? "").localeCompare(a.start_date ?? "");
  })[0] ?? null;
}

export function deriveStage(fileCase: FileCaseRow | null, note: NoteRow | null, noteSale: NoteSaleRow | null): LotStage {
  if (note) {
    return note.is_sold || noteSale ? "note_sold" : "closed";
  }
  if (!fileCase) return "available";
  if (fileCase.status === "completed" || fileCase.closing_date) return "closed";
  return "reserved";
}

export interface LotEconomicsInput {
  stage: LotStage;
  farmDealType: string | null;
  profitSharePct: number | null;
  landCost: number;
  /** This lot's pro-rata share of the farm's accrued interest (fixed_interest farms only). */
  interestShare: number;
  salePrice: number | null;
  downPayment: number | null;
  dealType: "financed" | "cash" | null;
  noteSalePrice: number | null;
}

export interface LotEconomics {
  grossProfit: number | null;
  investorTake: number | null;
  netProfit: number | null;
  cashRealized: number;
}

/**
 * The money rules for one lot, isolated so they can be tested without rows.
 *
 * - grossProfit = salePrice − landCost (null while unsold: available/reserved-with-no-price)
 * - investorTake: profit_share → gross × pct; fixed_interest → interest share; own_capital → 0
 * - netProfit = gross − investorTake, only for closed / note_sold lots
 * - cashRealized: cash deals pay the full price at closing; financed deals bring the
 *   down payment at closing plus the note sale price once the note is sold.
 */
export function computeLotEconomics(i: LotEconomicsInput): LotEconomics {
  const sold = i.stage === "closed" || i.stage === "note_sold";
  const hasPrice = i.salePrice !== null && i.salePrice !== undefined;

  const grossProfit = hasPrice ? round2((i.salePrice as number) - i.landCost) : null;

  let investorTake: number | null;
  switch (i.farmDealType) {
    case "profit_share":
      investorTake = grossProfit === null ? null : round2((grossProfit * (i.profitSharePct ?? 0)) / 100);
      break;
    case "fixed_interest":
      investorTake = round2(i.interestShare);
      break;
    default:
      investorTake = 0;
  }

  const netProfit = sold && grossProfit !== null ? round2(grossProfit - (investorTake ?? 0)) : null;

  let cashRealized = 0;
  if (sold) {
    if (i.dealType === "cash") cashRealized = i.salePrice ?? 0;
    else cashRealized = (i.downPayment ?? 0) + (i.noteSalePrice ?? 0);
  }

  return { grossProfit, investorTake, netProfit, cashRealized: round2(cashRealized) };
}

export function buildFarmContexts(inputs: Pick<LotInputs, "farms" | "properties" | "propertyCosts" | "interestByFarm" | "asOf">): Map<string, FarmContext> {
  const out = new Map<string, FarmContext>();
  const propsByFarm = groupBy(inputs.properties, (p) => p.farm_acquisition_id);
  for (const farm of inputs.farms) {
    if (!isSubdividedFarm(farm)) continue;
    const { basis, source } = farmCapitalBasis(farm, inputs.propertyCosts);
    const interest = inputs.interestByFarm.get(farm.id);
    if (!interest) continue;
    out.set(farm.id, {
      farm,
      landCostPerLot: landCostPerLot(farm, inputs.propertyCosts),
      capitalBasis: basis,
      capitalBasisSource: source,
      interest,
      lotCount: propsByFarm.get(farm.id)?.length ?? 0,
    });
  }
  return out;
}

/** Computes every lot on every subdivided farm. Order: by farm funding date, then lot number. */
export function computeLots(inputs: LotInputs): Lot[] {
  const contexts = buildFarmContexts(inputs);
  const casesByProperty = groupBy(inputs.fileCases, (c) => c.property_id);
  const notesByProperty = groupBy(inputs.notes, (n) => n.property_id);
  const saleByNote = indexBy(inputs.noteSales, (s) => s.note_id);
  const clientById = indexBy(inputs.clients, (c) => c.id);
  const investorById = indexBy(inputs.investors, (i) => i.id);

  const lots: Lot[] = [];

  for (const property of inputs.properties) {
    const ctx = property.farm_acquisition_id ? contexts.get(property.farm_acquisition_id) : undefined;
    if (!ctx) continue;
    const farm = ctx.farm;

    const fileCase = pickFileCase(casesByProperty.get(property.id) ?? []);
    const note = pickNote(notesByProperty.get(property.id) ?? []);
    const noteSale = note ? saleByNote.get(note.id) ?? null : null;
    const stage = deriveStage(fileCase, note, noteSale);

    let priceSource: PriceSource = null;
    let salePrice: number | null = null;
    let downPayment: number | null = null;
    if (note) {
      priceSource = "note";
      salePrice = note.original_amount;
      downPayment = note.down_payment;
    } else if (fileCase) {
      priceSource = "file_case";
      salePrice = fileCase.sale_price;
      downPayment = fileCase.down_payment;
    }

    const dealType: Lot["dealType"] =
      fileCase?.deal_type === "cash" ? "cash" : fileCase?.deal_type === "financed" || note ? "financed" : null;

    // Pro-rata by landCost; every lot on a farm shares the same landCost, so this is 1/N.
    const farmLandCostTotal = ctx.landCostPerLot * ctx.lotCount;
    const interestShare =
      farm.deal_type === "fixed_interest" && farmLandCostTotal > 0
        ? ctx.interest.accruedToDate * (ctx.landCostPerLot / farmLandCostTotal)
        : 0;

    const econ = computeLotEconomics({
      stage,
      farmDealType: farm.deal_type,
      profitSharePct: farm.profit_share_pct,
      landCost: ctx.landCostPerLot,
      interestShare,
      salePrice,
      downPayment,
      dealType,
      noteSalePrice: noteSale?.sale_price ?? null,
    });

    const reservation = parseDate(fileCase?.reservation_date);
    const close = parseDate(fileCase?.closing_date) ?? parseDate(note?.start_date);
    // Null when unknown, including when the reservation is dated after the close
    // (a data disagreement the quality panel reports; we do not clamp it to 0).
    let daysInPipeline: number | null = null;
    if (reservation) {
      const end = close ?? (stage === "reserved" ? inputs.asOf : null);
      if (end) {
        const d = daysBetween(reservation, end);
        daysInPipeline = d >= 0 ? d : null;
      }
    }

    const clientId = fileCase?.client_id ?? note?.client_id ?? null;
    const client = clientId ? clientById.get(clientId) : undefined;
    const buyerIsTestClient = !!clientId && !client;
    const investorId = farm.investor_id ?? property.investor_id ?? null;

    lots.push({
      propertyId: property.id,
      farmId: farm.id,
      farmName: farm.farm_name ?? "Unnamed farm",
      farmDealType: farm.deal_type,
      investorId,
      investorName: investorId ? investorById.get(investorId)?.name ?? null : null,
      lotNumber: property.lot_number,
      name: property.name ?? `${farm.farm_name ?? "Farm"} — Lot ${property.lot_number ?? "?"}`,
      acres: property.acres,
      stage,
      priceSource,
      dealType,
      landCost: round2(ctx.landCostPerLot),
      salePrice,
      downPayment,
      fileCaseSalePrice: fileCase?.sale_price ?? null,
      fileCaseDownPayment: fileCase?.down_payment ?? null,
      noteOriginalAmount: note?.original_amount ?? null,
      noteDownPayment: note?.down_payment ?? null,
      grossProfit: econ.grossProfit,
      investorTake: econ.investorTake,
      netProfit: econ.netProfit,
      cashRealized: econ.cashRealized,
      fileCaseId: fileCase?.id ?? null,
      fileCaseStatus: fileCase?.status ?? null,
      clientId,
      buyerName: client?.full_name ?? null,
      buyerIsTestClient,
      reservationDate: reservation ? toIsoDate(reservation) : null,
      closeDate: close ? toIsoDate(close) : null,
      estimatedClosingDate: fileCase?.estimated_closing_date ?? null,
      daysInPipeline,
      noteId: note?.id ?? null,
      noteCode: note?.note_code ?? null,
      noteFinancedAmount: note?.financed_amount ?? null,
      noteStartDate: note?.start_date ?? null,
      noteIsSold: !!note?.is_sold,
      noteSaleId: noteSale?.id ?? null,
      noteSalePrice: noteSale?.sale_price ?? null,
      noteSaleDate: noteSale?.sale_date ?? null,
      noteBuyerName: noteSale?.buyer_name ?? null,
    });
  }

  const farmOrder = new Map(inputs.farms.map((f, i) => [f.id, `${f.funding_date ?? f.closing_date ?? "9999"}-${i}`]));
  return lots.sort((a, b) => {
    const fa = farmOrder.get(a.farmId) ?? "";
    const fb = farmOrder.get(b.farmId) ?? "";
    if (fa !== fb) return fa.localeCompare(fb);
    return lotNumberValue(a.lotNumber) - lotNumberValue(b.lotNumber);
  });
}

export function lotNumberValue(lotNumber: string | null): number {
  const n = Number.parseInt(lotNumber ?? "", 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

export function isSold(lot: Pick<Lot, "stage">): boolean {
  return lot.stage === "closed" || lot.stage === "note_sold";
}
