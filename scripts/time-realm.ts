/**
 * Times each buildRealm stage on the real fixture. Warm-up discarded; reports the median of
 * the remaining runs so a single GC spike does not own the table.
 *
 *   npx tsx scripts/time-realm.ts
 */
import raw from "../src/domain/__fixtures__/payments.json";
import type { PaymentsSnapshot } from "../src/domain/types";
import { buildRealm, type RealmStageTimings } from "../src/domain/realm";

const fixture = raw as unknown as PaymentsSnapshot;
const ASOF = new Date("2026-09-11T00:00:00Z");
const RUNS = 9;
const NAMED = [
  "computeLots",
  "computeFarms",
  "computeGoal",
  "computePipeline",
  "computeExpected",
  "computeQualityIssues",
  "computeInvestors",
  "computeTreasury",
  "deriveOracleDefaults",
  "farmCadence",
  "computeLiberation",
  "computeCapitalComposition",
  "computeEvents",
] as const;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function runOnce(): RealmStageTimings {
  const timings: RealmStageTimings = {};
  buildRealm(fixture, ASOF, { deadline: "2027-12-31", timings });
  return timings;
}

runOnce(); // warmup
const rows: RealmStageTimings[] = [];
for (let i = 0; i < RUNS; i++) rows.push(runOnce());

const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort((a, b) => {
  if (a === "total") return 1;
  if (b === "total") return -1;
  return median(rows.map((r) => r[a] ?? 0)) > median(rows.map((r) => r[b] ?? 0)) ? -1 : 1;
});

console.log(`fixture: ${fixture.properties.length} properties, ${fixture.fileCases.length} file cases, ${fixture.notes.length} notes`);
console.log(`median of ${RUNS} runs after 1 warmup (ms)`);
console.log("");
console.log("| Stage | ms |");
console.log("|---|---|");
for (const k of keys) {
  const mark = (NAMED as readonly string[]).includes(k) || k === "total" ? "" : " †";
  console.log(`| ${k}${mark} | ${median(rows.map((r) => r[k] ?? 0)).toFixed(2)} |`);
}
console.log("");
console.log("† extra stage, not in the original brief list");
console.log(`full build (all stages, timings on): ${median(rows.map((r) => r.total ?? 0)).toFixed(2)} ms`);

function throneOnlyMs(): number {
  const t0 = performance.now();
  const r = buildRealm(fixture, ASOF, { deadline: "2027-12-31" });
  void r.lots.length;
  void r.goal.netProfitToDate;
  void r.expected.committedNetProfit;
  void r.warPlan.rotation.turnsNeeded;
  void r.rotation.capitalOutstanding;
  void r.oxygen.trailingDaysGained;
  void r.debt.capitalOwed;
  void r.history.length;
  void r.events.length;
  void r.narrative.size;
  void r.story.cards.length;
  void r.pipeline.netProfitTrapped;
  void r.treasury.totalCashIn;
  void r.investors.length;
  return performance.now() - t0;
}
throneOnlyMs();
const throne = [];
for (let i = 0; i < RUNS; i++) throne.push(throneOnlyMs());
console.log(`Throne Room path (lazy stages not touched): ${median(throne).toFixed(2)} ms`);
console.log(`three consumers after hoist (Throne path): ${median(throne).toFixed(2)} ms (once, shared)`);
