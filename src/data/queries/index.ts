import type { SupabaseClient } from "@supabase/supabase-js";
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
} from "@/domain/types";
import {
  CLIENT_COLUMNS,
  FARM_ACQUISITION_COLUMNS,
  FILE_CASE_COLUMNS,
  INVESTOR_COLUMNS,
  INVESTOR_DISTRIBUTION_COLUMNS,
  NOTE_COLUMNS,
  NOTE_SALE_COLUMNS,
  PROPERTY_COLUMNS,
  PROPERTY_COST_COLUMNS,
} from "./columns";

/**
 * All Supabase reads for Quest live in this module. Every function is a plain
 * `select` with an explicit column list; nothing here can write.
 *
 * Tables are small (<200 rows each) so a single page is enough; we still set an
 * explicit upper bound well above the row counts so a silent 1000-row cap can
 * never truncate a table without us noticing.
 */
const MAX_ROWS = 5000;

export class PaymentsQueryError extends Error {
  constructor(
    public readonly table: string,
    public readonly code: string | undefined,
    message: string,
  ) {
    super(`[${table}] ${message}`);
    this.name = "PaymentsQueryError";
  }
}

async function run<T>(
  table: string,
  query: PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new PaymentsQueryError(table, error.code, error.message);
  return data ?? [];
}

export function fetchFarmAcquisitions(sb: SupabaseClient): Promise<FarmAcquisitionRow[]> {
  return run<FarmAcquisitionRow>(
    "farm_acquisitions",
    sb.from("farm_acquisitions").select(FARM_ACQUISITION_COLUMNS).order("funding_date", { ascending: true }).limit(MAX_ROWS),
  );
}

export function fetchProperties(sb: SupabaseClient): Promise<PropertyRow[]> {
  return run<PropertyRow>("properties", sb.from("properties").select(PROPERTY_COLUMNS).order("name").limit(MAX_ROWS));
}

export function fetchFileCases(sb: SupabaseClient): Promise<FileCaseRow[]> {
  return run<FileCaseRow>(
    "file_cases",
    sb.from("file_cases").select(FILE_CASE_COLUMNS).order("reservation_date", { ascending: true }).limit(MAX_ROWS),
  );
}

/** Test notes are excluded at the query boundary, per GOAL.md hard constraint 3. */
export function fetchNotes(sb: SupabaseClient): Promise<NoteRow[]> {
  return run<NoteRow>(
    "notes",
    sb.from("notes").select(NOTE_COLUMNS).eq("is_test", false).order("start_date", { ascending: true }).limit(MAX_ROWS),
  );
}

export function fetchNoteSales(sb: SupabaseClient): Promise<NoteSaleRow[]> {
  return run<NoteSaleRow>(
    "note_sales",
    sb.from("note_sales").select(NOTE_SALE_COLUMNS).order("sale_date", { ascending: true }).limit(MAX_ROWS),
  );
}

export function fetchInvestorDistributions(sb: SupabaseClient): Promise<InvestorDistributionRow[]> {
  return run<InvestorDistributionRow>(
    "investor_distributions",
    sb
      .from("investor_distributions")
      .select(INVESTOR_DISTRIBUTION_COLUMNS)
      .order("distribution_date", { ascending: true })
      .limit(MAX_ROWS),
  );
}

export function fetchPropertyCosts(sb: SupabaseClient): Promise<PropertyCostRow[]> {
  return run<PropertyCostRow>(
    "property_costs",
    sb.from("property_costs").select(PROPERTY_COST_COLUMNS).order("cost_date", { ascending: true }).limit(MAX_ROWS),
  );
}

export function fetchInvestors(sb: SupabaseClient): Promise<InvestorRow[]> {
  return run<InvestorRow>("investors", sb.from("investors").select(INVESTOR_COLUMNS).order("name").limit(MAX_ROWS));
}

/** Test clients are excluded at the query boundary. `ssn_itin_encrypted` is never selected. */
export function fetchClients(sb: SupabaseClient): Promise<ClientRow[]> {
  return run<ClientRow>(
    "clients",
    sb.from("clients").select(CLIENT_COLUMNS).eq("is_test", false).order("full_name").limit(MAX_ROWS),
  );
}

export interface SnapshotFetchResult {
  snapshot: PaymentsSnapshot;
  /** Tables that failed with a permission or other error; the app keeps going with what it has. */
  errors: PaymentsQueryError[];
}

/**
 * Loads every table Quest needs, in parallel. Per-table failures are collected
 * rather than thrown so one locked-down table does not blank the whole realm.
 */
export async function fetchPaymentsSnapshot(sb: SupabaseClient): Promise<SnapshotFetchResult> {
  const errors: PaymentsQueryError[] = [];
  const guard = async <T>(p: Promise<T[]>): Promise<T[]> => {
    try {
      return await p;
    } catch (e) {
      if (e instanceof PaymentsQueryError) {
        errors.push(e);
        return [];
      }
      throw e;
    }
  };

  const [
    farmAcquisitions,
    properties,
    fileCases,
    notes,
    noteSales,
    investorDistributions,
    propertyCosts,
    investors,
    clients,
  ] = await Promise.all([
    guard(fetchFarmAcquisitions(sb)),
    guard(fetchProperties(sb)),
    guard(fetchFileCases(sb)),
    guard(fetchNotes(sb)),
    guard(fetchNoteSales(sb)),
    guard(fetchInvestorDistributions(sb)),
    guard(fetchPropertyCosts(sb)),
    guard(fetchInvestors(sb)),
    guard(fetchClients(sb)),
  ]);

  return {
    snapshot: {
      farmAcquisitions,
      properties,
      fileCases,
      notes,
      noteSales,
      investorDistributions,
      propertyCosts,
      investors,
      clients,
    },
    errors,
  };
}
