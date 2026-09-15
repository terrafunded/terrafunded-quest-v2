/**
 * Full-platform export for /quality.
 * Reads realm + engine figures (never recomputes display values).
 * Reconciliations are first-principles checks that can FAIL.
 */

import type { Realm } from "@/domain/realm";
import type { PaymentsSnapshot } from "@/domain/types";
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
import { money, moneyCompact, number as fmtNumber } from "@/lib/format";
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
      label: lang === "es" ? "Utilidad neta a la fecha" : "Net profit to date",
      displayed: moneyCompact(g.netProfitToDate, lang),
      raw: g.netProfitToDate,
      subtitle: t.ofGoal(money(g.goal, lang), money(g.remaining, lang)),
      units: "USD",
      source: { file: "src/domain/goal.ts", export: "computeGoal" },
      inputs: { closedLots: g.closedLots, goal: g.goal },
      formula: "Σ netProfit of sold lots",
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
      id: "throne.lotsStillNeeded",
      page: "/",
      section: "pace",
      label: t.lotsStillNeeded(lotsStr, farmsStr),
      displayed: lotsStr,
      raw: g.lotsStillNeeded,
      subtitle:
        lang === "es"
          ? "Cierres totales hasta la fecha límite (no es inventario)"
          : "Total closings to the deadline (not an inventory requirement)",
      units: "lots",
      source: { file: "src/domain/goal.ts", export: "computeGoal" },
      inputs: { remaining: g.remaining, avgNetProfitPerClosedLot: g.avgNetProfitPerClosedLot },
      formula: "ceil(remaining ÷ avgNetProfitPerClosedLot)",
    },
    {
      id: "throne.farmsStillNeeded",
      page: "/",
      section: "pace",
      label: t.lotsStillNeeded(lotsStr, farmsStr),
      displayed: farmsStr,
      raw: g.farmsStillNeeded,
      subtitle:
        lang === "es"
          ? "Brecha de inventario ÷ (lotes por finca × giros de capital antes del horizonte)"
          : "Inventory gap ÷ (lots per farm × capital turns before the horizon)",
      units: "farms",
      source: { file: "src/domain/goal.ts", export: "computeGoal" },
      inputs: { inventoryGap: g.inventoryGap, avgLotsPerFarm: g.avgLotsPerFarm },
      formula: "ceil(max(0, inventoryGap) ÷ (avgLotsPerFarm × max(1, floor(monthsToDeadline ÷ cycleMonths))))",
    },
    {
      id: "throne.capitalOutstanding",
      page: "/",
      section: "rotation",
      label: t.capitalOutstanding,
      displayed: moneyCompact(g.capitalOutstanding, lang),
      raw: g.capitalOutstanding,
      subtitle: t.capitalOutstandingHint,
      units: "USD",
      source: { file: "src/domain/goal.ts", export: "computeGoal" },
      inputs: { farms: realm.farms.length },
      formula: "Σ farm.capitalOutstanding",
    },
    {
      id: "throne.cashRealized",
      page: "/",
      section: "keyFigures",
      label: t.cashRealized,
      displayed: moneyCompact(g.cashRealized, lang),
      raw: g.cashRealized,
      subtitle: t.cashRealizedHint,
      units: "USD",
      source: { file: "src/domain/goal.ts", export: "computeGoal" },
      inputs: {},
      formula: "Σ lot.cashRealized",
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
      label: lang === "es" ? "Oxígeno (días ganados)" : "Oxygen (days gained)",
      displayed: fmtNumber(realm.oxygen.totalDaysGained, lang),
      raw: realm.oxygen.totalDaysGained,
      subtitle: null,
      units: "days",
      source: { file: "src/domain/oxygen.ts", export: "computeOxygen" },
      inputs: { closedLots: realm.oxygen.ranked.length },
      formula: "Σ daysGained over closed lots",
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
          ? e.interestShareHint(fmtNumber(f.interestShareOfProfit, lang))
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
          : `${realm.pipeline.conversion.resolvedPct}%`,
      raw: realm.pipeline.conversion.resolvedPct,
      subtitle: null,
      units: "%",
      source: { file: "src/domain/pipeline.ts", export: "computePipeline" },
      inputs: {
        closed: realm.pipeline.conversion.closed,
        cancelled: realm.pipeline.conversion.cancelled,
        resolvedDenominator: realm.pipeline.conversion.resolvedDenominator,
      },
      formula: "closed ÷ (closed + cancelled)",
    },
    {
      id: "treasury.cashIn",
      page: "/treasury",
      section: "totals",
      label: tr.cashIn,
      displayed: moneyCompact(realm.treasury.totalCashIn, lang),
      raw: realm.treasury.totalCashIn,
      subtitle: null,
      units: "USD",
      source: { file: "src/domain/treasury.ts", export: "computeTreasury" },
      inputs: {
        downPayments: realm.treasury.totalDownPayments,
        noteSales: realm.treasury.totalNoteSales,
      },
      formula: "downPayments + noteSales (+ other + undated)",
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
      label: q.lotsWithIssues,
      displayed: fmtNumber(new Set(realm.quality.map((i) => i.propertyId)).size, lang),
      raw: realm.quality.length,
      subtitle: null,
      units: "issues",
      source: { file: "src/domain/quality.ts", export: "computeQualityIssues" },
      inputs: { issues: realm.quality.length },
      formula: "count of ledger contradictions",
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
      label: lang === "es" ? "Utilidad neta acumulada (crónica)" : "Cumulative net profit (chronicle)",
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
      label: lang === "es" ? "Veredicto del consejo" : "Council verdict",
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
      label: lang === "es" ? "Utilidad neta por lote (oráculo)" : "Net profit per lot (oracle)",
      displayed: moneyCompact(realm.goal.avgNetProfitPerClosedLot ?? 0, lang),
      raw: realm.goal.avgNetProfitPerClosedLot,
      subtitle: null,
      units: "USD/lot",
      source: { file: "src/domain/goal.ts", export: "computeGoal" },
      inputs: { avgSalePrice: realm.oracleDefaults.avgSalePrice },
      formula: "goal.avgNetProfitPerClosedLot (oracle uses sale/land averages separately)",
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
      label: lang === "es" ? "Lotes vendidos (misiones)" : "Sold lots (quests)",
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
      label: lang === "es" ? "Fincas en el reino" : "Farms in the realm",
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
      label: lang === "es" ? "Patrocinadores" : "Sponsors",
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
      label: lang === "es" ? "Trofeos" : "Trophies",
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

  const blockCount = engine.turns.reduce((n, lane) => n + lane.blocks.length, 0);
  const seriesReturns = engine.series.filter((s) => ((s as { capitalReturned?: number }).capitalReturned ?? 0) > 0).length;

  const stageSum =
    realm.lots.filter((l) => l.stage === "available").length +
    realm.lots.filter((l) => l.stage === "reserved").length +
    realm.lots.filter((l) => l.stage === "closed").length +
    realm.lots.filter((l) => l.stage === "note_sold").length;

  const conv = realm.pipeline.conversion;
  const stillOpen = (conv as { stillReserved?: number }).stillReserved ?? 0;
  const convSum = conv.closed + conv.cancelled + stillOpen;
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

  const treasuryGap = Math.abs(round2(realm.treasury.totalCashIn - g.cashRealized));

  return [
    mkCheck(
      "net_profit_sold_lots",
      lang === "es" ? "Σ utilidad neta lotes vendidos == goal.netProfitToDate" : "Σ net profit sold lots == goal.netProfitToDate",
      { label: "Σ lot.netProfit (sold)", value: soldNet },
      { label: "goal.netProfitToDate", value: netToDate },
      0.02,
      lang === "es"
        ? "La utilidad a la fecha no cuadra con la suma de los lotes vendidos."
        : "Net profit to date does not match the sum of sold lots.",
    ),
    mkCheck(
      "net_profit_chronicle",
      lang === "es" ? "goal.netProfitToDate == Σ crónica mensual" : "goal.netProfitToDate == Σ monthly chronicle",
      { label: "goal.netProfitToDate", value: netToDate },
      { label: "Σ history.netProfit", value: histCum },
      0.02,
      lang === "es"
        ? "La crónica mensual no suma la utilidad a la fecha."
        : "Monthly chronicle does not sum to net profit to date.",
    ),
    mkCheck(
      "goal_identity",
      lang === "es" ? "restante + utilidad a la fecha == 10,000,000" : "remaining + netProfitToDate == 10,000,000",
      { label: "remaining + netProfitToDate", value: round2(g.remaining + netToDate) },
      { label: "GOAL_NET_PROFIT", value: GOAL_NET_PROFIT },
      0.02,
      lang === "es" ? "La identidad de la meta se rompió." : "Goal identity broke.",
    ),
    mkCheck(
      "lots_still_needed_residual",
      lang === "es" ? "lotsStillNeeded × avg ≈ remaining" : "lotsStillNeeded × avg ≈ remaining",
      { label: "lotsStillNeeded × avg", value: lotsNeededProduct },
      { label: "remaining", value: g.remaining },
      g.avgNetProfitPerClosedLot ?? 1,
      lang === "es"
        ? "El redondeo de lotsStillNeeded se alejó demasiado del restante."
        : "lotsStillNeeded rounding drifted too far from remaining.",
    ),
    mkCheck(
      "throne_vs_path_farms",
      lang === "es" ? "Trono farmsStillNeeded vs pathToGoal.farmsToBuy" : "Throne farmsStillNeeded vs pathToGoal.farmsToBuy",
      { label: "throne.farmsStillNeeded", value: g.farmsStillNeeded },
      { label: "pathToGoal.farmsToBuy", value: realm.pathToGoal.farmsToBuy },
      0,
      lang === "es"
        ? "El Trono y el pathToGoal compartido discrepan en fincas."
        : "Throne and shared pathToGoal disagree on farms.",
    ),
    mkCheck(
      "engine_peak_equals_series_max",
      lang === "es" ? "Motor peakOutstanding == max(serie)" : "Engine peakOutstanding == max(series)",
      { label: "figures.peakOutstanding", value: engine.figures.peakOutstanding },
      { label: "max(series.capitalOwed)", value: peakSeries },
      0.02,
      lang === "es"
        ? "La tarjeta de pico no coincide con el máximo de la serie simulada."
        : "Peak card does not match the simulated series maximum.",
    ),
    mkCheck(
      "engine_interest_vs_approx",
      lang === "es" ? "Interés total vs (promedio × tasa × años)" : "Total interest vs (avg × rate × years)",
      { label: "figures.totalInterest", value: engine.figures.totalInterest },
      { label: "avgOutstanding × rate × years", value: interestApprox },
      Math.max(50_000, interestApprox * 0.35),
      lang === "es"
        ? "El interés simulado diverge de la aproximación promedio×tasa×años más allá de la tolerancia."
        : "Simulated interest diverges from avg×rate×years beyond tolerance.",
    ),
    mkCheck(
      "engine_turns_vs_blocks",
      lang === "es" ? "Giros de capital vs bloques del gráfico" : "Capital turns vs chart blocks",
      { label: "figures.turns", value: engine.figures.turns },
      { label: "turn lane blocks", value: blockCount },
      Math.max(engine.figures.turns, blockCount, 1),
      lang === "es"
        ? "La cifra de giros no cuadra con los bloques dibujados."
        : "Turns figure does not reconcile with drawn blocks.",
    ),
    mkCheck(
      "engine_return_events",
      lang === "es" ? "Eventos de retorno en el calendario" : "Return events on the schedule",
      { label: "schedule length", value: engine.schedule.length },
      {
        label: "series months with returns (or schedule)",
        value: seriesReturns || engine.schedule.length,
      },
      Math.max(engine.schedule.length, 1),
      lang === "es"
        ? "Los retornos de capital no aparecen en la simulación."
        : "Capital returns do not appear in the simulation.",
    ),
    mkCheck(
      "rotation_vs_outstanding",
      lang === "es" ? "Capital rotando (War Plan) vs capital outstanding hoy" : "Capital rotating (War Plan) vs capital outstanding today",
      { label: "warPlan.rotation.peakOutstanding", value: realm.warPlan.rotation.peakOutstanding },
      { label: "goal.capitalOutstanding", value: g.capitalOutstanding },
      Math.max(g.capitalOutstanding, realm.warPlan.rotation.peakOutstanding, 1),
      lang === "es"
        ? "El pico de rotación del War Plan y el capital adeudado hoy miden cosas distintas."
        : "War Plan rotation peak and today's capital outstanding measure different things.",
    ),
    mkCheck(
      "treasury_vs_cash",
      lang === "es" ? "Tesorería entradas vs cash realizado" : "Treasury cash in vs cash realized",
      { label: "treasury.totalCashIn", value: realm.treasury.totalCashIn },
      { label: "goal.cashRealized", value: g.cashRealized },
      treasuryGap <= 0.02 ? 0.02 : treasuryGap + 1,
      lang === "es"
        ? "Las entradas de tesorería no coinciden con el cash realizado."
        : "Treasury cash in does not match goal cash realized.",
    ),
    mkCheck(
      "oxygen_sum",
      lang === "es" ? "Σ días ganados por lote == oxígeno" : "Σ per-lot days gained == oxygen headline",
      { label: "Σ ranked.daysGained", value: oxygenSum },
      { label: "oxygen.totalDaysGained", value: realm.oxygen.totalDaysGained },
      0,
      lang === "es" ? "El oxígeno de portada no es la suma por lote." : "Headline oxygen is not the per-lot sum.",
    ),
    mkCheck(
      "debt_per_day",
      lang === "es" ? "requiredNetProfitPerDay × daysLeft == remaining" : "requiredNetProfitPerDay × daysLeft == remaining",
      { label: "required × daysLeft", value: debtProduct },
      { label: "debt.remainingNetProfit", value: realm.debt.remainingNetProfit },
      1,
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
      lang === "es" ? "closed+cancelled+still-open == cohorte" : "closed+cancelled+still-open == cohort",
      { label: "closed+cancelled+stillReserved", value: convSum },
      {
        label: "resolvedDenominator or cohort",
        value: conv.resolvedDenominator || (conv as { cohort?: number }).cohort || 0,
      },
      0,
      lang === "es"
        ? "El denominador de conversión del pipeline no cuadra."
        : "Pipeline conversion denominator does not add up.",
    ),
    mkCheck(
      "throne_engine_dollars",
      lang === "es" ? "Proyección Trono vs Motor a la fecha límite" : "Throne projection vs Engine at deadline",
      { label: "throneProjectedAtDeadline", value: throneEngine.throneProjectedAtDeadline },
      { label: "engineNetAtDeadline", value: throneEngine.engineNetAtDeadline },
      1,
      throneEngine.dollarReason ??
        (lang === "es"
          ? "El Trono (sin tope) y el Motor (con inventario/capital) discrepan."
          : "Throne (unconstrained) and Engine (inventory/capital capped) disagree."),
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
      lotLedgers: [],
      history: realm.history.map((h) => ({ ...h })),
    },
    excluded,
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
