import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildRealm } from "@/domain/realm";
import {
  buildPlatformExport,
  renderPlatformExportText,
  EXPORT_PAGES,
  platformExportFilenames,
  TOL_CENTS,
  TOL_DEBT_PER_DAY,
  TOL_DOLLAR,
  TOL_INTEREST_MODEL_PCT,
  TOL_ONE_LOT_CEIL,
} from "./platformExport";
import { round2, sum } from "@/domain/math";
import { engineDefaultsFromRealm, runEngine } from "@/domain/engine";
import { computeCouncil } from "@/domain/council";
import type { PaymentsSnapshot } from "@/domain/types";

const fixture = JSON.parse(
  readFileSync(new URL("../domain/__fixtures__/payments.json", import.meta.url), "utf8"),
) as PaymentsSnapshot;

const asOf = new Date("2026-09-11T00:00:00Z");

describe("platformExport", () => {
  it("builds a deterministic export covering every router page", () => {
    const realm = buildRealm(fixture, asOf, { deadline: "2027-12-31" });
    const doc = buildPlatformExport(realm, {
      lang: "en",
      exitHorizon: 2027,
      commitSha: "abc123",
      snapshotAt: "2026-09-11T12:00:00.000Z",
    });
    expect(doc.meta.commitSha).toBe("abc123");
    expect(doc.meta.exitHorizon).toBe(2027);
    expect(doc.figures.length).toBeGreaterThan(10);
    expect(doc.rows.lots.length).toBeGreaterThan(50);
    expect(doc.rows.farms.length).toBeGreaterThan(5);
    expect(doc.excluded.length).toBeGreaterThan(0);
    for (const page of EXPORT_PAGES) {
      expect(doc.pagesCovered, `missing page ${page}`).toContain(page);
    }
    expect(doc.reconciliations.length).toBeGreaterThanOrEqual(12);
    for (const c of doc.reconciliations) {
      expect(c.pass === true || c.pass === false).toBe(true);
      expect(c.left.label.length).toBeGreaterThan(0);
      expect(c.right.label.length).toBeGreaterThan(0);
    }
    const text = renderPlatformExportText(doc);
    expect(text).toContain("RECONCILIATION SUMMARY");
    expect(text).toContain("Checks run:");
    const names = platformExportFilenames(doc);
    expect(names.json).toMatch(/quest-export-2026-09-11-h2027\.json/);
    expect(names.text).toMatch(/\.txt$/);

    const again = buildPlatformExport(realm, {
      lang: "en",
      exitHorizon: 2027,
      commitSha: "abc123",
      snapshotAt: "2026-09-11T12:00:00.000Z",
    });
    expect(JSON.stringify(again.summary)).toBe(JSON.stringify(doc.summary));
    expect(JSON.stringify(again.reconciliations)).toBe(JSON.stringify(doc.reconciliations));
  });

  it("Spanish labels match the quality UI vocabulary", () => {
    const realm = buildRealm(fixture, asOf, { deadline: "2027-12-31", lang: "es" });
    const doc = buildPlatformExport(realm, { lang: "es", exitHorizon: 2027 });
    const profit = doc.figures.find((f) => f.id === "quality.profitAffected");
    expect(profit?.label).toBe("Ganancia afectada por diferencias de precio");
  });

  it("a deliberately broken net-profit figure makes the sold-lots check FAIL", () => {
    const realm = buildRealm(fixture, asOf, { deadline: "2027-12-31" });
    const broken = buildPlatformExport(realm, {
      lang: "en",
      exitHorizon: 2027,
      breakNetProfitToDate: 0,
    });
    const check = broken.reconciliations.find((c) => c.id === "net_profit_sold_lots");
    expect(check?.pass).toBe(false);
    expect(broken.summary.checksFailed).toBeGreaterThan(0);
    expect(broken.summary.failures.some((f) => f.id === "net_profit_sold_lots")).toBe(true);
  });

  it("capital outstanding equals Σ drawn sponsor capital when the subtitle excludes own capital", () => {
    const realm = buildRealm(fixture, asOf, { deadline: "2028-12-31" });
    const doc = buildPlatformExport(realm, { lang: "en", exitHorizon: 2028 });
    const fig = doc.figures.find((f) => f.id === "throne.capitalOutstanding");
    expect(fig).toBeDefined();
    expect(fig!.subtitle).toMatch(/excludes own-capital/i);
    const expected = round2(
      sum(realm.farms.filter((f) => f.dealType !== "own_capital").map((f) => f.capitalOutstanding)),
    );
    expect(fig!.raw).toBe(expected);
    expect(fig!.raw).toBe(realm.debt.capitalOwed);
    expect(fig!.raw).not.toBe(realm.goal.capitalOutstanding);
  });

  it("conversion display is the full statement and the denom check counts all three buckets", () => {
    const realm = buildRealm(fixture, asOf, { deadline: "2028-12-31" });
    const doc = buildPlatformExport(realm, { lang: "en", exitHorizon: 2028 });
    const fig = doc.figures.find((f) => f.id === "pipeline.conversion");
    const c = realm.pipeline.conversion;
    expect(fig?.displayed).toBe(
      `${c.resolvedPct}% — ${c.closed} of ${c.resolvedDenominator} resolved · ${c.stillReserved} still open`,
    );
    expect(fig?.subtitle).toMatch(/including unresolved/i);
    const check = doc.reconciliations.find((r) => r.id === "pipeline_conversion_denom");
    expect(check?.left.value).toBe(c.closed + c.cancelled + c.stillReserved);
    expect(check?.right.value).toBe(c.cohortWithCancellations);
    expect(check?.pass).toBe(true);
  });

  it("lot ledgers are populated from the domain, not stubbed empty", () => {
    const realm = buildRealm(fixture, asOf, { deadline: "2028-12-31" });
    const doc = buildPlatformExport(realm, { lang: "en", exitHorizon: 2028 });
    expect(doc.rows.lotLedgers.length).toBeGreaterThan(0);
  });

  it("quality displayed equals raw issue count, oxygen exports both cumulative and trailing, interest share has %", () => {
    const realm = buildRealm(fixture, asOf, { deadline: "2028-12-31" });
    const doc = buildPlatformExport(realm, { lang: "es", exitHorizon: 2028 });
    const quality = doc.figures.find((f) => f.id === "quality.issueCount");
    expect(quality?.displayed).toBe(String(realm.quality.length));
    expect(quality?.raw).toBe(realm.quality.length);
    expect(quality?.subtitle).toMatch(/lotes con problemas/i);

    const cumulative = doc.figures.find((f) => f.id === "throne.oxygen");
    const trailing = doc.figures.find((f) => f.id === "throne.oxygenTrailing");
    expect(cumulative?.raw).toBe(realm.oxygen.totalDaysGained);
    expect(trailing?.raw).toBe(realm.oxygen.trailingDaysGained);
    expect(trailing?.displayed).toContain(`/${realm.oxygen.trailingWindowDays}`);

    const interest = doc.figures.find((f) => f.id === "engine.totalInterest");
    expect(interest?.subtitle).toMatch(/%/);
  });

  it("no reconciliation tolerance is derived from its own delta or from max(left, right)", () => {
    const realm = buildRealm(fixture, asOf, { deadline: "2028-12-31" });
    const doc = buildPlatformExport(realm, { lang: "en", exitHorizon: 2028 });
    for (const c of doc.reconciliations) {
      expect(
        [TOL_CENTS, TOL_DOLLAR, TOL_DEBT_PER_DAY, TOL_ONE_LOT_CEIL, 0].includes(c.tolerance) ||
          c.id === "engine_interest_vs_approx",
        `${c.id} uses a named constant tolerance`,
      ).toBe(true);
      if (c.id === "engine_interest_vs_approx") {
        expect(TOL_INTEREST_MODEL_PCT).toBeLessThan(0.1);
        expect(c.tolerance).toBe(round2((c.right.value ?? 0) * TOL_INTEREST_MODEL_PCT));
      }
      if (c.delta === null || Math.abs(c.delta) === 0) continue;
      expect(c.tolerance, `${c.id} tolerance equals |delta|`).not.toBe(Math.abs(c.delta));
      expect(c.tolerance, `${c.id} tolerance equals |delta|+1`).not.toBe(Math.abs(c.delta) + 1);
      const maxSide = Math.max(Math.abs(c.left.value ?? 0), Math.abs(c.right.value ?? 0), 1);
      expect(c.tolerance, `${c.id} tolerance equals max(|left|,|right|)`).not.toBe(maxSide);
    }
  });

  it("runReconciliations source never derives a tolerance from the compared values or their delta", () => {
    const src = readFileSync(new URL("./platformExport.ts", import.meta.url), "utf8");
    const start = src.indexOf("function runReconciliations");
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, src.indexOf("export function buildPlatformExport"));
    expect(body).not.toMatch(/treasuryGap/);
    expect(body).not.toMatch(/tolerance:\s*Math\.max/);
    expect(body).not.toMatch(/\+\s*1\s*,\s*\n\s*lang ===/);
    expect(body).toContain("TOL_CENTS");
    expect(body).toContain("TOL_DEBT_PER_DAY");
    expect(body).toContain("TOL_ONE_LOT_CEIL");
    expect(body).toContain("TOL_INTEREST_MODEL_PCT");
    expect(body).not.toMatch(/id:\s*"treasury_vs_cash"/);
    expect(body).not.toMatch(/id:\s*"rotation_vs_outstanding"/);
    expect(body).not.toMatch(/id:\s*"engine_turns_vs_blocks"/);
    expect(body).not.toMatch(/id:\s*"engine_return_events"/);
  });

  it("Council never says short when the Engine says covered, and vice versa", () => {
    for (const year of [2027, 2028, 2029] as const) {
      const realm = buildRealm(fixture, asOf, { deadline: `${year}-12-31` });
      const defaults = engineDefaultsFromRealm(realm, realm.rotation.benchmark?.farmName ?? null);
      const engine = runEngine(defaults.inputs, { ...realm, referencePace: defaults.referencePace }, "en");
      const covered = engine.figures.shortfallDollars <= 0;
      const council = computeCouncil(realm, "en");
      const pace = council.find((i) => i.rule === "pace");
      const conversion = council.find((i) => i.rule === "conversion");
      expect(pace).toBeDefined();
      expect(conversion).toBeDefined();
      if (covered) {
        expect(pace!.severity, `${year} Engine covered`).not.toBe("critical");
        expect(pace!.title.toLowerCase()).toContain("covers");
        expect(conversion!.severity, `${year} conversion vs covered`).not.toBe("warning");
      } else {
        expect(pace!.severity, `${year} Engine short`).toBe("critical");
        expect(pace!.title.toLowerCase()).not.toContain("covers");
      }
    }
  });
});
