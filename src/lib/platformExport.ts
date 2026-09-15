/**
 * Full-platform export for /quality.
 * Reads realm + engine figures (never recomputes display values).
 * Reconciliations are first-principles checks that can FAIL.
 */

import type { Realm } from "@/domain/realm";
import type { PaymentsSnapshot } from "@/domain/types";
import type { QualityIssue } from "@/domain/quality";
import type { QualityLang } from "@/domain/quality_human";
import { isSubdividedFarm, isSold } from "@/domain/lot";
import {
  engineDefaultsFromRealm,
  runEngine,
  type EngineDefaults,
  type EngineResult,
} from "@/domain/engine";
import { reconcileThroneAndEngine } from "@/domain/reconcile";
import { GOAL_NET_PROFIT } from "@/config/goal";
import { mean, round2, sum } from "@/domain/math";
import { parseDate } from "@/domain/dates";
import { computeLotLedgers } from "@/domain/lotLedger";
import { money, moneyCompact, number as fmtNumber } from "@/lib/format";

/** Rounding: money stored to the cent. */
export const TOL_CENTS = 0.02;
/** Rounding: dollar figures after display rounding. */
export const TOL_DOLLAR = 1;
/**
 * debt_per_day: requiredNetProfitPerDay is rounded to cents before × daysLeft.
 * Do not change that arithmetic — this slack covers the $2–3 rounding residue.
 */
export const TOL_DEBT_PER_DAY = 5;
/**
 * lotsStillNeeded = ceil(remaining ÷ avg). The product can exceed remaining by less than one lot.
 * $250,000 is above any single lot's net in the book and well under 10% of remaining.
 */
export const TOL_ONE_LOT_CEIL = 250_000;
/**
 * Engine monthly interest vs avg outstanding × mix rate × years.
 * Modelling slack, stated percentage, under 10%. Never derived from the delta.
 */
export const TOL_INTEREST_MODEL_PCT = 0.08;
import { THRONE_ROOM_UI } from "@/i18n/throneRoom";
import { ENGINE_UI } from "@/i18n/engine";
import { QUALITY_UI } from "@/i18n/quality";
import { NAV_UI } from "@/i18n/nav";
import { TREASURY_UI } from "@/i18n/treasury";
import { PIPELINE_UI } from "@/i18n/pipeline";
import { WAR_PLAN_UI } from "@/i18n/warPlan";
import { } from "@/domain/goal";

export interface ExportFigure {
  id: string;
  page: string;
  section: string;
  label: string;
  displayed: string;
  raw: number | string | boolean | null;
  subtitle: string | null;
  units: string;
  source: { file: string; export: string };
  inputs: Record<string, number | string | boolean | null>;
  formula: string;
  assumption?: { name: string; value: number | string | boolean | null; default: number | string | boolean | null };
}

export interface ExportCheck {
  id: string;
  name: string;
  left: { label: string; value: number | null };
  right: { label: string; value: number | null };
  delta: number | null;
  tolerance: number;
  pass: boolean;
  failMeans: string;
}

export interface ExportExcludedRow {
  kind: string;
  id: string;
  name: string | null;
  reason: string;
  raw: Record<string, unknown>;
}

export interface PlatformExportDocument {
  meta: {
    snapshotAt: string;
    asOf: string;
    exitHorizon: number;
    deadline: string;
    commitSha: string;
    appVersion: string;
    lang: QualityLang;
    assumptions: { name: string; value: number | string | boolean | null; default: number | string | boolean | null }[];
  };
  summary: {
    checksRun: number;
    checksFailed: number;
    failures: { id: string; name: string; delta: number | null }[];
  };
  reconciliations: ExportCheck[];
  figures: ExportFigure[];
  pagesCovered: string[];
  rows: {
    lots: Record<string, unknown>[];
    farms: Record<string, unknown>[];
    fileCases: Record<string, unknown>[];
    notes: Record<string, unknown>[];
    noteSales: Record<string, unknown>[];
    investorDistributions: Record<string, unknown>[];
    propertyCosts: Record<string, unknown>[];
    investors: Record<string, unknown>[];
    clients: Record<string, unknown>[];
    lotLedgers: Record<string, unknown>[];
    history: Record<string, unknown>[];
  };
  excluded: ExportExcludedRow[];
  /** Ledger contradictions at export time — enough to re-render /quality from this document. */
  quality: QualityIssue[];
}

export interface BuildPlatformExportOptions {
  lang: QualityLang;
  exitHorizon: number;
  commitSha?: string;
  appVersion?: string;
  snapshotAt?: string;
  breakNetProfitToDate?: number;
}

export const EXPORT_PAGES = [
  "/",
  "/council",
  "/engine",
  "/warplan",
  "/exodus",
  "/realm",
  "/quests",
  "/pipeline",
  "/sponsors",
  "/treasury",
  "/oracle",
  "/chronicle",
  "/trophies",
  "/quality",
  "topbar",
  "drawer",
] as const;

function mkCheck(
  id: string,
  name: string,
  left: { label: string; value: number | null },
  right: { label: string; value: number | null },
  tolerance: number,
  failMeans: string,
): ExportCheck {
  const delta =
    left.value === null || right.value === null ? null : round2(left.value - right.value);
  return {
    id,
    name,
    left,
    right,
    delta,
    tolerance,
    pass: delta !== null && Math.abs(delta) <= tolerance,
    failMeans,
  };
}

function runEngineBundle(realm: Realm, lang: QualityLang): { engine: EngineResult; defaults: EngineDefaults } {
  const farm = realm.rotation.benchmark?.farmName ?? null;
  const defaults = engineDefaultsFromRealm(realm, farm);
  const engine = runEngine(defaults.inputs, { ...realm, referencePace: defaults.referencePace }, lang);
  return { engine, defaults };
}

function collectExcluded(snapshot: PaymentsSnapshot, lang: QualityLang): ExportExcludedRow[] {
  const out: ExportExcludedRow[] = [];
  const subdivided = new Set(snapshot.farmAcquisitions.filter((f) => isSubdividedFarm(f)).map((f) => f.id));

  for (const farm of snapshot.farmAcquisitions) {
    if (subdivided.has(farm.id)) continue;
    const lots = farm.total_lots ?? 0;
    out.push({
      kind: "farm_acquisition",
      id: farm.id,
      name: farm.farm_name,
      reason:
        lots <= 1
          ? lang === "es"
            ? "Finca no subdividida (total_lots ≤ 1)."
            : "Unsubdivided farm (total_lots ≤ 1)."
          : lang === "es"
            ? "Finca legada — excluida del inventario de Quest."
            : "Legacy farm — excluded from Quest inventory.",
      raw: { ...farm },
    });
  }

  for (const p of snapshot.properties) {
    if (p.farm_acquisition_id && subdivided.has(p.farm_acquisition_id)) continue;
    out.push({
      kind: "property",
      id: p.id,
      name: p.name,
      reason: !p.farm_acquisition_id
        ? lang === "es"
          ? "Propiedad sin farm_acquisition_id — invisible para Quest."
          : "Property with no farm_acquisition_id — invisible to Quest."
        : lang === "es"
          ? "Propiedad en finca no subdividida / legada."
          : "Property on an unsubdivided/legacy farm.",
      raw: { ...p },
    });
  }

  for (const c of snapshot.clients) {
    if (!c.is_test) continue;
    out.push({
      kind: "client",
      id: c.id,
      name: c.full_name,
      reason: lang === "es" ? "Cliente de prueba (is_test)." : "Test client (is_test).",
      raw: { ...c },
    });
  }

  for (const n of snapshot.notes) {
    if (!n.is_test) continue;
    out.push({
      kind: "note",
      id: n.id,
      name: n.note_code,
      reason: lang === "es" ? "Nota de prueba (is_test)." : "Test note (is_test).",
      raw: { ...n },
    });
  }

  return out;
}

function collectFigures(
  realm: Realm,
  engine: EngineResult,
  defaults: EngineDefaults,
  lang: QualityLang,
): ExportFigure[] {
  const g = realm.goal;
  const t = THRONE_ROOM_UI[lang];
  const e = ENGINE_UI[lang];
  const q = QUALITY_UI[lang];
  const nav = NAV_UI[lang];
  const tr = TREASURY_UI[lang];
  const pipe = PIPELINE_UI[lang];
  const wp = WAR_PLAN_UI[lang];
  const f = engine.figures;
  const lotsStr = g.lotsStillNeeded === null ? "—" : String(g.lotsStillNeeded);
  const farmsStr = g.farmsStillNeeded === null ? "—" : String(g.farmsStillNeeded);
  const peakSeries = engine.series.reduce((m, s) => Math.max(m, s.capitalOwed), 0);
  const priceMismatches = realm.quality.filter((i) => i.kind === "price_mismatch");
  const priceDelta = round2(
    sum(
      priceMismatches.map((i) => {
        const d = i.details as { fileCaseSalePrice?: number; noteOriginalAmount?: number };
        return Math.abs((d.fileCaseSalePrice ?? 0) - (d.noteOriginalAmount ?? 0));
      }),
    ),
  );
  const histCum = round2(sum(realm.history.map((h) => h.netProfit)));
  const soldCount = realm.lots.filter((l) => isSold(l)).length;

  return [
    {
      id: "throne.netProfitToDate",
      page: "/",
      section: "headline",
      label: lang === "es" ? "Utilidad neta al cierre" : "Net profit at closing",
      displayed: moneyCompact(g.netProfitToDate, lang),
      raw: g.netProfitToDate,
      subtitle: t.ofGoal(money(g.goal, lang), money(g.remaining, lang)),
      units: "USD",
      source: { file: "src/domain/goal.ts", export: "computeGoal" },
      inputs: { closedLots: g.closedLots, goal: g.goal },
      formula: "Σ (salePrice − landCost − sponsor take) of sold lots",
    },
    {
      id: "throne.noteLiquidityCost",
      page: "/",
      section: "headline",
      label: t.noteLiquidityCost,
      displayed: moneyCompact(realm.profitLayers.liquidityCostTotal, lang),
      raw: realm.profitLayers.liquidityCostTotal,
      subtitle: t.noteLiquiditySubtitle,
      units: "USD",
      source: { file: "src/domain/profitLayers.ts", export: "computeProfitLayers" },
      inputs: {
        realized: realm.profitLayers.liquidityCostRealized,
        notesSoldCount: realm.profitLayers.notesSoldCount,
        unrealized: realm.profitLayers.liquidityCostUnrealized,
        notesHeldCount: realm.profitLayers.notesHeldCount,
        noteSaleRatio: realm.profitLayers.noteSaleRatio,
        netProfitAtClosing: realm.profitLayers.netProfitAtClosing,
        sharePct: realm.profitLayers.liquidityCostSharePct,
      },
      formula:
        "realized Σ(noteFinancedAmount − noteSalePrice) over sold notes + unrealized Σ(noteFinancedAmount × (1 − measured note-sale ratio)) over held notes",
    },
    {
      id: "throne.notesHeldFace",
      page: "/",
      section: "headline",
      label: t.notesHeldFace,
      displayed: moneyCompact(realm.profitLayers.notesHeldFace, lang),
      raw: realm.profitLayers.notesHeldFace,
      subtitle: t.notesHeldHint(
        realm.profitLayers.notesHeldCount,
        money(realm.profitLayers.notesHeldAtRatio, lang),
        `${(realm.profitLayers.noteSaleRatio * 100).toFixed(1)}%`,
      ),
      units: "USD",
      source: { file: "src/domain/profitLayers.ts", export: "computeProfitLayers" },
      inputs: {
        notesHeldCount: realm.profitLayers.notesHeldCount,
        noteSaleRatio: realm.profitLayers.noteSaleRatio,
      },
      formula: "Σ financed_amount of closed lots whose note is not sold",
    },
    {
      id: "throne.notesHeldAtRatio",
      page: "/",
      section: "headline",
      label: lang === "es" ? "Notas en cartera al ratio medido" : "Notes held at the measured sale ratio",
      displayed: moneyCompact(realm.profitLayers.notesHeldAtRatio, lang),
      raw: realm.profitLayers.notesHeldAtRatio,
      subtitle: `${(realm.profitLayers.noteSaleRatio * 100).toFixed(1)}%`,
      units: "USD",
      source: { file: "src/domain/profitLayers.ts", export: "computeProfitLayers" },
      inputs: {
        notesHeldFace: realm.profitLayers.notesHeldFace,
        noteSaleRatio: realm.profitLayers.noteSaleRatio,
      },
      formula: "notesHeldFace × measured note-sale ratio",
    },
    {
      id: "throne.closingsToDate",
      page: "/",
      section: "headline",
      label: lang === "es" ? "Cierres a la fecha" : "Closings to date",
      displayed: fmtNumber(g.closedLots, lang),
      raw: g.closedLots,
      subtitle: null,
      units: "closings",
      source: { file: "src/domain/goal.ts", export: "computeGoal" },
      inputs: { closedLots: g.closedLots },
      formula: "count of sold lots",
    },
    {
      id: "throne.remaining",
      page: "/",
      section: "headline",
      label: lang === "es" ? "Restante" : "Remaining",
      displayed: moneyCompact(g.remaining, lang),
      raw: g.remaining,
      subtitle: null,
      units: "USD",
      source: { file: "src/domain/goal.ts", export: "computeGoal" },
      inputs: { goal: g.goal, netProfitToDate: g.netProfitToDate },
      formula: "goal − netProfitToDate",
    },
    {
      id: "throne.projectedExitAtCurrentPace",
      page: "/",
      section: "pace",
      label: t.projectedExitAtCurrentPace,
      displayed: realm.pathToGoal.projectedExitAtCurrentPace ?? "—",
      raw: realm.pathToGoal.projectedExitAtCurrentPace,
      subtitle: t.projectedExitFormula,
      units: "date",
      source: { file: "src/domain/pathToGoal.ts", export: "projectedExitAtCurrentPace" },
      inputs: {
        remaining: g.remaining,
        recentAvgNetProfitPerClosedLot: g.recentAvgNetProfitPerClosedLot,
        closedLotsPerMonth: g.closedLotsPerMonth,
      },
      formula: "addMonths(asOf, ceil(remaining ÷ era $/lot) ÷ closedLotsPerMonth)",
    },
    {
      id: "throne.lotsStillNeeded",
      page: "/",
      section: "pace",
      label: t.lotsStillNeeded(lotsStr),
      displayed: lotsStr,
      raw: g.lotsStillNeeded,
      subtitle: t.lotsStillNeededHint,
      units: "lots",
      source: { file: "src/domain/goal.ts", export: "computeGoal" },
      inputs: { remaining: g.remaining, avgNetProfitPerClosedLot: g.avgNetProfitPerClosedLot },
      formula: "ceil(remaining ÷ avgNetProfitPerClosedLot) — lifetime $/lot, not inventory",
    },
    {
      id: "throne.lotsStillNeededRecent",
      page: "/",
      section: "pace",
      label: t.lotsStillNeededEra(g.lotsStillNeededRecent === null ? "—" : String(g.lotsStillNeededRecent)),
      displayed: g.lotsStillNeededRecent === null ? "—" : String(g.lotsStillNeededRecent),
      raw: g.lotsStillNeededRecent,
      subtitle: t.lotsStillNeededEraHint,
      units: "lots",
      source: { file: "src/domain/goal.ts", export: "computeGoal" },
      inputs: { remaining: g.remaining, recentAvgNetProfitPerClosedLot: g.recentAvgNetProfitPerClosedLot },
      formula: "ceil(remaining ÷ recentAvgNetProfitPerClosedLot) — era $/lot",
    },
    {
      id: "warplan.requiredLotsNeeded",
      page: "/warplan",
      section: "required",
      label: t.warPlanLotsNeeded,
      displayed: String(realm.warPlan.required.lotsNeeded),
      raw: realm.warPlan.required.lotsNeeded,
      subtitle: t.warPlanLotsNeededHint,
      units: "lots",
      source: { file: "src/domain/warplan.ts", export: "solveWarPlan" },
      inputs: { closingsPerMonth: realm.warPlan.required.closingsPerMonth, deadline: g.deadline },
      formula: "Σ lotsClosed on the required-pace plan through the deadline (fractional last month)",
    },
    {
      id: "throne.farmsStillNeeded",
      page: "/",
      section: "pace",
      label: t.rotationFarms(farmsStr),
      displayed: farmsStr,
      raw: g.farmsStillNeeded,
      subtitle: t.rotationFarmsHint,
      units: "farms",
      source: { file: "src/domain/pathToGoal.ts", export: "computePathToGoal" },
      inputs: { farmsToBuy: realm.pathToGoal.farmsToBuy },
      formula: "warPlan.required.farmsToBuy — rotation schedule, not lots ÷ lots-per-farm",
    },
    {
      id: "throne.capitalOutstanding",
      page: "/",
      section: "rotation",
      label: t.capitalOutstanding,
      displayed: moneyCompact(realm.debt.capitalOwed, lang),
      raw: realm.debt.capitalOwed,
      subtitle:
        realm.debt.capitalCommittedUnfunded > 0
          ? `${t.capitalOutstandingHint} · ${t.capitalCommittedUnfunded(money(realm.debt.capitalCommittedUnfunded, lang))}`
          : t.capitalOutstandingHint,
      units: "USD",
      source: { file: "src/domain/debt.ts", export: "computeDebt" },
      inputs: {
        sponsorFarms: realm.farms.filter((f) => f.dealType !== "own_capital").length,
        capitalCommittedUnfunded: realm.debt.capitalCommittedUnfunded,
      },
      formula: "Σ capitalOutstanding where dealType ≠ own_capital and capital is already drawn",
    },
    {
      id: "throne.capitalCommittedUnfunded",
      page: "/",
      section: "rotation",
      label: lang === "es" ? "Capital comprometido, aún no fondeado" : "Capital committed, not yet funded",
      displayed: moneyCompact(realm.debt.capitalCommittedUnfunded, lang),
      raw: realm.debt.capitalCommittedUnfunded,
      subtitle:
        lang === "es"
          ? "Firmado, sin funding_date (o cierre futuro). Fuera del outstanding de hoy."
          : "Signed, no funding_date (or future closing). Out of today's outstanding.",
      units: "USD",
      source: { file: "src/domain/debt.ts", export: "computeDebt" },
      inputs: { unfundedFarms: realm.farms.filter((f) => !f.funded && f.dealType !== "own_capital").length },
      formula: "Σ capitalCommittedUnfunded where dealType ≠ own_capital",
    },
    {
      id: "throne.cashRealized",
      page: "/",
      section: "keyFigures",
      label: t.cashRealized,
      displayed: moneyCompact(g.cashRealized, lang),
      raw: g.cashRealized,
      subtitle:
        realm.treasury.totalOtherNoteSales > 0
          ? t.cashReconcile(
              money(g.cashRealized, lang),
              money(realm.treasury.totalOtherNoteSales, lang),
              money(realm.treasury.totalCashIn, lang),
            )
          : t.cashRealizedHint,
      units: "USD",
      source: { file: "src/domain/goal.ts", export: "computeGoal" },
      inputs: {},
      formula: "Σ lot.cashRealized",
    },
    {
      id: "throne.capitalReturnedToDate",
      page: "/",
      section: "keyFigures",
      label: lang === "es" ? "Capital devuelto a la fecha" : "Capital returned to date",
      displayed: moneyCompact(realm.treasury.totalCapitalReturns, lang),
      raw: realm.treasury.totalCapitalReturns,
      subtitle: null,
      units: "USD",
      source: { file: "src/domain/treasury.ts", export: "computeTreasury" },
      inputs: { capitalReturns: realm.treasury.totalCapitalReturns },
      formula: "Σ investor_distributions kind=capital",
    },
    {
      id: "throne.profitOnPaper",
      page: "/",
      section: "keyFigures",
      label: t.profitOnPaper,
      displayed: moneyCompact(g.profitOnPaper, lang),
      raw: g.profitOnPaper,
      subtitle: t.profitOnPaperHint,
      units: "USD",
      source: { file: "src/domain/goal.ts", export: "computeGoal" },
      inputs: { netProfitToDate: g.netProfitToDate, cashRealized: g.cashRealized },
      formula: "max(0, netProfitToDate − cashRealized)",
    },
    {
      id: "throne.requiredNetProfitPerDay",
      page: "/",
      section: "debtOxygen",
      label: lang === "es" ? "Utilidad neta requerida por día" : "Required net profit per day",
      displayed:
        realm.debt.requiredNetProfitPerDay === null
          ? "—"
          : moneyCompact(realm.debt.requiredNetProfitPerDay, lang),
      raw: realm.debt.requiredNetProfitPerDay,
      subtitle: null,
      units: "USD/day",
      source: { file: "src/domain/debt.ts", export: "computeDebt" },
      inputs: {
        remainingNetProfit: realm.debt.remainingNetProfit,
        daysLeft: realm.debt.daysLeft,
      },
      formula: "remainingNetProfit ÷ daysLeft",
    },
    {
      id: "throne.oxygen",
      page: "/",
      section: "debtOxygen",
      label: lang === "es" ? "Ritmo acumulado (días ganados)" : "Cumulative pace (days gained)",
      displayed: fmtNumber(realm.oxygen.totalDaysGained, lang),
      raw: realm.oxygen.totalDaysGained,
      subtitle:
        lang === "es"
          ? "Suma de todos los cierres. No es la pastilla de la barra (ventana de 90 días)."
          : "Sum over every closing. Not the topbar pill (90-day window).",
      units: "days",
      source: { file: "src/domain/oxygen.ts", export: "computeOxygen" },
      inputs: { closedLots: realm.oxygen.ranked.length },
      formula: "Σ daysGained over closed lots",
    },
    {
      id: "throne.oxygenTrailing",
      page: "/",
      section: "debtOxygen",
      label: lang === "es" ? "Ritmo de 90 días (barra superior)" : "Trailing 90-day pace (topbar)",
      displayed: `${fmtNumber(realm.oxygen.trailingDaysGained, lang)}/${fmtNumber(realm.oxygen.trailingWindowDays, lang)}`,
      raw: realm.oxygen.trailingDaysGained,
      subtitle:
        lang === "es"
          ? `Días ganados en los últimos ${realm.oxygen.trailingWindowDays} días. Cifra de la pastilla, no el acumulado.`
          : `Days gained in the last ${realm.oxygen.trailingWindowDays} days. The pill figure, not the cumulative.`,
      units: "days",
      source: { file: "src/domain/oxygen.ts", export: "computeOxygen" },
      inputs: {
        trailingDaysGained: realm.oxygen.trailingDaysGained,
        trailingWindowDays: realm.oxygen.trailingWindowDays,
      },
      formula: "Σ daysGained for closings inside the trailing window",
    },
    {
      id: "engine.netProfitAtDeadline",
      page: "/engine",
      section: "figures",
      label: e.netNoFresh,
      displayed: moneyCompact(f.netProfitAtDeadline, lang),
      raw: f.netProfitAtDeadline,
      subtitle: null,
      units: "USD",
      source: { file: "src/domain/engine.ts", export: "runEngine" },
      inputs: {
        salesPace: engine.inputs.salesPace,
        cycleMonths: engine.inputs.cycleMonths,
        freshCapital: f.freshCapital,
      },
      formula: "inventory + capital-turn simulation to deadline",
      assumption: {
        name: "salesPace",
        value: engine.inputs.salesPace,
        default: defaults.inputs.salesPace,
      },
    },
    {
      id: "engine.peakOutstanding",
      page: "/engine",
      section: "figures",
      label: e.peakOutstanding,
      displayed: moneyCompact(f.peakOutstanding, lang),
      raw: f.peakOutstanding,
      subtitle: e.peakHint,
      units: "USD",
      source: { file: "src/domain/engine.ts", export: "runEngine" },
      inputs: { seriesMax: peakSeries },
      formula: "max(monthly capitalOwed series)",
    },
    {
      id: "engine.totalInterest",
      page: "/engine",
      section: "figures",
      label: e.totalInterest,
      displayed: moneyCompact(f.totalInterest, lang),
      raw: f.totalInterest,
      subtitle:
        f.interestShareOfProfit !== null
          ? e.interestShareHint(`${fmtNumber(f.interestShareOfProfit, lang)}%`)
          : null,
      units: "USD",
      source: { file: "src/domain/engine.ts", export: "runEngine" },
      inputs: { peakOutstanding: f.peakOutstanding, months: engine.series.length },
      formula: "Σ monthly interest on simulated capital outstanding",
    },
    {
      id: "engine.turns",
      page: "/engine",
      section: "figures",
      label: e.turns,
      displayed: fmtNumber(f.turns, lang),
      raw: f.turns,
      subtitle: null,
      units: "turns",
      source: { file: "src/domain/engine.ts", export: "runEngine" },
      inputs: { farmsBought: f.farmsBought, peakOutstanding: f.peakOutstanding },
      formula: "Σ farm cost ÷ peakOutstanding",
    },
    {
      id: "engine.farmsNeeded",
      page: "/engine",
      section: "figures",
      label: e.shortfallFarms,
      displayed: fmtNumber(f.farmsNeeded, lang),
      raw: f.farmsNeeded,
      subtitle: null,
      units: "farms",
      source: { file: "src/domain/engine.ts", export: "runEngine" },
      inputs: { freshCapital: f.freshCapital, shortfallDollars: f.shortfallDollars },
      formula: "schedule delta when fresh capital > 0",
    },
    {
      id: "engine.bottleneck",
      page: "/engine",
      section: "verdict",
      label: e.bottleneck,
      displayed: e.bottleneckLabel[engine.bottleneck],
      raw: engine.bottleneck,
      subtitle: e.bottleneckDetail(engine.bottleneckCode),
      units: "enum",
      source: { file: "src/domain/engine.ts", export: "runEngine" },
      inputs: {},
      formula: "bottleneck classifier over the simulated path",
    },
    {
      id: "pipeline.stuck",
      page: "/pipeline",
      section: "stuck",
      label: (pipe as { stuckTitle?: string }).stuckTitle ?? (lang === "es" ? "Reservas atrapadas" : "Stuck reservations"),
      displayed: fmtNumber(realm.pipeline.stuck.length, lang),
      raw: realm.pipeline.stuck.length,
      subtitle: null,
      units: "lots",
      source: { file: "src/domain/pipeline.ts", export: "computePipeline" },
      inputs: {},
      formula: "reservations open longer than STUCK_AFTER_DAYS",
    },
    {
      id: "pipeline.conversion",
      page: "/pipeline",
      section: "conversion",
      label: lang === "es" ? "Conversión resuelta" : "Resolved conversion",
      displayed:
        realm.pipeline.conversion.resolvedPct === null
          ? "—"
          : lang === "es"
            ? `${realm.pipeline.conversion.resolvedPct}% — ${realm.pipeline.conversion.closed} de ${realm.pipeline.conversion.resolvedDenominator} resueltas · ${realm.pipeline.conversion.stillReserved} aún abiertas`
            : `${realm.pipeline.conversion.resolvedPct}% — ${realm.pipeline.conversion.closed} of ${realm.pipeline.conversion.resolvedDenominator} resolved · ${realm.pipeline.conversion.stillReserved} still open`,
      raw: realm.pipeline.conversion.resolvedPct,
      subtitle:
        realm.pipeline.conversion.pct === null
          ? null
          : lang === "es"
            ? `${realm.pipeline.conversion.pct}% incluye reservas sin resolver`
            : `${realm.pipeline.conversion.pct}% including unresolved reservations`,
      units: "%",
      source: { file: "src/domain/pipeline.ts", export: "computePipeline" },
      inputs: {
        closed: realm.pipeline.conversion.closed,
        cancelled: realm.pipeline.conversion.cancelled,
        resolvedDenominator: realm.pipeline.conversion.resolvedDenominator,
        stillReserved: realm.pipeline.conversion.stillReserved,
        blendedPct: realm.pipeline.conversion.pct,
      },
      formula: "closed ÷ (closed + cancelled); open count is part of the displayed figure",
    },
    {
      id: "treasury.cashIn",
      page: "/treasury",
      section: "totals",
      label: tr.cashIn,
      displayed: moneyCompact(realm.treasury.totalCashIn, lang),
      raw: realm.treasury.totalCashIn,
      subtitle:
        realm.treasury.totalOtherNoteSales > 0
          ? tr.cashInHintReconcile(
              money(g.cashRealized, lang),
              money(realm.treasury.totalOtherNoteSales, lang),
              money(realm.treasury.totalCashIn, lang),
              moneyCompact(realm.treasury.totalOtherNoteSales, lang),
            )
          : tr.cashInHintFarm(moneyCompact(realm.treasury.totalDownPayments, lang), moneyCompact(realm.treasury.totalNoteSales, lang)),
      units: "USD",
      source: { file: "src/domain/treasury.ts", export: "computeTreasury" },
      inputs: {
        downPayments: realm.treasury.totalDownPayments,
        noteSales: realm.treasury.totalNoteSales,
        otherNoteSales: realm.treasury.totalOtherNoteSales,
      },
      formula: "farm-lot down payments + farm-lot note sales + other note sales (non-farm lots) + undated",
    },
    {
      id: "treasury.cashOut",
      page: "/treasury",
      section: "totals",
      label: tr.cashOut,
      displayed: moneyCompact(realm.treasury.totalCashOut, lang),
      raw: realm.treasury.totalCashOut,
      subtitle: null,
      units: "USD",
      source: { file: "src/domain/treasury.ts", export: "computeTreasury" },
      inputs: {
        capitalReturns: realm.treasury.totalCapitalReturns,
        profitShares: realm.treasury.totalProfitShares,
      },
      formula: "capitalReturns + profitShares",
    },
    {
      id: "warplan.peakOutstanding",
      page: "/warplan",
      section: "rotation",
      label: wp.peakOutstanding,
      displayed: moneyCompact(realm.warPlan.rotation.peakOutstanding, lang),
      raw: realm.warPlan.rotation.peakOutstanding,
      subtitle: wp.peakHint,
      units: "USD",
      source: { file: "src/domain/warplan.ts", export: "solveWarPlan" },
      inputs: { turnsNeeded: realm.warPlan.rotation.turnsNeeded },
      formula: "max outstanding over the funded plan",
    },
    {
      id: "quality.issueCount",
      page: "/quality",
      section: "summary",
      label: q.issuesLabel,
      displayed: fmtNumber(realm.quality.length, lang),
      raw: realm.quality.length,
      subtitle: q.lotsWithIssuesCount(new Set(realm.quality.filter((i) => i.propertyId).map((i) => i.propertyId)).size),
      units: "issues",
      source: { file: "src/domain/quality.ts", export: "computeQualityIssues" },
      inputs: { issues: realm.quality.length },
      formula: "count of ledger contradictions (not distinct lots)",
    },
    {
      id: "quality.profitAffected",
      page: "/quality",
      section: "summary",
      label: q.profitAffected,
      displayed: moneyCompact(priceDelta, lang),
      raw: priceDelta,
      subtitle: q.profitAffectedHint(priceMismatches.length),
      units: "USD",
      source: { file: "src/domain/quality_human.ts", export: "summarizeQuality" },
      inputs: { mismatches: priceMismatches.length },
      formula: "Σ |fileCaseSalePrice − noteOriginalAmount| for price_mismatch",
    },
    {
      id: "chronicle.cumulativeNet",
      page: "/chronicle",
      section: "history",
      label: lang === "es" ? "Utilidad neta al cierre acumulada (actividad)" : "Cumulative net profit at closing (activity)",
      displayed: moneyCompact(histCum, lang),
      raw: histCum,
      subtitle: null,
      units: "USD",
      source: { file: "src/domain/history.ts", export: "computeMonthlyHistory" },
      inputs: { months: realm.history.length },
      formula: "Σ monthly netProfit",
    },
    {
      id: "council.verdict",
      page: "/council",
      section: "verdict",
      label: lang === "es" ? "Veredicto de recomendaciones" : "Recommendations verdict",
      displayed: g.verdict.slice(0, 160),
      raw: g.onTrack,
      subtitle: null,
      units: "text",
      source: { file: "src/domain/goal.ts", export: "computeGoal" },
      inputs: { onTrack: g.onTrack },
      formula: "pace vs required lots/month",
    },
    {
      id: "oracle.netPerLot",
      page: "/oracle",
      section: "defaults",
      label: lang === "es" ? "Utilidad neta por lote (simulador)" : "Net profit per lot (simulator)",
      displayed: moneyCompact(realm.goal.avgNetProfitPerClosedLot ?? 0, lang),
      raw: realm.goal.avgNetProfitPerClosedLot,
      subtitle: null,
      units: "USD/lot",
      source: { file: "src/domain/goal.ts", export: "computeGoal" },
      inputs: { avgSalePrice: realm.oracleDefaults.avgSalePrice },
      formula: "goal.avgNetProfitPerClosedLot (simulator uses sale/land averages separately)",
    },
    {
      id: "exodus.lpCapital",
      page: "/exodus",
      section: "target",
      label: lang === "es" ? "Capital LP a devolver" : "LP capital to return",
      displayed: moneyCompact((realm as { exodus?: { targetCapital?: number } }).exodus?.targetCapital ?? 10_000_000, lang),
      raw: (realm as { exodus?: { targetCapital?: number } }).exodus?.targetCapital ?? 10_000_000,
      subtitle: null,
      units: "USD",
      source: { file: "src/domain/exodus.ts", export: "computeExodus" },
      inputs: {},
      formula: "LP_CAPITAL_TO_RETURN",
    },
    {
      id: "quests.soldCount",
      page: "/quests",
      section: "ledger",
      label: lang === "es" ? "Lotes vendidos" : "Sold lots",
      displayed: fmtNumber(soldCount, lang),
      raw: soldCount,
      subtitle: null,
      units: "lots",
      source: { file: "src/domain/lot.ts", export: "computeLots" },
      inputs: {},
      formula: "count of lots in closed / note_sold",
    },
    {
      id: "realm.farmCount",
      page: "/realm",
      section: "map",
      label: lang === "es" ? "Fincas" : "Farms",
      displayed: fmtNumber(realm.farms.length, lang),
      raw: realm.farms.length,
      subtitle: null,
      units: "farms",
      source: { file: "src/domain/farm.ts", export: "computeFarms" },
      inputs: {},
      formula: "subdivided farms only",
    },
    {
      id: "sponsors.count",
      page: "/sponsors",
      section: "list",
      label: lang === "es" ? "Sponsors" : "Sponsors",
      displayed: fmtNumber(realm.investors.length, lang),
      raw: realm.investors.length,
      subtitle: null,
      units: "investors",
      source: { file: "src/domain/investors.ts", export: "computeInvestors" },
      inputs: {},
      formula: "investors with positions on subdivided farms",
    },
    {
      id: "trophies.count",
      page: "/trophies",
      section: "list",
      label: lang === "es" ? "Logros" : "Milestones",
      displayed: fmtNumber(realm.trophies.length, lang),
      raw: realm.trophies.length,
      subtitle: null,
      units: "trophies",
      source: { file: "src/domain/trophies.ts", export: "computeTrophies" },
      inputs: {},
      formula: "earned + locked trophies",
    },
    {
      id: "topbar.horizon",
      page: "topbar",
      section: "horizon",
      label: nav.exitHorizon,
      displayed: nav.exitYear(Number(g.deadline.slice(0, 4))),
      raw: g.deadline,
      subtitle: nav.exitHorizonCaption(Number(g.deadline.slice(0, 4))),
      units: "year",
      source: { file: "src/horizon/horizon.ts", export: "deadlineForHorizon" },
      inputs: { deadline: g.deadline },
      formula: "localStorage quest.v2.exitHorizon → Dec 31 of year",
    },
    {
      id: "drawer.pages",
      page: "drawer",
      section: "nav",
      label: nav.primaryNav,
      displayed: String(Object.keys(nav.byPath).length),
      raw: Object.keys(nav.byPath).length,
      subtitle: null,
      units: "routes",
      source: { file: "src/i18n/nav.ts", export: "NAV_UI" },
      inputs: {},
      formula: "drawer route count",
    },
  ];
}

/**
 * Reconciliations that were removed because the two sides measure different things.
 * A tolerance derived from the delta (or from max(left, right)) would make them
 * pass by construction and verify nothing:
 *
 * - treasury.totalCashIn vs goal.cashRealized — treasury includes non-farm-lot note
 *   sales (Kevin Shortle $57,000 on 2026-08-18). Both figures are labelled on screen.
 * - warPlan.rotation.peakOutstanding vs today's capital outstanding — plan peak ≠ books today.
 * - engine.turns vs chart block count — turns is Σ cost ÷ peak; blocks are visual lanes.
 * - engine.schedule.length vs series months with returns — different units / tautological.
 */
function runReconciliations(
  realm: Realm,
  engine: EngineResult,
  lang: QualityLang,
  netProfitOverride?: number,
): ExportCheck[] {
  const g = realm.goal;
  const netToDate = netProfitOverride ?? g.netProfitToDate;
  const soldNet = round2(sum(realm.lots.filter((l) => isSold(l)).map((l) => l.netProfit ?? 0)));
  const histCum = round2(sum(realm.history.map((m) => m.netProfit)));
  const peakSeries = round2(engine.series.reduce((m, s) => Math.max(m, s.capitalOwed), 0));

  const avgOutstanding = engine.series.length > 0 ? (mean(engine.series.map((s) => s.capitalOwed)) ?? 0) : 0;
  const years = engine.series.length / 12;
  const mix = engine.inputs.investorMix.filter((e) => e.dealType === "fixed_interest" && e.capital > 0);
  const mixCap = sum(mix.map((e) => e.capital));
  const weightedRate = mixCap > 0 ? sum(mix.map((e) => e.capital * e.ratePct)) / mixCap / 100 : 0.2;
  const interestApprox = round2(avgOutstanding * weightedRate * years);

  const stageSum =
    realm.lots.filter((l) => l.stage === "available").length +
    realm.lots.filter((l) => l.stage === "reserved").length +
    realm.lots.filter((l) => l.stage === "closed").length +
    realm.lots.filter((l) => l.stage === "note_sold").length;

  const conv = realm.pipeline.conversion;
  const convSum = conv.closed + conv.cancelled + conv.stillReserved;
  const oxygenSum = round2(sum(realm.oxygen.ranked.map((o) => o.daysGained)));
  const debtProduct =
    realm.debt.requiredNetProfitPerDay !== null
      ? round2(realm.debt.requiredNetProfitPerDay * realm.debt.daysLeft)
      : null;
  const lotsNeededProduct =
    g.lotsStillNeeded !== null && g.avgNetProfitPerClosedLot !== null
      ? round2(g.lotsStillNeeded * g.avgNetProfitPerClosedLot)
      : null;

  const throneEngine = reconcileThroneAndEngine(g, engine, "era", lang);
  const layers = realm.profitLayers;
  const salePriceLayersSum = round2(
    layers.cashAtClosing + layers.notesHeldFace + layers.noteSaleProceeds + layers.salePriceResidual,
  );
  const realizedLiquidityFromLots = round2(
    sum(realm.lots.filter((l) => l.noteIsSold || l.noteSaleId).map((l) => (l.noteFinancedAmount ?? 0) - (l.noteSalePrice ?? 0))),
  );

  return [
    mkCheck(
      "net_profit_sold_lots",
      lang === "es" ? "Σ utilidad neta al cierre lotes vendidos == goal.netProfitToDate" : "Σ net profit at closing sold lots == goal.netProfitToDate",
      { label: "Σ lot.netProfit (sold)", value: soldNet },
      { label: "goal.netProfitToDate", value: netToDate },
      TOL_CENTS,
      lang === "es"
        ? "La utilidad a la fecha no cuadra con la suma de los lotes vendidos."
        : "Net profit to date does not match the sum of sold lots.",
    ),
    mkCheck(
      "net_profit_chronicle",
      lang === "es" ? "goal.netProfitToDate == Σ actividad mensual" : "goal.netProfitToDate == Σ monthly activity",
      { label: "goal.netProfitToDate", value: netToDate },
      { label: "Σ history.netProfit", value: histCum },
      TOL_CENTS,
      lang === "es"
        ? "La actividad mensual no suma la utilidad a la fecha."
        : "Monthly activity does not sum to net profit to date.",
    ),
    mkCheck(
      "sale_price_layers",
      lang === "es"
        ? "efectivo al cierre + notas en cartera + notas vendidas + residual == Σ precio de venta"
        : "cash at closing + notes held + notes sold + residual == Σ sale price",
      {
        label: "cashAtClosing + notesHeldFace + noteSaleProceeds + residual",
        value: salePriceLayersSum,
      },
      { label: "Σ salePrice of sold lots", value: layers.salePriceSoldLots },
      TOL_CENTS,
      lang === "es"
        ? `El residual (${layers.salePriceResidual}) es el descuento en pagarés ya vendidos (precio − enganche − venta) más cualquier hueco entre el contrato y enganche + financiado en pagarés aún en cartera.`
        : `Residual (${layers.salePriceResidual}) is the discount on notes already sold (contract price − down − sale proceeds) plus any gap between contract price and down + financed on notes still held.`,
    ),
    mkCheck(
      "note_liquidity_cost_realized",
      lang === "es"
        ? "costo de liquidez realizado == Σ(financiado − precio de venta) sobre notas vendidas"
        : "realized liquidity cost == Σ(noteFinancedAmount − noteSalePrice) over sold notes",
      { label: "profitLayers.liquidityCostRealized", value: layers.liquidityCostRealized },
      { label: "Σ (noteFinancedAmount − noteSalePrice) sold notes", value: realizedLiquidityFromLots },
      TOL_DOLLAR,
      lang === "es"
        ? "El costo de liquidez realizado no cuadra con la suma de las notas vendidas."
        : "Realized liquidity cost does not match the sum over sold notes.",
    ),
    mkCheck(
      "goal_identity",
      lang === "es" ? "restante + utilidad a la fecha == 10,000,000" : "remaining + netProfitToDate == 10,000,000",
      { label: "remaining + netProfitToDate", value: round2(g.remaining + netToDate) },
      { label: "GOAL_NET_PROFIT", value: GOAL_NET_PROFIT },
      TOL_CENTS,
      lang === "es" ? "La identidad de la meta se rompió." : "Goal identity broke.",
    ),
    mkCheck(
      "lots_still_needed_residual",
      lang === "es" ? "lotsStillNeeded × avg ≈ remaining" : "lotsStillNeeded × avg ≈ remaining",
      { label: "lotsStillNeeded × avg", value: lotsNeededProduct },
      { label: "remaining", value: g.remaining },
      TOL_ONE_LOT_CEIL,
      lang === "es"
        ? "El redondeo de lotsStillNeeded se alejó demasiado del restante."
        : "lotsStillNeeded rounding drifted too far from remaining.",
    ),
    mkCheck(
      "throne_vs_path_farms",
      lang === "es" ? "Resumen farmsStillNeeded vs pathToGoal.farmsToBuy" : "Overview farmsStillNeeded vs pathToGoal.farmsToBuy",
      { label: "throne.farmsStillNeeded", value: g.farmsStillNeeded },
      { label: "pathToGoal.farmsToBuy", value: realm.pathToGoal.farmsToBuy },
      0,
      lang === "es"
        ? "Resumen y el pathToGoal compartido discrepan en fincas."
        : "Overview and shared pathToGoal disagree on farms.",
    ),
    mkCheck(
      "engine_peak_equals_series_max",
      lang === "es" ? "Proyección peakOutstanding == max(serie)" : "Capital projection peakOutstanding == max(series)",
      { label: "figures.peakOutstanding", value: engine.figures.peakOutstanding },
      { label: "max(series.capitalOwed)", value: peakSeries },
      TOL_CENTS,
      lang === "es"
        ? "La tarjeta de pico no coincide con el máximo de la serie simulada."
        : "Peak card does not match the simulated series maximum.",
    ),
    mkCheck(
      "engine_interest_vs_approx",
      lang === "es" ? "Interés total vs (promedio × tasa × años)" : "Total interest vs (avg × rate × years)",
      { label: "figures.totalInterest", value: engine.figures.totalInterest },
      { label: "avgOutstanding × rate × years", value: interestApprox },
      round2(interestApprox * TOL_INTEREST_MODEL_PCT),
      lang === "es"
        ? "El interés simulado diverge de la aproximación promedio×tasa×años más allá del 8 %."
        : "Simulated interest diverges from avg×rate×years beyond 8%.",
    ),
    mkCheck(
      "oxygen_sum",
      lang === "es" ? "Σ días ganados por lote == ritmo acumulado" : "Σ per-lot days gained == cumulative pace",
      { label: "Σ ranked.daysGained", value: oxygenSum },
      { label: "oxygen.totalDaysGained", value: realm.oxygen.totalDaysGained },
      0,
      lang === "es" ? "El ritmo acumulado no es la suma por lote." : "Cumulative pace is not the per-lot sum.",
    ),
    mkCheck(
      "debt_per_day",
      lang === "es" ? "requiredNetProfitPerDay × daysLeft == remaining" : "requiredNetProfitPerDay × daysLeft == remaining",
      { label: "required × daysLeft", value: debtProduct },
      { label: "debt.remainingNetProfit", value: realm.debt.remainingNetProfit },
      TOL_DEBT_PER_DAY,
      lang === "es"
        ? "El producto diario × días no recupera el restante."
        : "Daily requirement × days left does not recover remaining.",
    ),
    mkCheck(
      "lot_stage_sum",
      lang === "es" ? "available+reserved+closed+note_sold == total lots" : "available+reserved+closed+note_sold == total lots",
      { label: "stage sum", value: stageSum },
      { label: "lots.length", value: realm.lots.length },
      0,
      lang === "es" ? "Los estados de lote no cubren el inventario." : "Lot stages do not cover the inventory.",
    ),
    mkCheck(
      "pipeline_conversion_denom",
      lang === "es" ? "closed+cancelled+still-open == cohorte con cancelaciones" : "closed+cancelled+still-open == cohort with cancellations",
      { label: "closed+cancelled+stillReserved", value: convSum },
      { label: "cohortWithCancellations", value: conv.cohortWithCancellations },
      0,
      lang === "es"
        ? "El denominador de conversión del pipeline no cuadra."
        : "Pipeline conversion denominator does not add up.",
    ),
    mkCheck(
      "throne_engine_dollars",
      lang === "es" ? "Proyección Resumen vs Proyección de capital a la fecha límite" : "Overview projection vs Capital projection at deadline",
      { label: "throneProjectedAtDeadline", value: throneEngine.throneProjectedAtDeadline },
      { label: "engineNetAtDeadline", value: throneEngine.engineNetAtDeadline },
      TOL_DOLLAR,
      throneEngine.dollarReason ??
        (lang === "es"
          ? "Resumen (sin tope) y Proyección de capital (con inventario/capital) discrepan."
          : "Overview (unconstrained) and Capital projection (inventory/capital capped) disagree."),
    ),
  ];
}

export function buildPlatformExport(realm: Realm, opts: BuildPlatformExportOptions): PlatformExportDocument {
  const lang = opts.lang;
  const { engine, defaults } = runEngineBundle(realm, lang);
  const figures = collectFigures(realm, engine, defaults, lang);
  const reconciliations = runReconciliations(realm, engine, lang, opts.breakNetProfitToDate);
  const failed = reconciliations.filter((c) => !c.pass);
  const excluded = collectExcluded(realm.snapshot, lang);

  return {
    meta: {
      snapshotAt: opts.snapshotAt ?? new Date().toISOString(),
      asOf: realm.goal.asOf,
      exitHorizon: opts.exitHorizon,
      deadline: realm.goal.deadline,
      commitSha: opts.commitSha ?? "local",
      appVersion: opts.appVersion ?? "2.0.0",
      lang,
      assumptions: [
        { name: "salesPace", value: engine.inputs.salesPace, default: defaults.inputs.salesPace },
        { name: "cycleMonths", value: engine.inputs.cycleMonths, default: defaults.inputs.cycleMonths },
        { name: "costPerReservation", value: engine.inputs.costPerReservation, default: defaults.inputs.costPerReservation },
        { name: "conversionPct", value: engine.inputs.conversionPct, default: defaults.inputs.conversionPct },
        { name: "lotsPerFarm", value: engine.inputs.lotsPerFarm, default: defaults.inputs.lotsPerFarm },
        { name: "farmCost", value: engine.inputs.farmCost, default: defaults.inputs.farmCost },
        { name: "profitBasis", value: engine.inputs.profitBasis, default: defaults.inputs.profitBasis },
        { name: "exitHorizon", value: opts.exitHorizon, default: 2027 },
      ],
    },
    summary: {
      checksRun: reconciliations.length,
      checksFailed: failed.length,
      failures: failed.map((c) => ({ id: c.id, name: c.name, delta: c.delta })),
    },
    reconciliations,
    figures,
    pagesCovered: [...new Set(figures.map((f) => f.page))],
    rows: {
      lots: realm.lots.map((l) => ({ ...l })),
      farms: realm.farms.map((f) => ({ ...f })),
      fileCases: realm.snapshot.fileCases.map((r) => ({ ...r })),
      notes: realm.snapshot.notes.map((r) => ({ ...r })),
      noteSales: realm.snapshot.noteSales.map((r) => ({ ...r })),
      investorDistributions: realm.snapshot.investorDistributions.map((r) => ({ ...r })),
      propertyCosts: realm.snapshot.propertyCosts.map((r) => ({ ...r })),
      investors: realm.snapshot.investors.map((r) => ({ ...r })),
      clients: realm.snapshot.clients.map((r) => ({ ...r })),
      lotLedgers: [...computeLotLedgers(realm.snapshot, parseDate(realm.goal.asOf) ?? new Date(`${realm.goal.asOf}T00:00:00Z`), null).values()].map(
        (l) => ({
          farmId: l.farmId,
          farmName: l.farmName,
          asOf: l.asOf,
          ratePct: l.ratePct,
          lots: l.lots,
        }),
      ),
      history: realm.history.map((h) => ({ ...h })),
    },
    excluded,
    quality: realm.quality.map((issue) => ({ ...issue, details: { ...issue.details } })),
  };
}

export function renderPlatformExportText(doc: PlatformExportDocument): string {
  const lines: string[] = [];
  const m = doc.meta;
  lines.push("QUEST PLATFORM EXPORT");
  lines.push("=====================");
  lines.push(`Snapshot: ${m.snapshotAt}`);
  lines.push(`As of: ${m.asOf}`);
  lines.push(`Exit horizon: ${m.exitHorizon} (deadline ${m.deadline})`);
  lines.push(`Commit: ${m.commitSha}`);
  lines.push(`App version: ${m.appVersion}`);
  lines.push(`Language: ${m.lang}`);
  lines.push("");
  lines.push("RECONCILIATION SUMMARY");
  lines.push("----------------------");
  lines.push(`Checks run: ${doc.summary.checksRun}`);
  lines.push(`Checks failed: ${doc.summary.checksFailed}`);
  if (doc.summary.failures.length === 0) lines.push("All checks PASS.");
  else {
    lines.push("FAILURES (first):");
    for (const f of doc.summary.failures) {
      lines.push(`  FAIL  ${f.id} — ${f.name} (delta ${f.delta ?? "n/a"})`);
    }
  }
  lines.push("");
  lines.push("RECONCILIATIONS");
  lines.push("---------------");
  for (const c of doc.reconciliations) {
    lines.push(`${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
    lines.push(`  left:  ${c.left.label} = ${c.left.value}`);
    lines.push(`  right: ${c.right.label} = ${c.right.value}`);
    lines.push(`  delta: ${c.delta} (tolerance ${c.tolerance})`);
    if (!c.pass) lines.push(`  means: ${c.failMeans}`);
    lines.push("");
  }
  lines.push("ASSUMPTIONS");
  lines.push("-----------");
  for (const a of m.assumptions) lines.push(`  ${a.name}: ${a.value} (default ${a.default})`);
  lines.push("");
  lines.push("FIGURES BY PAGE");
  lines.push("---------------");
  const byPage = new Map<string, ExportFigure[]>();
  for (const f of doc.figures) {
    const list = byPage.get(f.page) ?? [];
    list.push(f);
    byPage.set(f.page, list);
  }
  for (const page of EXPORT_PAGES) {
    const list = byPage.get(page) ?? [];
    lines.push("");
    lines.push(`## ${page}`);
    if (list.length === 0) {
      lines.push("  (no figures harvested for this page in this build)");
      continue;
    }
    for (const f of list) {
      lines.push(`  ${f.label} / ${f.displayed} / ${f.subtitle ?? "—"}`);
      lines.push(`    raw=${JSON.stringify(f.raw)}  units=${f.units}  section=${f.section}`);
      lines.push(`    source: ${f.source.file} :: ${f.source.export}`);
      lines.push(`    formula: ${f.formula}`);
      lines.push(`    inputs: ${JSON.stringify(f.inputs)}`);
      if (f.assumption) {
        lines.push(`    assumption: ${f.assumption.name}=${f.assumption.value} (default ${f.assumption.default})`);
      }
    }
  }
  lines.push("");
  lines.push("ROWS");
  lines.push("----");
  lines.push(`lots: ${doc.rows.lots.length}`);
  lines.push(`farms: ${doc.rows.farms.length}`);
  lines.push(`fileCases: ${doc.rows.fileCases.length}`);
  lines.push(`notes: ${doc.rows.notes.length}`);
  lines.push(`noteSales: ${doc.rows.noteSales.length}`);
  lines.push(`investorDistributions: ${doc.rows.investorDistributions.length}`);
  lines.push(`propertyCosts: ${doc.rows.propertyCosts.length}`);
  lines.push(`investors: ${doc.rows.investors.length}`);
  lines.push(`clients: ${doc.rows.clients.length}`);
  lines.push(`history months: ${doc.rows.history.length}`);
  lines.push(`quality issues: ${doc.quality.length}`);
  lines.push("");
  lines.push(`EXCLUDED FROM QUEST (${doc.excluded.length})`);
  lines.push("---------------------");
  for (const ex of doc.excluded.slice(0, 500)) {
    lines.push(`  [${ex.kind}] ${ex.name ?? ex.id}: ${ex.reason}`);
  }
  if (doc.excluded.length > 500) lines.push(`  … ${doc.excluded.length - 500} more`);
  lines.push("");
  lines.push("LOT LEDGER (recompute keys)");
  lines.push("---------------------------");
  for (const lot of doc.rows.lots.slice(0, 300) as {
    propertyId?: string;
    name?: string;
    farmName?: string;
    stage?: string;
    salePrice?: number | null;
    landCost?: number;
    netProfit?: number | null;
  }[]) {
    lines.push(
      `  ${lot.farmName ?? "?"} / ${lot.name ?? lot.propertyId} / ${lot.stage} / sale=${lot.salePrice ?? "—"} / cost=${lot.landCost ?? "—"} / net=${lot.netProfit ?? "—"}`,
    );
  }
  if (doc.rows.lots.length > 300) lines.push(`  … ${doc.rows.lots.length - 300} more lots`);
  return lines.join("\n");
}

export function platformExportFilenames(doc: PlatformExportDocument): { json: string; text: string } {
  const day = doc.meta.asOf.slice(0, 10);
  const h = doc.meta.exitHorizon;
  return {
    json: `quest-export-${day}-h${h}.json`,
    text: `quest-export-${day}-h${h}.txt`,
  };
}

export function downloadPlatformExport(doc: PlatformExportDocument): void {
  const names = platformExportFilenames(doc);
  triggerDownload(names.json, JSON.stringify(doc, null, 2), "application/json");
  triggerDownload(names.text, renderPlatformExportText(doc), "text/plain");
}

function triggerDownload(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
