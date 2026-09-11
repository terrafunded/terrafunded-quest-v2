-- =============================================================================
-- Quest v2 — proposed Postgres views for the Payments database
--
-- STATUS: PROPOSAL ONLY. Nothing in this file has been applied. Quest v2 runs
-- entirely on `select` queries against the base tables and does every
-- computation in `src/domain/` (pure TypeScript, unit-tested). These views
-- would move the heaviest of those computations into Postgres so the browser
-- downloads a few hundred pre-computed rows instead of nine raw tables.
--
-- Every column referenced below exists in `payments_schema.md`. The views are
-- read-only projections (no functions with side effects, no triggers). They
-- follow the same rules the TypeScript implements; the comments cite the
-- corresponding `src/domain/*.ts` file so a reviewer can diff the two.
--
-- Suggested application order: 1 → 2 → 3 → 4 → 5 → 6 (each view depends only on
-- the ones above it). Suggested schema: `quest` (create schema quest;) so they
-- never collide with Payments' own `v_*` views. Grant `select` to the
-- `authenticated` role (or the viewer role) only.
--
-- If applied, `src/data/queries/` would gain one `fetchLotEconomics()` and one
-- `fetchFarmInterest()` and the domain layer would keep its tests by running
-- them against a fixture of the view output as well as the raw tables.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. quest.v_subdivided_farm — the farms Quest treats as subdivided
--    (src/domain/lot.ts: isSubdividedFarm, farmCapitalBasis, landCostPerLot)
--
--    Rule: total_lots > 1 AND farm_name not in the legacy list. The legacy list
--    is duplicated here from src/config/goal.ts (LEGACY_FARM_NAMES); if it
--    changes there it must change here too — or, better, add a boolean column
--    `is_subdivided` to farm_acquisitions and drop the hard-coded list.
-- -----------------------------------------------------------------------------
create or replace view quest.v_subdivided_farm as
with farm_costs as (
  select farm_acquisition_id, sum(amount) as total_property_costs
  from public.property_costs
  group by farm_acquisition_id
)
select
  fa.id,
  fa.farm_name,
  fa.county,
  fa.investor_id,
  fa.deal_type,
  fa.total_lots,
  fa.total_acres,
  fa.closing_date,
  fa.funding_date,
  coalesce(fa.funding_date, fa.closing_date)             as accrual_start_date,
  fa.investor_capital,
  fa.annual_interest_rate,
  fa.profit_share_pct,
  fa.maturity_months,
  fa.extension_months,
  fc.total_property_costs,
  -- Capital basis: investor_capital, else Σ property_costs (OPEN_QUESTIONS #8/#9).
  coalesce(fa.investor_capital, fc.total_property_costs) as capital_basis,
  case
    when fa.total_lots > 0
      then round(coalesce(fa.investor_capital, fc.total_property_costs) / fa.total_lots, 2)
  end                                                    as land_cost_per_lot
from public.farm_acquisitions fa
left join farm_costs fc on fc.farm_acquisition_id = fa.id
where fa.total_lots > 1
  and fa.farm_name not in ('Ben White', 'Sharps Rd', 'Olney', 'Red River 1');


-- -----------------------------------------------------------------------------
-- 2. quest.v_lot_source — one row per lot with the chosen file case and note
--    (src/domain/lot.ts: pickFileCase, pickNote)
--
--    File case pick: ignore `cancelled`; prefer `completed`, then the newest.
--    Note pick: only `is_test = false`; prefer `is_sold`, then the newest
--    `start_date`. Buyer names come from clients with `is_test = false`; a test
--    client on a real case yields a NULL buyer_name (OPEN_QUESTIONS #4).
-- -----------------------------------------------------------------------------
create or replace view quest.v_lot_source as
with ranked_cases as (
  select
    fc.*,
    row_number() over (
      partition by fc.property_id
      order by (fc.status = 'completed') desc, fc.created_at desc
    ) as rn
  from public.file_cases fc
  where fc.status <> 'cancelled'
),
ranked_notes as (
  select
    n.*,
    row_number() over (
      partition by n.property_id
      order by n.is_sold desc, n.start_date desc nulls last, n.created_at desc
    ) as rn
  from public.notes n
  where n.is_test = false
),
note_sale as (
  -- If a note was ever sold twice this keeps the newest; the quality view
  -- (view 6) reports duplicates instead of hiding them.
  select distinct on (ns.note_id)
    ns.note_id, ns.sale_price, ns.sale_date, ns.buyer_name
  from public.note_sales ns
  order by ns.note_id, ns.sale_date desc nulls last, ns.created_at desc
)
select
  p.id                              as property_id,
  p.name                            as lot_name,
  p.lot_number,
  f.id                              as farm_id,
  f.farm_name,
  f.deal_type                       as farm_deal_type,
  f.investor_id,
  f.land_cost_per_lot,
  f.profit_share_pct,
  rc.id                             as file_case_id,
  rc.status                         as file_case_status,
  rc.deal_type                      as file_case_deal_type,
  rc.sale_price                     as file_case_sale_price,
  rc.down_payment                   as file_case_down_payment,
  rc.reservation_date,
  rc.closing_date,
  rc.client_id,
  c.full_name                       as buyer_name,
  (c.id is not null and c.is_test)  as buyer_is_test_client,
  rn.id                             as note_id,
  rn.original_amount                as note_original_amount,
  rn.down_payment                   as note_down_payment,
  rn.start_date                     as note_start_date,
  rn.is_sold                        as note_is_sold,
  ns.sale_price                     as note_sale_price,
  ns.sale_date                      as note_sale_date,
  ns.buyer_name                     as note_buyer_name,
  (select count(*) from public.notes n2
     where n2.property_id = p.id and n2.is_test = false) as note_count
from public.properties p
join quest.v_subdivided_farm f on f.id = p.farm_acquisition_id
left join ranked_cases rc on rc.property_id = p.id and rc.rn = 1
left join ranked_notes rn on rn.property_id = p.id and rn.rn = 1
left join note_sale ns    on ns.note_id = rn.id
left join public.clients c on c.id = rc.client_id;


-- -----------------------------------------------------------------------------
-- 3. quest.v_farm_interest — daily simple interest on the stepped-down balance
--    (src/domain/interest.ts: accrueOnSteppedBalance, buildInterestLedger)
--
--    For fixed_interest farms: balance starts at investor_capital on
--    accrual_start_date and steps down on each `capital_return` distribution.
--    Each segment accrues balance × rate / 365 × days. Rates stored > 1 are
--    percents (20 → 20 %); rates ≤ 1 are fractions (OPEN_QUESTIONS #9).
--    This is the heaviest per-render computation in the browser today.
-- -----------------------------------------------------------------------------
create or replace view quest.v_farm_interest as
with farms as (
  select
    f.id, f.farm_name, f.investor_id, f.investor_capital, f.accrual_start_date,
    case when f.annual_interest_rate > 1
         then f.annual_interest_rate
         else f.annual_interest_rate * 100 end as rate_pct
  from quest.v_subdivided_farm f
  where f.deal_type = 'fixed_interest'
    and f.investor_capital is not null
    and f.accrual_start_date is not null
),
returns as (
  select farm_acquisition_id, distribution_date, sum(amount) as amount
  from public.investor_distributions
  where kind = 'capital_return'
  group by farm_acquisition_id, distribution_date
),
-- Breakpoints: accrual start, every capital return date, and today.
points as (
  select id as farm_id, accrual_start_date as d from farms
  union
  select r.farm_acquisition_id, r.distribution_date
  from returns r join farms f on f.id = r.farm_acquisition_id
  where r.distribution_date > f.accrual_start_date
  union
  select id, current_date from farms where current_date > accrual_start_date
),
segments as (
  select
    farm_id,
    d                                            as seg_start,
    lead(d) over (partition by farm_id order by d) as seg_end
  from points
),
balances as (
  select
    s.farm_id, s.seg_start, s.seg_end,
    f.investor_capital
      - coalesce((select sum(r.amount) from returns r
                  where r.farm_acquisition_id = s.farm_id
                    and r.distribution_date <= s.seg_start), 0) as balance
  from segments s join farms f on f.id = s.farm_id
  where s.seg_end is not null
)
select
  f.id                                    as farm_id,
  f.farm_name,
  f.investor_id,
  f.investor_capital,
  f.rate_pct,
  f.accrual_start_date,
  round(sum(greatest(b.balance, 0) * (f.rate_pct / 100) / 365
            * (b.seg_end - b.seg_start)), 2)     as accrued_to_date,
  coalesce((select sum(d.amount) from public.investor_distributions d
            where d.farm_acquisition_id = f.id and d.kind = 'capital_return'), 0)
                                          as capital_returned,
  coalesce((select sum(d.amount) from public.investor_distributions d
            where d.farm_acquisition_id = f.id and d.kind <> 'capital_return'), 0)
                                          as paid_to_date,
  f.investor_capital
    - coalesce((select sum(d.amount) from public.investor_distributions d
                where d.farm_acquisition_id = f.id and d.kind = 'capital_return'), 0)
                                          as capital_outstanding
from farms f
left join balances b on b.farm_id = f.id
group by f.id, f.farm_name, f.investor_id, f.investor_capital, f.rate_pct, f.accrual_start_date;


-- -----------------------------------------------------------------------------
-- 4. quest.v_lot_economics — stage, prices, profit and cash per lot
--    (src/domain/lot.ts: deriveStage, computeLotEconomics)
--
--    Stage precedence: note sold → note_sold; note exists → closed;
--    file case completed or closing_date set → closed; file case active →
--    reserved; nothing → available.
--    salePrice / downPayment: note first, else active/completed file case.
--    investorTake: profit_share → gross × pct/100; fixed_interest → 1/N of the
--    farm's accrued interest (N = total_lots, pro-rata by equal land cost);
--    own_capital → 0.
--    cashRealized: cash deal closed → salePrice; financed closed → downPayment
--    + note sale price; reserved → 0 (OPEN_QUESTIONS #5).
-- -----------------------------------------------------------------------------
create or replace view quest.v_lot_economics as
with base as (
  select
    l.*,
    f.total_lots,
    fi.accrued_to_date as farm_accrued_interest,
    case
      when l.note_id is not null and (l.note_is_sold or l.note_sale_price is not null) then 'note_sold'
      when l.note_id is not null                                                       then 'closed'
      when l.file_case_status = 'completed' or l.closing_date is not null              then 'closed'
      when l.file_case_status = 'active'                                               then 'reserved'
      else 'available'
    end as stage,
    coalesce(l.note_original_amount,
             case when l.file_case_status in ('active', 'completed') then l.file_case_sale_price end)
      as sale_price,
    case when l.note_id is not null then l.note_down_payment
         when l.file_case_status in ('active', 'completed') then l.file_case_down_payment end
      as down_payment,
    coalesce(l.closing_date, l.note_start_date) as close_date
  from quest.v_lot_source l
  join quest.v_subdivided_farm f on f.id = l.farm_id
  left join quest.v_farm_interest fi on fi.farm_id = l.farm_id
),
econ as (
  select
    b.*,
    b.sale_price - b.land_cost_per_lot as gross_profit,
    case b.farm_deal_type
      when 'profit_share'   then round((b.sale_price - b.land_cost_per_lot) * b.profit_share_pct / 100, 2)
      when 'fixed_interest' then round(coalesce(b.farm_accrued_interest, 0) / b.total_lots, 2)
      else 0
    end as investor_take
  from base b
)
select
  e.property_id, e.lot_name, e.lot_number, e.farm_id, e.farm_name, e.farm_deal_type,
  e.investor_id, e.file_case_id, e.file_case_status, e.file_case_deal_type,
  e.note_id, e.note_is_sold, e.note_sale_price, e.note_sale_date,
  e.buyer_name, e.buyer_is_test_client,
  e.stage,
  e.land_cost_per_lot                                        as land_cost,
  e.sale_price,
  e.down_payment,
  e.gross_profit,
  e.investor_take,
  case when e.sale_price is not null then e.gross_profit - e.investor_take end as net_profit,
  case
    when e.stage in ('closed', 'note_sold') and e.file_case_deal_type = 'cash'
      then coalesce(e.sale_price, 0)
    when e.stage in ('closed', 'note_sold')
      then coalesce(e.down_payment, 0) + coalesce(e.note_sale_price, 0)
    else 0
  end                                                        as cash_realized,
  e.reservation_date,
  e.close_date,
  case
    when e.reservation_date is not null and e.close_date is not null
         and e.close_date >= e.reservation_date
      then e.close_date - e.reservation_date
    when e.reservation_date is not null and e.stage = 'reserved'
      then current_date - e.reservation_date
  end                                                        as days_in_pipeline
from econ e;


-- -----------------------------------------------------------------------------
-- 5. quest.v_cash_by_month — Treasury (src/domain/treasury.ts)
--
--    Cash in  = down payments (full price for cash deals) at close_date
--             + note_sales.sale_price at sale_date.
--    Cash out = investor_distributions.amount at distribution_date.
--    Closed lots without a close_date are excluded here and reported as
--    `undated_cash_in` by the domain layer (OPEN_QUESTIONS #6).
-- -----------------------------------------------------------------------------
create or replace view quest.v_cash_by_month as
with cash_in as (
  select date_trunc('month', close_date)::date as month,
         sum(case when file_case_deal_type = 'cash' then coalesce(sale_price, 0)
                  else coalesce(down_payment, 0) end) as amount
  from quest.v_lot_economics
  where stage in ('closed', 'note_sold') and close_date is not null
  group by 1
  union all
  select date_trunc('month', ns.sale_date)::date, sum(ns.sale_price)
  from public.note_sales ns
  join public.notes n on n.id = ns.note_id and n.is_test = false
  where ns.sale_date is not null
  group by 1
),
cash_out as (
  select date_trunc('month', distribution_date)::date as month, sum(amount) as amount
  from public.investor_distributions
  where distribution_date is not null
  group by 1
)
select
  coalesce(i.month, o.month)        as month,
  coalesce(sum(i.amount), 0)        as cash_in,
  coalesce(sum(o.amount), 0)        as cash_out,
  coalesce(sum(i.amount), 0) - coalesce(sum(o.amount), 0) as net
from cash_in i
full outer join cash_out o on o.month = i.month
group by coalesce(i.month, o.month)
order by 1;


-- -----------------------------------------------------------------------------
-- 6. quest.v_quality_issue — data disagreements (src/domain/quality.ts)
--
--    Never corrects anything; one row per disagreement so the panel can list
--    them. The TypeScript version has 15 kinds; the six below are the ones that
--    are pure table comparisons and therefore cheap in SQL.
-- -----------------------------------------------------------------------------
create or replace view quest.v_quality_issue as
select 'price_mismatch' as kind, property_id, lot_name, farm_name,
       format('file_cases.sale_price %s ≠ notes.original_amount %s',
              file_case_sale_price, note_original_amount) as detail
from quest.v_lot_source
where file_case_sale_price is not null and note_original_amount is not null
  and file_case_sale_price <> note_original_amount
union all
select 'down_payment_mismatch', property_id, lot_name, farm_name,
       format('file_cases.down_payment %s ≠ notes.down_payment %s',
              file_case_down_payment, note_down_payment)
from quest.v_lot_source
where file_case_down_payment is not null and note_down_payment is not null
  and file_case_down_payment <> note_down_payment
union all
select 'reservation_after_note_start', property_id, lot_name, farm_name,
       format('reservation_date %s is after notes.start_date %s', reservation_date, note_start_date)
from quest.v_lot_source
where reservation_date > note_start_date
union all
select 'sold_note_without_sale', property_id, lot_name, farm_name,
       'notes.is_sold = true but no note_sales row'
from quest.v_lot_source
where note_is_sold and note_sale_price is null
union all
select 'multiple_notes_on_lot', property_id, lot_name, farm_name,
       format('%s non-test notes on one lot', note_count)
from quest.v_lot_source
where note_count > 1
union all
select 'farm_capital_null', null::uuid, null, farm_name,
       'farm_acquisitions.investor_capital is NULL; land cost falls back to Σ property_costs'
from quest.v_subdivided_farm
where investor_capital is null;
