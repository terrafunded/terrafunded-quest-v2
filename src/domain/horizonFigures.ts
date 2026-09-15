/**
 * Horizon figure catalog — every number the app surfaces, captured from a built realm
 * (and the Engine / Council / Oracle derived from it), not inferred from source.
 *
 * Classification (exactly one per figure):
 * - historical: must be byte-identical across 2027 / 2028 / 2029
 * - horizon_dependent: must move in `direction` as the exit year lengthens
 * - deliberately_independent: may stay flat by design; must carry an on-screen note
 *   (`labeled: true`) or it is a bug — an unlabeled flat figure next to moving ones
 *   is indistinguishable from a broken one.
 */
import type { Realm } from "./realm";
import { engineDefaultsFromRealm, runEngine, type EngineResult } from "./engine";
import { computeCouncil, type Insight } from "./council";
import { pulseRatioPct } from "./pulse";
import { round2 } from "./math";
import type { ExitHorizon } from "../config/goal";

export type FigureClass = "historical" | "horizon_dependent" | "deliberately_independent";

/**
 * How a horizon-dependent figure must move as the exit year lengthens.
 * `non_increase` / `non_decrease` allow a plateau (e.g. shortfall already at $0)
 * but still require a strict change somewhere across the three horizons.
 */
export type FigureDirection =
  | "increase" // 2029 > 2028 > 2027
  | "decrease" // 2029 < 2028 < 2027
  | "non_increase" // 2027 ≥ 2028 ≥ 2029 with at least one strict drop
  | "non_decrease" // 2027 ≤ 2028 ≤ 2029 with at least one strict rise
  | "later_iso" // ISO dates: 2029 > 2028 > 2027 lexicographically for YYYY-MM-DD
  | "change"; // all three pairwise-distinct (no monotonic claim)

export interface HorizonFigure {
  id: string;
  page: string;
  label: string;
  /** Canonical comparable value (number, ISO date, or stable string). */
  value: string | number | null;
  classification: FigureClass;
  direction?: FigureDirection;
  /**
   * For deliberately_independent: true when the UI states the figure does not
   * track the horizon (closings-to-deadline, producing pace, etc.).
   */
  labeled: boolean;
}

export interface HorizonFigureSet {
  horizon: ExitHorizon;
  deadline: string;
  figures: HorizonFigure[];
}

const SEVERITY_RANK: Record<string, number> = { critical: 3, warning: 2, ok: 1 };

function n(v: number | null | undefined): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  return typeof v === "number" ? round2(v) : v;
}

function fig(
  page: string,
  id: string,
  label: string,
  value: string | number | null | undefined,
  classification: FigureClass,
  opts: { direction?: FigureDirection; labeled?: boolean } = {},
): HorizonFigure {
  return {
    id: `${page}.${id}`,
    page,
    label,
    value: value === undefined ? null : typeof value === "number" ? n(value) : value,
    classification,
    direction: opts.direction,
    labeled: opts.labeled ?? classification !== "deliberately_independent",
  };
}

/**
 * Shared farms-to-buy figure — Throne, Engine, Council and War Plan all read
 * `realm.pathToGoal.farmsToBuy` (War Plan required rotation schedule).
 */
export function sharedFarmsStillNeeded(realm: Realm): number | null {
  return realm.pathToGoal.farmsToBuy;
}

function throneFigures(realm: Realm): HorizonFigure[] {
  const g = realm.goal;
  const x = realm.expected;
  const d = realm.debt;
  const o = realm.oxygen;
  const producing = o.netProfitPerDayAtPace;
  const needed = d.requiredNetProfitPerDay;
  const ratio = pulseRatioPct(producing, needed);
  return [
    fig("/", "netProfitToDate", "Net profit at closing", g.netProfitToDate, "historical"),
    fig("/", "noteLiquidityCost", "Note liquidity cost", realm.profitLayers.liquidityCostTotal, "historical"),
    fig("/", "noteLiquidityCostRealized", "Note liquidity cost realized", realm.profitLayers.liquidityCostRealized, "historical"),
    fig("/", "noteLiquidityCostUnrealized", "Note liquidity cost unrealized", realm.profitLayers.liquidityCostUnrealized, "historical"),
    fig("/", "notesHeldFace", "Notes held at face value", realm.profitLayers.notesHeldFace, "historical"),
    fig("/", "notesHeldAtRatio", "Notes held at measured sale ratio", realm.profitLayers.notesHeldAtRatio, "historical"),
    fig("/", "cashRealized", "Cash realized", g.cashRealized, "historical"),
    fig("/", "capitalOutstanding", "Capital outstanding", g.capitalOutstanding, "historical"),
    fig("/", "closedLots", "Closings to date", g.closedLots, "historical"),
    fig("/", "availableLots", "Lots available", g.availableLots, "historical"),
    fig("/", "reservedLots", "Lots reserved", g.reservedLots, "historical"),
    fig("/", "liveReservations", "Live reservations", x.liveReservations, "historical"),
    fig("/", "committedNetProfit", "Committed net profit", x.committedNetProfit, "historical"),
    fig("/", "producingPerDay", "PRODUCING $/day", producing, "historical"),
    fig("/", "interestPerDay", "Interest per day", d.interestPerDay, "historical"),
    fig("/", "capitalOwed", "Capital owed today", d.capitalOwed, "historical"),

    fig("/", "daysToDeadline", "Days to deadline", g.daysToDeadline, "horizon_dependent", { direction: "increase" }),
    fig("/", "deadline", "Deadline", g.deadline, "horizon_dependent", { direction: "later_iso" }),
    fig("/", "requiredLotsPerMonth", "Required lots/month", g.requiredLotsPerMonthToHitDeadline, "horizon_dependent", {
      direction: "decrease",
    }),
    fig("/", "requiredReservationsPerMonth", "Required reservations/month", x.requiredReservationsPerMonth, "horizon_dependent", {
      direction: "decrease",
    }),
    fig("/", "neededPerDay", "NEEDED $/day", needed, "horizon_dependent", { direction: "decrease" }),
    fig("/", "pulseRatio", "Pace % of required", ratio, "horizon_dependent", { direction: "increase" }),
    fig("/", "farmsStillNeeded", "Farms to buy (rotation schedule)", g.farmsStillNeeded, "horizon_dependent", {
      direction: "non_increase",
    }),
    fig("/", "farmsStillNeededShared", "Farms to buy (shared pathToGoal)", sharedFarmsStillNeeded(realm), "horizon_dependent", {
      direction: "non_increase",
    }),
    fig("/", "capitalToRaise", "Capital to raise (rotation peak)", realm.pathToGoal.capitalToRaise, "horizon_dependent", {
      direction: "non_increase",
    }),
    fig("/", "inventoryRunwayMonths", "Inventory runway months", realm.pathToGoal.inventoryRunwayMonths, "historical", {
      labeled: true,
    }),
    fig("/", "nextFarmFundByDate", "Next farm fund-by date", realm.pathToGoal.nextFarmFundByDate, "historical", {
      labeled: true,
    }),
    fig("/", "interestToDeadline", "Interest accrued by deadline", n((d.interestPerDay ?? 0) * (d.daysLeft ?? 0)), "horizon_dependent", {
      direction: "increase",
    }),

    fig("/", "lotsStillNeeded", "Closings still needed to the deadline", g.lotsStillNeeded, "deliberately_independent", {
      labeled: true,
    }),
    fig("/", "projectedDate", "Projected goal date at current pace", g.projectedDate, "deliberately_independent", {
      labeled: true,
    }),
  ];
}

function engineFigures(realm: Realm, engine: EngineResult): HorizonFigure[] {
  const f = engine.figures;
  const shared = sharedFarmsStillNeeded(realm);
  return [
    fig("/engine", "inventoryLots", "Inventory lots", f.inventoryLots, "historical"),
    fig("/engine", "availableLots", "Available lots", f.availableLots, "historical"),
    fig("/engine", "reservedLots", "Reserved lots", f.reservedLots, "historical"),
    fig("/engine", "inventoryNetProfit", "Inventory net profit", f.inventoryNetProfit, "historical"),

    fig("/engine", "netProfitAtDeadline", "Net profit at deadline", f.netProfitAtDeadline, "horizon_dependent", {
      direction: "increase",
    }),
    fig("/engine", "netProfitNoFresh", "Net profit without fresh capital", f.netProfitNoFresh, "horizon_dependent", {
      direction: "increase",
    }),
    fig("/engine", "shortfallDollars", "Shortfall $", f.shortfallDollars, "horizon_dependent", {
      direction: "non_increase",
    }),
    fig("/engine", "turns", "Capital turns", f.turns, "horizon_dependent", { direction: "increase" }),
    fig("/engine", "farmsBought", "Farms bought in schedule", f.farmsBought, "horizon_dependent", {
      direction: "increase",
    }),
    fig("/engine", "totalInterest", "Total interest to deadline", f.totalInterest, "horizon_dependent", {
      direction: "increase",
    }),
    fig("/engine", "deadline", "Capital projection deadline", engine.deadline, "horizon_dependent", { direction: "later_iso" }),
    fig("/engine", "farmsStillNeededShared", "Farms to buy (shared pathToGoal)", shared, "horizon_dependent", {
      direction: "non_increase",
    }),
    fig("/engine", "capitalToRaiseShared", "Capital to raise (shared pathToGoal)", realm.pathToGoal.capitalToRaise, "horizon_dependent", {
      direction: "non_increase",
    }),
    fig("/engine", "farmsNeeded", "Farms needing fresh capital", f.farmsNeeded, "deliberately_independent", {
      labeled: true,
    }),
    fig("/engine", "peakOutstanding", "Peak outstanding", f.peakOutstanding, "deliberately_independent", {
      labeled: true,
    }),
  ];
}

function warPlanFigures(realm: Realm): HorizonFigure[] {
  const w = realm.warPlan;
  return [
    fig("/warplan", "requiredClosingsPerMonth", "Plan required closings/month", w.required.closingsPerMonth, "horizon_dependent", {
      direction: "decrease",
    }),
    fig("/warplan", "lastPurchaseDate", "Plan last purchase date", w.required.lastPurchaseDate, "horizon_dependent", {
      direction: "later_iso",
    }),
    fig("/warplan", "rotationFarms", "Plan rotation farms", w.rotation.farms, "horizon_dependent", {
      direction: "non_increase",
    }),
    fig("/warplan", "rotationPeak", "Plan peak outstanding", w.rotation.peakOutstanding, "horizon_dependent", {
      direction: "decrease",
    }),
    fig("/warplan", "deadlineRow", "Plan final row date", w.required.rows.at(-1)?.date ?? null, "horizon_dependent", {
      direction: "later_iso",
    }),
  ];
}

/** Council severities that read today's books and do not consult the exit horizon. */
const HISTORICAL_COUNCIL_SEVERITY = new Set([
  "stuck",
  "stage_bottleneck",
  "inventory",
  "concentration",
  "losing_ground",
  "recycle",
  "quality",
]);

/** Council figure keys that move with the exit horizon. */
const HORIZON_COUNCIL_KEYS: Record<string, Set<string>> = {
  pace: new Set(["requiredClosingsPerMonth", "requiredPerDay", "daysLeft", "deadline"]),
  conversion: new Set(["requiredReservationsPerMonth", "requiredClosingsPerMonth"]),
};

function councilFigures(insights: Insight[]): HorizonFigure[] {
  const out: HorizonFigure[] = [];
  for (const insight of insights) {
    if (HISTORICAL_COUNCIL_SEVERITY.has(insight.id)) {
      out.push(fig("/council", `${insight.id}.severity`, `Recommendations · ${insight.title}`, insight.severity, "historical"));
    } else if (insight.id === "pace" || insight.id === "conversion") {
      const rank = SEVERITY_RANK[insight.severity] ?? 0;
      out.push(
        fig("/council", `${insight.id}.severity`, `Recommendations · ${insight.title}`, rank, "horizon_dependent", {
          direction: "non_increase",
        }),
      );
    } else {
      out.push(
        fig("/council", `${insight.id}.severity`, `Recommendations · ${insight.title}`, insight.severity, "horizon_dependent", {
          direction: "change",
        }),
      );
    }

    for (const [k, v] of Object.entries(insight.figures)) {
      const id = `${insight.id}.${k}`;
      if (
        insight.id === "inventory" &&
        (k === "lotsToSell" ||
          k === "farmsToBuy" ||
          k === "runwayMonths" ||
          k === "inventoryZeroDate" ||
          k === "nextFarmFundByDate" ||
          k === "farmToFirstCloseLagMonths")
      ) {
        out.push(
          fig("/council", id, `Recommendations inventory · ${k}`, v, "deliberately_independent", {
            labeled: true,
          }),
        );
      } else if (insight.id === "inventory" && (k === "available" || k === "reserved")) {
        out.push(fig("/council", id, `Recommendations inventory · ${k}`, v, "historical"));
      } else if (HORIZON_COUNCIL_KEYS[insight.id]?.has(k)) {
        const dir: FigureDirection =
          k === "deadline" ? "later_iso" : k === "daysLeft" ? "increase" : "decrease";
        // Numeric council figures are pre-formatted strings — compare numerically when possible.
        const numeric = Number(String(v).replace(/[^0-9.-]/g, ""));
        const value = k === "deadline" || !Number.isFinite(numeric) ? v : numeric;
        out.push(fig("/council", id, `Recommendations ${insight.id} · ${k}`, value, "horizon_dependent", { direction: dir }));
      } else {
        out.push(fig("/council", id, `Recommendations · ${insight.id} · ${k}`, v, "historical"));
      }
    }
  }
  return out;
}

function pipelineFigures(realm: Realm): HorizonFigure[] {
  const p = realm.pipeline;
  return [
    fig("/pipeline", "netProfitTrapped", "Pipeline profit trapped", p.netProfitTrapped, "historical"),
    fig("/pipeline", "stuckCount", "Stuck reservations", p.stuckCount, "historical"),
    fig("/pipeline", "reserved", "Pipeline reserved count", p.reserved, "historical"),
  ];
}

function sponsorsFigures(realm: Realm): HorizonFigure[] {
  return [
    fig("/sponsors", "investorCount", "Sponsors with capital", realm.investors.filter((i) => i.capitalDeployed > 0).length, "historical"),
    fig(
      "/sponsors",
      "interestAccruedSum",
      "Interest accrued to date (all sponsors)",
      round2(realm.investors.reduce((s, i) => s + i.interestAccrued, 0)),
      "historical",
    ),
  ];
}

function treasuryFigures(realm: Realm): HorizonFigure[] {
  const t = realm.treasury;
  return [
    fig("/treasury", "totalCashIn", "Cash flow in", t.totalCashIn, "historical"),
    fig("/treasury", "totalCashOut", "Cash flow out", t.totalCashOut, "historical"),
  ];
}

function trophiesFigures(realm: Realm): HorizonFigure[] {
  const paceKeeper = realm.trophies.find((t) => t.id === "pace_keeper");
  const historicalEarned = realm.trophies.filter((t) => t.earned && t.id !== "pace_keeper").length;
  return [
    fig("/trophies", "historicalEarned", "Milestones earned (ex Pace on track)", historicalEarned, "historical"),
    fig("/trophies", "total", "Milestones defined", realm.trophies.length, "historical"),
    fig("/trophies", "paceKeeperEarned", "Pace Keeper earned", paceKeeper?.earned ? 1 : 0, "horizon_dependent", {
      direction: "non_decrease",
    }),
  ];
}

function chronicleFigures(realm: Realm): HorizonFigure[] {
  const nonMilestone = realm.events.filter((e) => e.kind !== "milestone");
  return [
    fig("/chronicle", "eventCount", "Activity events (ex-milestones)", nonMilestone.length, "historical"),
    fig("/chronicle", "eventIds", "Activity event ids", nonMilestone.map((e) => e.id).join("|"), "historical"),
  ];
}

function qualityFigures(realm: Realm): HorizonFigure[] {
  return [fig("/quality", "issueCount", "Quality issues", realm.quality.length, "historical")];
}

function questsFigures(realm: Realm): HorizonFigure[] {
  const byStage = (stage: string) => realm.lots.filter((l) => l.stage === stage).length;
  return [
    fig("/quests", "available", "Lots · available", byStage("available"), "historical"),
    fig("/quests", "reserved", "Lots · reserved", byStage("reserved"), "historical"),
    fig("/quests", "closed", "Lots · closed", byStage("closed"), "historical"),
    fig("/quests", "noteSold", "Lots · note sold", byStage("note_sold"), "historical"),
  ];
}

function realmMapFigures(realm: Realm): HorizonFigure[] {
  return [
    fig("/realm", "farmCount", "Farms and lots · farms", realm.farms.length, "historical"),
    fig("/realm", "lotCount", "Farms and lots · lots", realm.lots.length, "historical"),
  ];
}

function oracleFigures(realm: Realm): HorizonFigure[] {
  const current = realm.futures.current;
  return [
    fig("/oracle", "currentExitDate", "Simulator current-pace exit date", current.exitDate, "deliberately_independent", {
      labeled: true,
    }),
    fig("/oracle", "hitsDeadline", "Simulator current pace hits deadline", current.hitsDeadline ? 1 : 0, "horizon_dependent", {
      direction: "non_decrease",
    }),
    fig("/oracle", "deadline", "Simulator deadline", realm.goal.deadline, "horizon_dependent", { direction: "later_iso" }),
  ];
}

function exodusFigures(realm: Realm): HorizonFigure[] {
  return [
    fig("/exodus", "deadline", "Exodus deadline", realm.goal.deadline, "horizon_dependent", { direction: "later_iso" }),
    fig("/exodus", "daysToDeadline", "Exodus days to deadline", realm.goal.daysToDeadline, "horizon_dependent", {
      direction: "increase",
    }),
    fig("/exodus", "monthsToDeadline", "Exodus months to deadline", realm.goal.monthsToDeadline, "horizon_dependent", {
      direction: "increase",
    }),
  ];
}

function topbarFigures(horizon: ExitHorizon, deadline: string): HorizonFigure[] {
  return [
    fig("topbar", "horizonYear", "Exit horizon year", horizon, "horizon_dependent", { direction: "increase" }),
    fig("topbar", "deadline", "Exit deadline", deadline, "horizon_dependent", { direction: "later_iso" }),
    fig("drawer", "horizonYear", "Drawer exit horizon year", horizon, "horizon_dependent", { direction: "increase" }),
  ];
}

/**
 * Capture every figure the app shows for one realm + horizon.
 * Derived pages (Engine, Council) are computed here the same way the pages do.
 */
export function captureHorizonFigures(realm: Realm, horizon: ExitHorizon): HorizonFigureSet {
  const farm = realm.rotation.benchmark?.farmName ?? null;
  const defaults = engineDefaultsFromRealm(realm, farm);
  const engine = runEngine(defaults.inputs, { ...realm, referencePace: defaults.referencePace });
  const council = computeCouncil(realm, "en");

  const figures: HorizonFigure[] = [
    ...topbarFigures(horizon, realm.goal.deadline),
    ...throneFigures(realm),
    ...engineFigures(realm, engine),
    ...warPlanFigures(realm),
    ...councilFigures(council),
    ...pipelineFigures(realm),
    ...sponsorsFigures(realm),
    ...treasuryFigures(realm),
    ...trophiesFigures(realm),
    ...chronicleFigures(realm),
    ...qualityFigures(realm),
    ...questsFigures(realm),
    ...realmMapFigures(realm),
    ...oracleFigures(realm),
    ...exodusFigures(realm),
  ];

  return { horizon, deadline: realm.goal.deadline, figures };
}

export interface FigureViolation {
  id: string;
  page: string;
  label: string;
  classification: FigureClass;
  reason: string;
  values: { 2027: string | number | null; 2028: string | number | null; 2029: string | number | null };
}

function asNumber(v: string | number | null): number | null {
  if (v === null) return null;
  if (typeof v === "number") return v;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : null;
}

function ordered(a: string | number | null, b: string | number | null, dir: FigureDirection): boolean {
  if (a === null || b === null) return false;
  if (dir === "change") return a !== b;
  if (dir === "later_iso") return String(a) < String(b);
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na === null || nb === null) return String(a) !== String(b);
  if (dir === "increase") return na < nb;
  if (dir === "decrease") return na > nb;
  if (dir === "non_increase") return na >= nb;
  if (dir === "non_decrease") return na <= nb;
  return a !== b;
}

function movesAcrossThree(
  a: string | number | null,
  b: string | number | null,
  c: string | number | null,
  dir: FigureDirection,
): boolean {
  if (dir === "change") return a !== b && b !== c && a !== c;
  if (dir === "non_increase" || dir === "non_decrease") {
    return ordered(a, b, dir) && ordered(b, c, dir) && (a !== b || b !== c);
  }
  return ordered(a, b, dir) && ordered(b, c, dir);
}

/** Compare three horizon captures and list every invariant breach. */
export function findHorizonViolations(
  a: HorizonFigureSet,
  b: HorizonFigureSet,
  c: HorizonFigureSet,
): FigureViolation[] {
  const byId = (set: HorizonFigureSet) => new Map(set.figures.map((f) => [f.id, f]));
  const A = byId(a);
  const B = byId(b);
  const C = byId(c);
  const ids = new Set([...A.keys(), ...B.keys(), ...C.keys()]);
  const violations: FigureViolation[] = [];

  for (const id of ids) {
    const fa = A.get(id);
    const fb = B.get(id);
    const fc = C.get(id);
    if (!fa || !fb || !fc) {
      violations.push({
        id,
        page: fa?.page ?? fb?.page ?? fc?.page ?? "?",
        label: fa?.label ?? fb?.label ?? fc?.label ?? id,
        classification: fa?.classification ?? "historical",
        reason: "Figure missing at one or more horizons",
        values: { 2027: fa?.value ?? null, 2028: fb?.value ?? null, 2029: fc?.value ?? null },
      });
      continue;
    }
    const values = { 2027: fa.value, 2028: fb.value, 2029: fc.value };
    if (fa.classification === "historical") {
      if (fa.value !== fb.value || fb.value !== fc.value) {
        violations.push({
          id,
          page: fa.page,
          label: fa.label,
          classification: fa.classification,
          reason: "HISTORICAL FACT changed across horizons",
          values,
        });
      }
    } else if (fa.classification === "horizon_dependent") {
      const dir = fa.direction ?? "change";
      if (!movesAcrossThree(fa.value, fb.value, fc.value, dir)) {
        violations.push({
          id,
          page: fa.page,
          label: fa.label,
          classification: fa.classification,
          reason: `HORIZON-DEPENDENT did not move (${dir}) across 2027 → 2028 → 2029`,
          values,
        });
      }
    } else if (fa.classification === "deliberately_independent") {
      if (!fa.labeled) {
        violations.push({
          id,
          page: fa.page,
          label: fa.label,
          classification: fa.classification,
          reason: "DELIBERATELY INDEPENDENT figure has no on-screen note that it ignores the horizon",
          values,
        });
      }
    }
  }
  return violations;
}

/** Markdown table of every figure at the three horizons. */
export function formatHorizonTable(a: HorizonFigureSet, b: HorizonFigureSet, c: HorizonFigureSet): string {
  const byId = (set: HorizonFigureSet) => new Map(set.figures.map((f) => [f.id, f]));
  const A = byId(a);
  const B = byId(b);
  const C = byId(c);
  const rows = [...A.keys()].sort().map((id) => {
    const fa = A.get(id)!;
    const fb = B.get(id)!;
    const fc = C.get(id)!;
    const cls =
      fa.classification === "historical"
        ? "HISTORICAL"
        : fa.classification === "horizon_dependent"
          ? "HORIZON-DEPENDENT"
          : "DELIBERATELY INDEPENDENT";
    const note =
      fa.classification === "deliberately_independent" ? (fa.labeled ? "labeled" : "UNLABELED") : fa.direction ?? "";
    return `| \`${id}\` | ${fa.page} | ${fa.label.replace(/\|/g, "/")} | ${fmt(fa.value)} | ${fmt(fb.value)} | ${fmt(fc.value)} | ${cls} | ${note} |`;
  });
  return [
    "| id | page | label | 2027 | 2028 | 2029 | class | note |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

function fmt(v: string | number | null): string {
  if (v === null) return "—";
  const s = String(v);
  return s.length > 48 ? `${s.slice(0, 45)}…` : s;
}
