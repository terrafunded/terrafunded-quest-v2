/**
 * Raw row shapes as they come out of the Payments database.
 *
 * Every field here maps 1:1 to a column listed in `payments_schema.md`.
 * These are *inputs* to the domain layer; the domain never mutates them.
 */

export type DealType = "fixed_interest" | "profit_share" | "own_capital";
export type FileCaseStatus = "active" | "completed" | "cancelled";
export type FileCaseDealType = "financed" | "cash";
export type NoteStatus = "active" | "paid_off" | "default";
export type DistributionKind = "capital_return" | "profit_share" | (string & {});

export interface FarmAcquisitionRow {
  id: string;
  farm_name: string | null;
  county: string | null;
  closing_date: string | null;
  funding_date: string | null;
  total_lots: number | null;
  total_acres: number | null;
  investor_id: string | null;
  investor_capital: number | null;
  deal_type: DealType | string | null;
  annual_interest_rate: number | null;
  profit_share_pct: number | null;
  maturity_months: number | null;
  extension_months: number | null;
  ledger_start_date: string | null;
  created_at: string | null;
}

export interface PropertyRow {
  id: string;
  name: string | null;
  lot_number: string | null;
  farm_acquisition_id: string | null;
  investor_id: string | null;
  county: string | null;
  state: string | null;
  acres: number | null;
  created_at: string | null;
}

export interface FileCaseRow {
  id: string;
  client_id: string | null;
  property_id: string | null;
  status: FileCaseStatus | string | null;
  deal_type: FileCaseDealType | string | null;
  business_line: string | null;
  asset_type: string | null;
  project_name: string | null;
  lot_number: string | null;
  sale_price: number | null;
  down_payment: number | null;
  monthly_payment: number | null;
  interest_rate: number | null;
  term_years: number | null;
  reservation_date: string | null;
  reservation_amount: number | null;
  closing_date: string | null;
  estimated_closing_date: string | null;
  note_buyer_destination: string | null;
  assigned_seller: string | null;
  current_stage_number: number | null;
  current_stage_name: string | null;
  progress_pct: number | null;
  has_blocked_stages: boolean | null;
  has_overdue_stages: boolean | null;
  days_since_start: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface NoteRow {
  id: string;
  client_id: string | null;
  property_id: string | null;
  note_code: string | null;
  original_amount: number | null;
  down_payment: number | null;
  financed_amount: number | null;
  interest_rate: number | null;
  term_months: number | null;
  monthly_payment: number | null;
  start_date: string | null;
  first_payment_date: string | null;
  status: NoteStatus | string | null;
  current_upb: number | null;
  is_sold: boolean | null;
  is_historical: boolean | null;
  is_test: boolean | null;
  asset_type: string | null;
  business_line: string | null;
  commercial_status: string | null;
  created_at: string | null;
}

export interface NoteSaleRow {
  id: string;
  note_id: string | null;
  buyer_id: string | null;
  buyer_name: string | null;
  sale_price: number | null;
  sale_date: string | null;
  discount_from_upb: number | null;
  servicing_retained: boolean | null;
  created_at: string | null;
}

export interface InvestorDistributionRow {
  id: string;
  farm_acquisition_id: string | null;
  investor_id: string | null;
  distribution_date: string | null;
  amount: number | null;
  kind: DistributionKind | null;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface PropertyCostRow {
  id: string;
  farm_acquisition_id: string | null;
  property_id: string | null;
  cost_date: string | null;
  amount: number | null;
  category: string | null;
  cost_class: string | null;
  description: string | null;
  created_at: string | null;
}

export interface InvestorRow {
  id: string;
  name: string | null;
  contact: string | null;
  notes: string | null;
  created_at: string | null;
}

/** `ssn_itin_encrypted` is deliberately absent and must never be selected. */
export interface ClientRow {
  id: string;
  full_name: string | null;
  is_test: boolean | null;
  created_at: string | null;
}

/**
 * One row of Payments' `compute_lot_ledger(p_farm_id, p_as_of)` RPC, exactly as returned
 * (column names observed on 2026-09-11, see `payments_schema.md`). Read-only; stored in the
 * fixture by `scripts/snapshot.ts` so `domain/lotLedger.ts` can prove parity offline.
 */
export interface LotLedgerRpcRow {
  property_id: string;
  lot_number: string | null;
  lot_capital: number;
  accrued_return: number;
  credits: number;
  lot_balance: number;
  floor_amount: number;
  released_at: string | null;
  residual: number;
  first_cost_date: string | null;
  credit_detail: { dt: string; amt: number; kind: string }[] | null;
}

/** The RPC's result for one farm, with the arguments it was called with. */
export interface LotLedgerRpcResult {
  farmId: string;
  farmName: string | null;
  asOf: string;
  rows: LotLedgerRpcRow[];
}

/** Everything the domain layer needs, in one bag. */
export interface PaymentsSnapshot {
  farmAcquisitions: FarmAcquisitionRow[];
  properties: PropertyRow[];
  fileCases: FileCaseRow[];
  notes: NoteRow[];
  noteSales: NoteSaleRow[];
  investorDistributions: InvestorDistributionRow[];
  propertyCosts: PropertyCostRow[];
  investors: InvestorRow[];
  clients: ClientRow[];
}
