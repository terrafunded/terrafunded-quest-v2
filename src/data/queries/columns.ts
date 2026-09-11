/**
 * Explicit column lists for every table Quest reads.
 *
 * Every name here must exist in `payments_schema.md`. There is intentionally no
 * `"*"` anywhere in the data layer, and `clients.ssn_itin_encrypted` is never listed.
 */
export const FARM_ACQUISITION_COLUMNS =
  "id, farm_name, county, closing_date, funding_date, total_lots, total_acres, investor_id, investor_capital, deal_type, annual_interest_rate, profit_share_pct, maturity_months, extension_months, ledger_start_date, created_at";

export const PROPERTY_COLUMNS =
  "id, name, lot_number, farm_acquisition_id, investor_id, county, state, acres, created_at";

export const FILE_CASE_COLUMNS =
  "id, client_id, property_id, status, deal_type, business_line, asset_type, project_name, lot_number, sale_price, down_payment, monthly_payment, interest_rate, term_years, reservation_date, reservation_amount, closing_date, estimated_closing_date, note_buyer_destination, assigned_seller, current_stage_name, progress_pct, days_since_start, created_at, updated_at";

export const NOTE_COLUMNS =
  "id, client_id, property_id, note_code, original_amount, down_payment, financed_amount, interest_rate, term_months, monthly_payment, start_date, first_payment_date, status, current_upb, is_sold, is_historical, is_test, asset_type, business_line, commercial_status, created_at";

export const NOTE_SALE_COLUMNS =
  "id, note_id, buyer_id, buyer_name, sale_price, sale_date, discount_from_upb, servicing_retained, created_at";

export const INVESTOR_DISTRIBUTION_COLUMNS =
  "id, farm_acquisition_id, investor_id, distribution_date, amount, kind, payment_method, reference_number, notes, created_at";

export const PROPERTY_COST_COLUMNS =
  "id, farm_acquisition_id, property_id, cost_date, amount, category, cost_class, description, created_at";

export const INVESTOR_COLUMNS = "id, name, contact, notes, created_at";

export const CLIENT_COLUMNS = "id, full_name, is_test, created_at";
