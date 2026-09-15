import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildRealm } from "@/domain/realm";
import {
  buildPlatformExport,
  renderPlatformExportText,
  EXPORT_PAGES,
  platformExportFilenames,
} from "./platformExport";
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
});
