import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildRealm } from "@/domain/realm";
import type { PaymentsSnapshot } from "@/domain/types";
import {
  diffExports,
  FIGURE_CHANGE_ALERT_RATIO,
  formatExportAlertMessage,
  hasNewHistoricalSourceRow,
  HISTORICAL_FACT_FIGURE_IDS,
} from "./exportDiff";
import { buildPlatformExport, type PlatformExportDocument } from "./platformExport";

const fixture = JSON.parse(
  readFileSync(new URL("../domain/__fixtures__/payments.json", import.meta.url), "utf8"),
) as PaymentsSnapshot;

const asOf = new Date("2026-09-11T00:00:00Z");

function exportOf(snapshot = fixture): PlatformExportDocument {
  const realm = buildRealm(snapshot, asOf, { deadline: "2028-12-31" });
  return buildPlatformExport(realm, {
    lang: "en",
    exitHorizon: 2028,
    commitSha: "abc123",
    snapshotAt: "2026-09-11T12:00:00.000Z",
  });
}

function cloneDoc(doc: PlatformExportDocument): PlatformExportDocument {
  return JSON.parse(JSON.stringify(doc)) as PlatformExportDocument;
}

describe("exportDiff", () => {
  it("the same snapshot twice produces no alert", () => {
    const a = exportOf();
    const b = exportOf();
    expect(diffExports(a, b)).toEqual([]);
  });

  it("a reconciliation that flips pass→fail is exactly one alert", () => {
    const prev = exportOf();
    const curr = cloneDoc(prev);
    const check = curr.reconciliations.find((c) => c.pass);
    expect(check).toBeTruthy();
    if (!check) throw new Error("need a passing check");
    check.pass = false;
    const alerts = diffExports(prev, curr);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.kind).toBe("reconciliation_flip");
    expect(alerts[0]?.id).toBe(check.id);
    expect(alerts[0]?.oldValue).toBe("pass");
    expect(alerts[0]?.newValue).toBe("fail");
  });

  it("a historical-fact figure change without a new source row alerts", () => {
    const prev = exportOf();
    const curr = cloneDoc(prev);
    const profit = curr.figures.find((f) => f.id === "throne.netProfitToDate");
    expect(profit).toBeTruthy();
    if (!profit || typeof profit.raw !== "number") throw new Error("need net profit");
    profit.raw = profit.raw + 1;
    expect(hasNewHistoricalSourceRow(prev, curr)).toBe(false);
    const alerts = diffExports(prev, curr);
    expect(alerts.some((a) => a.kind === "historical_fact" && a.id === "throne.netProfitToDate")).toBe(true);
  });

  it("a historical-fact figure change with a new file_cases row does not fire that alert", () => {
    const prev = exportOf();
    const curr = cloneDoc(prev);
    const profit = curr.figures.find((f) => f.id === "throne.netProfitToDate");
    if (!profit || typeof profit.raw !== "number") throw new Error("need net profit");
    profit.raw = profit.raw + 1;
    curr.rows.fileCases.push({ id: "new-case-for-diff", status: "closed" });
    const alerts = diffExports(prev, curr);
    expect(alerts.some((a) => a.kind === "historical_fact")).toBe(false);
  });

  it("a source table that drops from rows to zero alerts", () => {
    const prev = exportOf();
    const curr = cloneDoc(prev);
    expect(curr.rows.notes.length).toBeGreaterThan(0);
    curr.rows.notes = [];
    const alerts = diffExports(prev, curr);
    expect(alerts.some((a) => a.kind === "source_table_empty" && a.id === "rows.notes")).toBe(true);
  });

  it("a new excluded row alerts", () => {
    const prev = exportOf();
    const curr = cloneDoc(prev);
    curr.excluded.push({
      kind: "property",
      id: "new-dropped-property",
      name: "Dropped Lot",
      reason: "Quest started dropping this property",
      raw: {},
    });
    const alerts = diffExports(prev, curr);
    expect(alerts.some((a) => a.kind === "new_excluded" && a.id === "property:new-dropped-property")).toBe(true);
  });

  it(`a figure that moves by more than ${FIGURE_CHANGE_ALERT_RATIO * 100}% alerts`, () => {
    const prev = exportOf();
    const curr = cloneDoc(prev);
    const remaining = curr.figures.find((f) => f.id === "throne.remaining");
    expect(remaining && typeof remaining.raw === "number").toBe(true);
    if (!remaining || typeof remaining.raw !== "number") throw new Error("need remaining");
    remaining.raw = remaining.raw * (1 + FIGURE_CHANGE_ALERT_RATIO + 0.01);
    const alerts = diffExports(prev, curr);
    expect(alerts.some((a) => a.kind === "figure_pct" && a.id === "throne.remaining")).toBe(true);
  });

  it("the alert message names the change, both values, and both export links", () => {
    const text = formatExportAlertMessage(
      [{ kind: "reconciliation_flip", id: "sold_lots_net", label: "Sold lots net", oldValue: "pass", newValue: "fail" }],
      { date: "2026-09-14", horizon: 2028, commitSha: "aaa", url: "https://quest.example/quality?nightlyDate=2026-09-14&horizon=2028&sha=aaa" },
      { date: "2026-09-15", horizon: 2028, commitSha: "bbb", url: "https://quest.example/quality?nightlyDate=2026-09-15&horizon=2028&sha=bbb" },
    );
    expect(text).toContain("old: pass");
    expect(text).toContain("new: fail");
    expect(text).toContain("nightlyDate=2026-09-14");
    expect(text).toContain("nightlyDate=2026-09-15");
  });

  it("every historical-fact id is present on a real export", () => {
    const doc = exportOf();
    for (const id of HISTORICAL_FACT_FIGURE_IDS) {
      expect(doc.figures.some((f) => f.id === id), id).toBe(true);
    }
    expect(doc.quality.length).toBeGreaterThan(0);
  });
});
