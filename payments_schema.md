# Payments — read-only schema reference for Quest v2

Source of truth: `information_schema.columns` on Supabase project `rruscfrrukagpgymifhq`,
introspected 2026-09-10. **Only the columns listed here exist. Do not invent columns.
If you need something that is not here, write it in OPEN_QUESTIONS.md and move on.**

Quest v2 has **SELECT-only** access. It never inserts, updates, deletes, or runs migrations.

Row counts at introspection time: file_cases 128 · notes 56 · properties 129 · clients 105 ·
farm_acquisitions 13 · investors 7 · investor_distributions 32 · property_costs 13 · note_sales 15.

---

## farm_acquisitions  (a "farm" = a parcel Terrafunded bought to subdivide)

| column | type | notes |
|---|---|---|
| id | uuid | PK |
| farm_name | text | e.g. Eastland, Wichita, Avery, Franklin, Franklin 2, Freestone, Lamar, Titus, Promised Valley, Olney, Red River 1, Ben White, Sharps Rd |
| county | text | |
| closing_date | date | date Terrafunded closed the purchase |
| funding_date | date | date investor capital was deployed |
| total_lots | integer | lots the farm was carved into |
| total_acres | numeric | |
| investor_id | uuid | FK → investors.id (nullable) |
| investor_capital | numeric | capital contributed by the investor (nullable) |
| deal_type | text | observed values: `fixed_interest`, `profit_share`, `own_capital` |
| annual_interest_rate | numeric | for `fixed_interest` deals |
| profit_share_pct | numeric | for `profit_share` deals (investor's share) |
| maturity_months | integer | |
| extension_months | integer | |
| addendum_signed_at | date | |
| ledger_start_date | date | |
| owner_entity_id | uuid | FK → issuing_entities.id |
| terrafunded_property_id | text | |
| notes | text | |
| created_at, updated_at | timestamptz | |

Real values worth knowing: Wichita (32 lots, $1,197,000, profit_share, Townson Family) ·
Lamar (9 lots, $475,000, profit_share, Townson Family) · Eastland (11 lots, $550,000, fixed_interest,
Kevin Concua) · Avery (14 lots, $513,828, fixed_interest, Kevin Concua) · Franklin (6 lots, $383,500,
fixed_interest, Julio Arriola) · Franklin 2 (5 lots, $334,800, fixed_interest, Kevin Concua) ·
Freestone (7 lots, $364,520, fixed_interest, Rony Schumann) · Titus (6 lots, $379,000, fixed_interest,
Doctores Motta) · Promised Valley (19 lots, $790,000, own_capital, Portafolio Diversificado).
Ben White, Sharps Rd, Olney, Red River 1 are legacy/one-off properties with no lot subdivision.

## properties  (one row per lot)

| column | type | notes |
|---|---|---|
| id | uuid | PK |
| name | text | e.g. "Wichita — Lot 14" |
| lot_number | text | "1".."32"; NULL for legacy properties |
| farm_acquisition_id | uuid | FK → farm_acquisitions.id |
| investor_id | uuid | FK → investors.id |
| county, state | text | |
| acres | numeric | |
| subdivision | text | |
| deed_reference | text | |
| created_at, updated_at | timestamptz | |

## file_cases  (one row per sale/reservation; THE sales pipeline)

| column | type | notes |
|---|---|---|
| id | uuid | PK |
| client_id | uuid | FK → clients.id |
| property_id | uuid | FK → properties.id |
| status | enum file_case_status | `active` (in process) · `completed` (closed) · `cancelled` |
| deal_type | enum deal_type | `financed` · `cash` |
| business_line | enum business_line | `cyberlots` · `terrafunded` · `casas` · `seller_financing` · `harold_townson` — mostly `terrafunded`; not reliable for investor attribution, use farm_acquisitions instead |
| asset_type | enum asset_type | `land` · `house` |
| project_name | text | |
| lot_number | text | |
| sale_price | numeric | contract price |
| down_payment | numeric | NULL on some cash deals |
| monthly_payment | numeric | |
| interest_rate | numeric | |
| term_years | integer | |
| reservation_date | date | when the buyer reserved |
| reservation_amount | numeric | |
| closing_date | date | NULL until closed |
| estimated_closing_date | date | |
| title_company_id | uuid | FK → title_companies.id |
| title_company_file_number | text | |
| note_buyer_destination | text | |
| co_buyers | jsonb | |
| assigned_seller | text | |
| assigned_admin_id, created_by | uuid | |
| stages_completed, stages_total, current_stage_number | integer | pipeline progress |
| current_stage_name | text | |
| progress_pct | numeric | |
| has_blocked_stages, has_overdue_stages | boolean | |
| days_since_start | integer | |
| welcome_slug | text | |
| created_at, updated_at | timestamptz | |

Verified totals (2026-09-10): **71 file cases on subdivided farms · $8,986,794.30 sale_price ·
32 completed · 39 active · 7 cash · 64 financed.** (The other rows are houses / other lines.)

## notes  (promissory note created at closing of a financed sale)

| column | type | notes |
|---|---|---|
| id | uuid | PK |
| client_id | uuid | FK → clients.id |
| property_id | uuid | FK → properties.id |
| issuing_entity_id | uuid | FK → issuing_entities.id |
| note_code | text | |
| original_amount | numeric | contract price at note level |
| down_payment | numeric | |
| financed_amount | numeric | face value of the note |
| interest_rate | numeric | |
| term_months | integer | |
| monthly_payment | numeric | |
| start_date, first_payment_date | date | |
| status | enum note_status | `active` · `paid_off` · `default` |
| current_upb | numeric | unpaid principal balance |
| payments_made_count, months_remaining | integer | |
| next_due_date | date | next_due_amount numeric |
| days_overdue, overdue_count | integer | |
| semaforo | text | green / yellow / red |
| is_seasoned | boolean | |
| is_sold | boolean | note already sold to a note buyer |
| is_historical | boolean | |
| is_test | boolean | **exclude where true** |
| asset_type | enum asset_type | |
| business_line | enum business_line | |
| commercial_status | enum note_commercial_status | |
| risk_level | text | risk_reasons jsonb |
| mortgage_owner_name, mortgage_owner_contact | text | |
| payment_token | uuid | |
| grace_period_days, default_threshold_days | integer | late_fee_kind enum, late_fee_value numeric, total_late_fees_collected numeric |
| docs_verified, docs_total | integer | |
| internal_notes, commercial_notes | text | |
| email_reminders_enabled | boolean | |
| behavior_analysis_from | date | |
| commercial_status_changed_at | timestamptz | commercial_status_by uuid · committed_buyer_id uuid |
| created_at, updated_at | timestamptz | |

## note_sales  (a note sold to an institutional/private buyer = real cash in)

| column | type | notes |
|---|---|---|
| id | uuid | PK |
| note_id | uuid | FK → notes.id |
| buyer_id | uuid | FK → note_buyers.id |
| buyer_name, buyer_email, buyer_phone | text | |
| buyer_user_id | uuid | |
| sale_price | numeric | cash received for the note |
| sale_date | date | |
| discount_from_upb | numeric | |
| servicing_retained | boolean | |
| buyer_has_portal_access, documents_delivered | boolean | |
| delivery_tracking, source, sale_notes | text | |
| created_at, updated_at | timestamptz | |

Verified: **15 notes sold · $1,356,405.86 cash received.**

## investor_distributions  (money paid OUT to investors)

| column | type | notes |
|---|---|---|
| id | uuid | PK |
| farm_acquisition_id | uuid | FK → farm_acquisitions.id |
| investor_id | uuid | FK → investors.id |
| distribution_date | date | |
| amount | numeric | |
| kind | text | observed values: `capital_return`, `profit_share` |
| payment_method | enum payment_method | stripe · transfer · check · cash · other |
| reference_number, receipt_url, notes | text | |
| registered_by | uuid | |
| created_at, updated_at | timestamptz | |

Verified: **32 distributions · $793,990.46 paid out.**

## property_costs  (costs attached to a farm or lot)

| column | type | notes |
|---|---|---|
| id | uuid | PK |
| farm_acquisition_id | uuid | FK → farm_acquisitions.id |
| property_id | uuid | FK → properties.id (nullable) |
| cost_date | date | |
| amount | numeric | |
| category | text | observed: `purchase`, `survey` (surveys added 2026-09-11) |
| cost_class | text | observed: `mandatory` |
| description | text | |
| created_by | uuid | |
| created_at | timestamptz | |

Verified (snapshot 2026-09-11 02:07 UTC): 13 rows · $5,797,147.50 total (purchase cost of the 13 farms).
Refreshed 2026-09-11 19:17 UTC: **24 rows · $5,901,906** — the 13 purchases plus **11 `survey` rows
totalling $104,758.50** (Avery 9,500 · Eastland 15,000 · Franklin 7,361 · Freestone 9,000 · Lamar
9,000 · Olney 8,443.50 · Promised Valley 10,000 · Red River 1 3,897 + 6,062 · Titus 6,495 · Wichita
20,000), each dated on its farm's funding day (Red River 1's two on 2026-09-02), all with
`property_id` null (farm-level, so the lot ledger splits them equally across the unreleased lots).
`farm_acquisitions.investor_capital` was set to purchase + survey on the same 10 farms.

## investors

| column | type |
|---|---|
| id | uuid |
| name | text |
| contact | text |
| notes | text |
| created_at, updated_at | timestamptz |

Names: Kevin Concua · Townson Family · Julio Arriola · Rony Schumann · Doctores Motta ·
Portafolio Diversificado · (one more).

## clients

| column | type |
|---|---|
| id | uuid |
| full_name | text |
| email, phone, address | text |
| status | enum client_status (pending · active · inactive) |
| is_active, is_test | boolean |
| preferred_contact | enum comm_channel |
| preferred_language | text |
| ssn_itin_encrypted | text — **never select this column** |
| created_at, updated_at | timestamptz |

## issuing_entities

id uuid · legal_name text · trade_name text · tax_id text · address · phone · email · logo_url ·
is_default bool · is_active bool · created_at · updated_at.

---

## Known data-quality issues (surface them, do not "fix" them)

These lots have a `file_cases` row and a `notes` row that disagree on price or down payment.
Quest v2 must show them in a Data Quality panel and apply the price rule from GOAL.md:

- Titus Lot 6: file_case $141,802 / $7,090.10 vs note $140,000 / $5,000
- Lamar Lot 5, 6, 7: file_case $118,506.75 or $133,641 / $5,000 vs note $113,507 or $128,641 / $4,000
- Eastland Lot 3: file_case $130,515 vs note $125,515 (down payment 5,000 vs 0)
- Lamar Lot 5: file_case reservation_date was 2026-09-07 while the note start_date is 2025-11-05 —
  corrected in Payments to 2025-09-07 (seen in the 2026-09-11 19:17 UTC refresh); no longer an issue

## Views that exist in Payments (read-only, may be useful)

`v_note_summary`, `v_portfolio_dashboard`, `v_monthly_cash_flow`, `v_file_case_summary`,
`v_outbound_summary`, `v_tape_export`. Their columns were NOT introspected for this document;
if you use one, first run `select * from <view> limit 1` and record the columns in OPEN_QUESTIONS.md.

## RPC `compute_lot_ledger(p_farm_id uuid, p_as_of date)`  (read-only; the lot ledger of one farm)

Called by the viewer through `supabase.rpc('compute_lot_ledger', { p_farm_id, p_as_of })` — HTTP 200,
no grant problem (checked 2026-09-11 19:42 UTC). It only reads. `scripts/snapshot.ts` calls it once per
farm with `deal_type = 'fixed_interest'` and stores the raw rows in the fixture under `lotLedgers`
(`{ farmId, farmName, asOf, rows }`). One row per `properties` row of the farm. The **real returned
columns**, as observed (not guessed):

| column | type | meaning as observed |
|---|---|---|
| property_id | uuid | the lot |
| lot_number | text | nullable (Eastland has one property without a lot number; it still takes its share of farm costs) |
| lot_capital | numeric | Σ capital entries: lot-level `property_costs` + the lot's equal share of every farm-level cost booked while it was unreleased |
| accrued_return | numeric | Σ amt × rate/100 × days/365, days from each cost to `min(as_of, released_at)`; `rate` = `farm_acquisitions.annual_interest_rate`, a PERCENT |
| credits | numeric | down payments + note sales + completed cash closings applied to the lot, capped at the balance on the release day |
| lot_balance | numeric | `max(0, lot_capital + accrued_return − credits)`; 0 once released |
| floor_amount | numeric | `lot_capital × (1 + rate/100)` — informational; it does **not** gate the release (Eastland Lot 3 released 2026-06-11 with credits 59,525.53 < floor 61,636.36). NaN on Franklin 2, whose capital is 0 until its 2026-10-15 costs |
| released_at | date | the credit date on which the balance reached ≤ 0, else null |
| residual | numeric | credits received beyond the balance (the overshoot on the release day plus every later credit) |
| first_cost_date | date | earliest capital entry, null when the lot has none |
| credit_detail | jsonb[] | `[{ dt, amt, kind }]`, `kind` ∈ `down_payment` · `note_sale` · `cash_sale` |

Values come back as unrounded floats. `src/domain/lotLedger.ts` is the TypeScript port;
`src/domain/__tests__/lotLedger.test.ts` proves parity with these stored rows on all 49 lots of the
6 fixed-interest farms (worst absolute difference 7e-12; the test tolerates $0.01).
