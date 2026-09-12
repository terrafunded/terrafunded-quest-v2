/**
 * scripts/check-connection.ts — verify the Payments connection and the viewer's read-only scope.
 *
 *   npm run check
 *
 * 1. Signs in with QUEST_TEST_EMAIL / QUEST_TEST_PASSWORD against VITE_SUPABASE_URL + anon key.
 * 2. Runs `select count(*)` (HEAD request, no rows transferred) on every table Quest reads and
 *    compares against the expected counts from GOAL.md / payments_schema.md.
 * 3. Proves the login is read-only by attempting ONE insert of a clearly-labelled dummy row into
 *    `property_costs` and asserting that RLS rejects it. This is the only write attempt anywhere
 *    in the repo, and it is expected to fail. If it ever succeeds, the row is deleted immediately
 *    and the script exits non-zero so the warning cannot be missed.
 *
 * Exit codes: 0 all good · 1 env/login problem · 2 count mismatch or table error · 3 WRITE WAS ALLOWED.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const TABLES = [
  "file_cases",
  "notes",
  "properties",
  "farm_acquisitions",
  "investors",
  "investor_distributions",
  "property_costs",
  "note_sales",
  "clients",
] as const;

/** Expected counts stated in the task; other tables are printed for information only. */
const EXPECTED: Partial<Record<(typeof TABLES)[number], number>> = {
  farm_acquisitions: 13,
  investors: 7,
  investor_distributions: 32,
  property_costs: 13,
  note_sales: 15,
};

const DUMMY_DESCRIPTION = "QUEST_CONNECTION_CHECK_DUMMY_ROW — safe to delete";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}. See .env.example.`);
    process.exit(1);
  }
  return v;
}

async function countRows(sb: SupabaseClient, table: string, filter?: { column: string; value: boolean }) {
  let q = sb.from(table).select("id", { count: "exact", head: true });
  if (filter) q = q.eq(filter.column, filter.value);
  const { count, error } = await q;
  return { count, error };
}

async function main() {
  const url = requireEnv("VITE_SUPABASE_URL");
  const anonKey = requireEnv("VITE_SUPABASE_ANON_KEY");
  const email = requireEnv("QUEST_TEST_EMAIL");
  const password = requireEnv("QUEST_TEST_PASSWORD");

  const sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await sb.auth.signInWithPassword({ email, password });
  if (authError || !auth.user) {
    console.error(`Login failed: ${authError?.message ?? "no user returned"}`);
    process.exit(1);
  }
  console.log(`Signed in as ${auth.user.email} (user id ${auth.user.id})`);
  console.log(`Project: ${new URL(url).host}\n`);

  let exit = 0;

  console.log("Row counts (select count(*), head request):");
  for (const table of TABLES) {
    const { count, error } = await countRows(sb, table);
    if (error) {
      console.log(`  ${table.padEnd(24)} ERROR ${error.code ?? ""} ${error.message}`);
      exit = Math.max(exit, 2);
      continue;
    }
    const expected = EXPECTED[table];
    const verdict = expected === undefined ? "" : count === expected ? "  ✓ expected" : `  ✗ expected ${expected}`;
    if (expected !== undefined && count !== expected) exit = Math.max(exit, 2);
    console.log(`  ${table.padEnd(24)} ${String(count).padStart(5)}${verdict}`);
  }

  // The app filters test rows; show what remains so the numbers can be reconciled with the fixture.
  for (const table of ["notes", "clients"] as const) {
    const { count, error } = await countRows(sb, table, { column: "is_test", value: false });
    if (!error) console.log(`  ${`${table} (is_test=false)`.padEnd(24)} ${String(count).padStart(5)}`);
  }

  console.log("\nRead-only check: attempting one dummy insert into property_costs (expected to be REJECTED)…");
  // Use a real farm id so the only thing that can reject the row is RLS, not a FK / NOT NULL error.
  const { data: farm, error: farmError } = await sb
    .from("farm_acquisitions")
    .select("id, farm_name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (farmError || !farm) {
    console.error(`  Could not read a farm id for the probe: ${farmError?.message ?? "no rows"}`);
    process.exit(2);
  }

  const { data: inserted, error: insertError } = await sb
    .from("property_costs")
    .insert({
      farm_acquisition_id: farm.id,
      cost_date: new Date().toISOString().slice(0, 10),
      amount: 0.01,
      category: "quest_check",
      cost_class: "test",
      description: DUMMY_DESCRIPTION,
    })
    .select("id");

  if (insertError) {
    const rls = insertError.code === "42501" || /row-level security|permission denied/i.test(insertError.message);
    console.log(`  REJECTED ✓  code=${insertError.code ?? "?"}  ${insertError.message}`);
    console.log(rls ? "  Rejection came from RLS / privileges. The login is read-only." : "  Rejected, but not by an RLS/privilege error — review the message above.");
  } else {
    exit = 3;
    const ids = (inserted ?? []).map((r: { id: string }) => r.id);
    console.error(`\n  !!! WRITE WAS ALLOWED. Inserted ${ids.length} row(s): ${ids.join(", ")}`);
    if (ids.length > 0) {
      const { error: delError } = await sb.from("property_costs").delete().in("id", ids);
      if (delError) {
        console.error(`  !!! CLEAN-UP FAILED: ${delError.code ?? ""} ${delError.message}. Delete rows with description "${DUMMY_DESCRIPTION}" manually.`);
      } else {
        console.error("  Dummy row(s) deleted.");
      }
    } else {
      // Insert returned no rows (RLS may hide them); look the row up by its description and remove it.
      const { error: delError } = await sb.from("property_costs").delete().eq("description", DUMMY_DESCRIPTION);
      console.error(delError ? `  !!! CLEAN-UP FAILED: ${delError.message}` : "  Dummy row(s) deleted by description.");
    }
    console.error("  Record a red warning in OPEN_QUESTIONS.md: the viewer login can write to Payments.");
  }

  await sb.auth.signOut();
  process.exit(exit);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
