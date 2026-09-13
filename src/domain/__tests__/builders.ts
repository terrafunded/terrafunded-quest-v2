import type {
  ClientRow,
  FarmAcquisitionRow,
  FileCaseRow,
  InvestorDistributionRow,
  InvestorRow,
  NoteRow,
  NoteSaleRow,
  PaymentsSnapshot,
  PropertyCostRow,
  PropertyRow,
} from "../types";

let seq = 0;
const id = (prefix: string) => `${prefix}-${++seq}`;

export function farm(over: Partial<FarmAcquisitionRow> = {}): FarmAcquisitionRow {
  return {
    id: id("farm"),
    farm_name: "Testland",
    county: "Test",
    closing_date: "2026-01-01",
    funding_date: "2026-01-01",
    total_lots: 10,
    total_acres: 100,
    investor_id: null,
    investor_capital: 500_000,
    deal_type: "own_capital",
    annual_interest_rate: 0,
    profit_share_pct: null,
    maturity_months: 36,
    extension_months: null,
    ledger_start_date: null,
    created_at: null,
    ...over,
  };
}

export function property(farmId: string, lotNumber: number, over: Partial<PropertyRow> = {}): PropertyRow {
  return {
    id: id("prop"),
    name: `Testland — Lot ${lotNumber}`,
    lot_number: String(lotNumber),
    farm_acquisition_id: farmId,
    investor_id: null,
    county: "Test",
    state: "TX",
    acres: 10,
    created_at: null,
    ...over,
  };
}

export function fileCase(propertyId: string, over: Partial<FileCaseRow> = {}): FileCaseRow {
  return {
    id: id("fc"),
    client_id: "client-1",
    property_id: propertyId,
    status: "active",
    deal_type: "financed",
    business_line: "terrafunded",
    asset_type: "land",
    project_name: "Testland",
    lot_number: null,
    sale_price: 120_000,
    down_payment: 6_000,
    monthly_payment: null,
    interest_rate: null,
    term_years: null,
    reservation_date: "2026-02-01",
    reservation_amount: 1_000,
    closing_date: null,
    estimated_closing_date: null,
    note_buyer_destination: null,
    assigned_seller: null,
    current_stage_name: null,
    progress_pct: null,
    days_since_start: null,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: null,
    ...over,
  };
}

export function note(propertyId: string, over: Partial<NoteRow> = {}): NoteRow {
  return {
    id: id("note"),
    client_id: "client-1",
    property_id: propertyId,
    note_code: "TST-L01",
    original_amount: 120_000,
    down_payment: 6_000,
    financed_amount: 114_000,
    interest_rate: 0.1,
    term_months: 120,
    monthly_payment: null,
    start_date: "2026-03-01",
    first_payment_date: null,
    status: "active",
    current_upb: null,
    is_sold: false,
    is_historical: false,
    is_test: false,
    asset_type: "land",
    business_line: "terrafunded",
    commercial_status: null,
    created_at: null,
    ...over,
  };
}

export function noteSale(noteId: string, over: Partial<NoteSaleRow> = {}): NoteSaleRow {
  return {
    id: id("sale"),
    note_id: noteId,
    buyer_id: null,
    buyer_name: "Note Buyer LLC",
    sale_price: 90_000,
    sale_date: "2026-05-01",
    discount_from_upb: null,
    servicing_retained: false,
    created_at: null,
    ...over,
  };
}

export function distribution(farmId: string, over: Partial<InvestorDistributionRow> = {}): InvestorDistributionRow {
  return {
    id: id("dist"),
    farm_acquisition_id: farmId,
    investor_id: null,
    distribution_date: "2026-04-01",
    amount: 10_000,
    kind: "capital_return",
    payment_method: "transfer",
    reference_number: null,
    notes: null,
    created_at: null,
    ...over,
  };
}

export function cost(farmId: string, over: Partial<PropertyCostRow> = {}): PropertyCostRow {
  return {
    id: id("cost"),
    farm_acquisition_id: farmId,
    property_id: null,
    cost_date: "2026-01-01",
    amount: 500_000,
    category: "purchase",
    cost_class: "mandatory",
    description: null,
    created_at: null,
    ...over,
  };
}

export function investor(over: Partial<InvestorRow> = {}): InvestorRow {
  return { id: id("inv"), name: "Sponsor", contact: null, notes: null, created_at: null, ...over };
}

export function client(over: Partial<ClientRow> = {}): ClientRow {
  return { id: "client-1", full_name: "Buyer One", is_test: false, created_at: null, ...over };
}

export function snapshot(over: Partial<PaymentsSnapshot> = {}): PaymentsSnapshot {
  return {
    farmAcquisitions: [],
    properties: [],
    fileCases: [],
    notes: [],
    noteSales: [],
    investorDistributions: [],
    propertyCosts: [],
    investors: [],
    clients: [client()],
    ...over,
  };
}

export const ASOF = new Date("2026-09-11T00:00:00Z");
