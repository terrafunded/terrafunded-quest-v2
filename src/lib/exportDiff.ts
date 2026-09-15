/**
 * Compare two platform exports and list only the state changes the nightly
 * job is allowed to alert on. No new figure logic — reads the document the
 * /quality Export button already builds.
 */

import type { PlatformExportDocument } from "./platformExport";

/** Alert when a numeric figure moves by more than this fraction of its previous value. */
export const FIGURE_CHANGE_ALERT_RATIO = 0.05;

/**
 * Facts that already happened. A change here without a new source row is a
 * rewrite of history, not a new closing or distribution.
 */
export const HISTORICAL_FACT_FIGURE_IDS = [
  "throne.netProfitToDate",
  "throne.closingsToDate",
  "throne.cashRealized",
  "throne.capitalReturnedToDate",
] as const;

export type HistoricalFactFigureId = (typeof HISTORICAL_FACT_FIGURE_IDS)[number];

/** Source tables that explain a historical-fact movement. */
export const HISTORICAL_FACT_SOURCE_TABLES = ["fileCases", "notes", "noteSales", "investorDistributions"] as const;

export type HistoricalFactSourceTable = (typeof HISTORICAL_FACT_SOURCE_TABLES)[number];

export type ExportAlertKind =
  | "reconciliation_flip"
  | "historical_fact"
  | "source_table_empty"
  | "new_excluded"
  | "figure_pct";

export interface ExportAlert {
  kind: ExportAlertKind;
  id: string;
  label: string;
  oldValue: string;
  newValue: string;
}

const HISTORICAL_FACT_SET = new Set<string>(HISTORICAL_FACT_FIGURE_IDS);

export function isHistoricalFactFigureId(id: string): id is HistoricalFactFigureId {
  return HISTORICAL_FACT_SET.has(id);
}

function rowId(row: Record<string, unknown>): string | null {
  const id = row.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function idsOf(rows: Record<string, unknown>[]): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    const id = rowId(row);
    if (id) out.add(id);
  }
  return out;
}

export function hasNewHistoricalSourceRow(prev: PlatformExportDocument, curr: PlatformExportDocument): boolean {
  for (const table of HISTORICAL_FACT_SOURCE_TABLES) {
    const before = idsOf(prev.rows[table]);
    for (const row of curr.rows[table]) {
      const id = rowId(row);
      if (id && !before.has(id)) return true;
    }
  }
  return false;
}

function numericRaw(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function formatValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "n/a";
  if (typeof raw === "boolean") return raw ? "true" : "false";
  if (typeof raw === "number") return Number.isFinite(raw) ? String(raw) : "n/a";
  return String(raw);
}

function figureMovedMoreThanRatio(oldRaw: number, newRaw: number, ratio: number): boolean {
  if (oldRaw === newRaw) return false;
  const denom = Math.abs(oldRaw);
  if (denom === 0) return newRaw !== 0;
  return Math.abs(newRaw - oldRaw) / denom > ratio;
}

export function diffExports(prev: PlatformExportDocument, curr: PlatformExportDocument): ExportAlert[] {
  const alerts: ExportAlert[] = [];

  const prevChecks = new Map(prev.reconciliations.map((c) => [c.id, c]));
  for (const check of curr.reconciliations) {
    const before = prevChecks.get(check.id);
    if (!before) continue;
    if (before.pass === check.pass) continue;
    alerts.push({
      kind: "reconciliation_flip",
      id: check.id,
      label: check.name,
      oldValue: before.pass ? "pass" : "fail",
      newValue: check.pass ? "pass" : "fail",
    });
  }

  const explained = hasNewHistoricalSourceRow(prev, curr);
  const prevFigures = new Map(prev.figures.map((f) => [f.id, f]));
  const historicalAlerted = new Set<string>();

  for (const figure of curr.figures) {
    if (!isHistoricalFactFigureId(figure.id)) continue;
    const before = prevFigures.get(figure.id);
    if (!before) continue;
    if (Object.is(before.raw, figure.raw)) continue;
    if (explained) continue;
    historicalAlerted.add(figure.id);
    alerts.push({
      kind: "historical_fact",
      id: figure.id,
      label: figure.label,
      oldValue: formatValue(before.raw),
      newValue: formatValue(figure.raw),
    });
  }

  for (const key of Object.keys(curr.rows) as (keyof PlatformExportDocument["rows"])[]) {
    const before = prev.rows[key]?.length ?? 0;
    const after = curr.rows[key]?.length ?? 0;
    if (before > 0 && after === 0) {
      alerts.push({
        kind: "source_table_empty",
        id: `rows.${key}`,
        label: key,
        oldValue: String(before),
        newValue: "0",
      });
    }
  }

  const prevExcluded = new Set(prev.excluded.map((e) => `${e.kind}:${e.id}`));
  for (const row of curr.excluded) {
    const key = `${row.kind}:${row.id}`;
    if (prevExcluded.has(key)) continue;
    alerts.push({
      kind: "new_excluded",
      id: key,
      label: row.name ?? row.id,
      oldValue: "included",
      newValue: row.reason,
    });
  }

  for (const figure of curr.figures) {
    const before = prevFigures.get(figure.id);
    if (!before) continue;
    if (historicalAlerted.has(figure.id)) continue;
    const oldRaw = numericRaw(before.raw);
    const newRaw = numericRaw(figure.raw);
    if (oldRaw === null || newRaw === null) continue;
    if (!figureMovedMoreThanRatio(oldRaw, newRaw, FIGURE_CHANGE_ALERT_RATIO)) continue;
    alerts.push({
      kind: "figure_pct",
      id: figure.id,
      label: figure.label,
      oldValue: formatValue(oldRaw),
      newValue: formatValue(newRaw),
    });
  }

  return alerts;
}

export interface AlertExportRef {
  date: string;
  horizon: number;
  commitSha: string;
  url: string;
}

export function formatExportAlertMessage(
  alerts: ExportAlert[],
  prevRef: AlertExportRef,
  currRef: AlertExportRef,
): string {
  const lines: string[] = [
    `Quest export changed — horizon ${currRef.horizon}`,
    "",
  ];
  for (const alert of alerts) {
    lines.push(`${alert.kind}: ${alert.label} (${alert.id})`);
    lines.push(`  old: ${alert.oldValue}`);
    lines.push(`  new: ${alert.newValue}`);
    lines.push("");
  }
  lines.push(`Previous: ${prevRef.url}`);
  lines.push(`Current:  ${currRef.url}`);
  return lines.join("\n").trimEnd();
}
