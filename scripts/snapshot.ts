/**
 * scripts/snapshot.ts — read-only snapshot of the Payments tables Quest depends on.
 *
 * Signs in with the viewer credentials, runs the exact same `select` queries the
 * app uses (src/data/queries), and writes them to src/domain/__fixtures__/payments.json
 * so the domain tests can reproduce the verified numbers offline.
 *
 * It also calls one read-only RPC, `compute_lot_ledger(p_farm_id, p_as_of)`, for every
 * farm with `deal_type = 'fixed_interest'` and stores the raw rows under `lotLedgers`,
 * so `src/domain/lotLedger.ts` (the TypeScript port) can be checked for parity offline.
 * That function only reads; the RPC's real column names are recorded in payments_schema.md.
 *
 * It never inserts, updates or deletes.
 *
 *   npm run snapshot
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchPaymentsSnapshot } from "../src/data/queries";
import type { LotLedgerRpcResult, LotLedgerRpcRow } from "../src/domain/types";

loadDotenv();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}. See .env.example.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const url = requireEnv("VITE_SUPABASE_URL");
  const anonKey = requireEnv("VITE_SUPABASE_ANON_KEY");
  const email = requireEnv("QUEST_TEST_EMAIL");
  const password = requireEnv("QUEST_TEST_PASSWORD");

  const sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: authError } = await sb.auth.signInWithPassword({ email, password });
  if (authError) {
    console.error(`Login failed: ${authError.message}`);
    process.exit(1);
  }

  const { snapshot, errors } = await fetchPaymentsSnapshot(sb);

  for (const e of errors) {
    console.error(`WARN table ${e.table}: ${e.code ?? "?"} ${e.message}`);
  }

  const snapshotAt = new Date();
  const asOf = snapshotAt.toISOString().slice(0, 10);
  const lotLedgers: LotLedgerRpcResult[] = [];
  let rpcErrors = 0;
  for (const farm of snapshot.farmAcquisitions) {
    if (farm.deal_type !== "fixed_interest") continue;
    const { data, error } = await sb.rpc("compute_lot_ledger", { p_farm_id: farm.id, p_as_of: asOf });
    if (error) {
      rpcErrors += 1;
      console.error(`WARN rpc compute_lot_ledger(${farm.farm_name ?? farm.id}, ${asOf}): ${error.code ?? "?"} ${error.message}`);
      continue;
    }
    lotLedgers.push({ farmId: farm.id, farmName: farm.farm_name, asOf, rows: (data ?? []) as LotLedgerRpcRow[] });
  }

  const out = {
    snapshotAt: snapshotAt.toISOString(),
    ...snapshot,
    lotLedgers,
  };

  const dir = path.resolve(process.cwd(), "src/domain/__fixtures__");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "payments.json");
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");

  const counts = Object.entries(snapshot).map(([k, v]) => `${k}=${(v as unknown[]).length}`);
  console.log(`Wrote ${file}`);
  console.log(counts.join("  "));
  console.log(`lotLedgers=${lotLedgers.length} farms (${lotLedgers.reduce((a, l) => a + l.rows.length, 0)} lots) as of ${asOf}`);

  await sb.auth.signOut();
  process.exit(errors.length || rpcErrors ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
