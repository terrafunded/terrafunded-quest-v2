import { describe, expect, it } from "vitest";
import { config } from "dotenv";
config();
import { createClient } from "@supabase/supabase-js";
import { fetchPaymentsSnapshot } from "@/data/queries";
import { buildRealm } from "@/domain/realm";
import { buildPlatformExport } from "./platformExport";

const hasEnv = !!(process.env.VITE_SUPABASE_URL && process.env.QUEST_TEST_EMAIL && process.env.QUEST_TEST_PASSWORD);

describe.runIf(hasEnv)("platformExport live", () => {
  it("runs reconciliations against live Payments", async () => {
    const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const { error } = await sb.auth.signInWithPassword({
      email: process.env.QUEST_TEST_EMAIL!,
      password: process.env.QUEST_TEST_PASSWORD!,
    });
    expect(error).toBeNull();
    const { snapshot } = await fetchPaymentsSnapshot(sb);
    const realm = buildRealm(snapshot, new Date(), { deadline: "2027-12-31", lang: "es" });
    const doc = buildPlatformExport(realm, { lang: "es", exitHorizon: 2027, commitSha: "live-check" });
    console.log(
      "LIVE_SUMMARY",
      JSON.stringify({
        checksRun: doc.summary.checksRun,
        checksFailed: doc.summary.checksFailed,
        failures: doc.summary.failures,
        figures: doc.figures.length,
        lots: doc.rows.lots.length,
        farms: doc.rows.farms.length,
        excluded: doc.excluded.length,
        pagesCovered: doc.pagesCovered,
        checks: doc.reconciliations.map((c) => ({ id: c.id, pass: c.pass, delta: c.delta })),
      }),
    );
    expect(doc.summary.checksRun).toBeGreaterThanOrEqual(12);
    expect(doc.pagesCovered.length).toBeGreaterThanOrEqual(14);
  }, 60_000);
});
