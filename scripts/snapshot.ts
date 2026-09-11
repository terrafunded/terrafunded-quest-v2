/**
 * scripts/snapshot.ts — read-only snapshot of the Payments tables Quest depends on.
 *
 * Signs in with the viewer credentials, runs the exact same `select` queries the
 * app uses (src/data/queries), and writes them to src/domain/__fixtures__/payments.json
 * so the domain tests can reproduce the verified numbers offline.
 *
 * It never inserts, updates, deletes, or calls an RPC.
 *
 *   npm run snapshot
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchPaymentsSnapshot } from "../src/data/queries";

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

  const out = {
    snapshotAt: new Date().toISOString(),
    ...snapshot,
  };

  const dir = path.resolve(process.cwd(), "src/domain/__fixtures__");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "payments.json");
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");

  const counts = Object.entries(snapshot).map(([k, v]) => `${k}=${(v as unknown[]).length}`);
  console.log(`Wrote ${file}`);
  console.log(counts.join("  "));

  await sb.auth.signOut();
  process.exit(errors.length ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
