import type { QualityLang } from "./quality_human";
import type { Realm } from "./realm";
import { addDays, parseDate, toIsoDate } from "./dates";
import { round2, sum } from "./math";
import { money, moneyExact, number, pct } from "../lib/format";
import { computeStageBottleneck } from "./pipeline";

/**
 * Above this share of total deployed capital for one outside sponsor, the concentration rule
 * flags. Same third as the Sponsors page's named constant (one sponsor past this removes more
 * than a third of the funding base). Declared here because the Council is the reader.
 */
import { SPONSOR_CONCENTRATION_WARN_PCT } from "./sponsorCapital";
export { SPONSOR_CONCENTRATION_WARN_PCT };

/**
 * THE COUNCIL (point 13) — a deterministic rule engine.
 *
 * Every insight is a reading of figures `buildRealm` already computed. Nothing here invents a
 * rate, a threshold or a conversion; the only arithmetic is a comparison (`>`, `===`) and the
 * formatting of a number that already exists. The weekly LLM read (point 14) receives this
 * `Insight[]` as facts and is not allowed to compute anything of its own.
 */

export type InsightSeverity = "critical" | "warning" | "ok";

export interface InsightImpact {
  /** Pre-formatted dollars this insight is worth, taken from an existing field (never recomputed). */
  dollars: string | null;
  /** Pre-formatted days this insight is worth, taken from an existing field (never recomputed). */
  days: string | null;
}

export interface Insight {
  id: string;
  /** Stable rule name the weekly payload cites. */
  rule:
    | "pace"
    | "stuck"
    | "stage_bottleneck"
    | "inventory"
    | "concentration"
    | "losing_ground"
    | "conversion"
    | "recycle"
    | "quality";
  severity: InsightSeverity;
  title: string;
  body: string;
  /** Named pre-formatted figures this insight rests on. The weekly validator treats these as allowed numbers. */
  figures: Record<string, string>;
  impact: InsightImpact;
  href: string | null;
}

export const COUNCIL_RULES: readonly Insight["rule"][] = [
  "pace",
  "stuck",
  "stage_bottleneck",
  "inventory",
  "concentration",
  "losing_ground",
  "conversion",
  "recycle",
  "quality",
];

function impact(dollars: string | null = null, days: string | null = null): InsightImpact {
  return { dollars, days };
}

function daysWord(n: number, lang: QualityLang): string {
  if (lang === "es") return n === 1 ? "1 día" : `${n} días`;
  return n === 1 ? "1 day" : `${n} days`;
}

function lotsWord(n: number, lang: QualityLang): string {
  if (lang === "es") return n === 1 ? "1 lote" : `${n} lotes`;
  return n === 1 ? "1 lot" : `${n} lots`;
}

/** Capital the required plan returns to sponsors in the next 90 days, dated from the plan's own month grid. */
export function recycledCapitalNext90(realm: Realm): { date: string; farm: string; amount: number; sponsor: string }[] {
  const asOf = realm.goal.asOf;
  const start = parseDate(asOf);
  if (!start) return [];
  const until = toIsoDate(addDays(start, 90));
  const rows = realm.warPlan.required.rows;
  const dateFor = (month: number): string | null => rows.find((r) => r.monthIndex === month)?.date ?? null;
  const out: { date: string; farm: string; amount: number; sponsor: string }[] = [];
  for (const farm of realm.warPlan.required.schedule) {
    if (farm.turnCompletesMonth === null) continue;
    const date = dateFor(farm.turnCompletesMonth);
    if (!date || date < asOf || date > until) continue;
    for (const slice of farm.funding) {
      if (slice.amount <= 0) continue;
      out.push({ date, farm: `Farm ${farm.index}`, amount: slice.amount, sponsor: slice.name });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.sponsor.localeCompare(b.sponsor));
}

function paceInsight(realm: Realm, lang: QualityLang): Insight {
  const g = realm.goal;
  const producing = realm.oxygen.netProfitPerDayAtPace;
  const required = realm.debt.requiredNetProfitPerDay;
  const behind = producing !== null && required !== null && producing < required;
  const ahead = producing !== null && required !== null && producing > required;
  const figures = {
    netProfitToDate: money(g.netProfitToDate),
    remaining: money(g.remaining),
    producingPerDay: producing === null ? "—" : moneyExact(producing),
    requiredPerDay: required === null ? "—" : moneyExact(required),
    closingsPerMonth: number(g.closedLotsPerMonth),
    requiredClosingsPerMonth: g.requiredLotsPerMonthToHitDeadline === null ? "—" : number(g.requiredLotsPerMonthToHitDeadline),
    daysLeft: String(g.daysToDeadline),
    deadline: g.deadline,
  };
  const worth = impact(money(g.remaining), daysWord(g.daysToDeadline, lang));
  if (behind) {
    return {
      id: "pace",
      rule: "pace",
      severity: "critical",
      title: lang === "es" ? "El ritmo va por debajo de lo que pide el horizonte" : "The pace is below what the horizon asks",
      body:
        lang === "es"
          ? `Se producen ${figures.producingPerDay} de utilidad neta al día; para ${figures.deadline} hacen falta ${figures.requiredPerDay}. Quedan ${figures.remaining} y ${daysWord(g.daysToDeadline, lang)}.`
          : `Producing ${figures.producingPerDay} of net profit a day; the ${figures.deadline} horizon needs ${figures.requiredPerDay}. ${figures.remaining} remains and ${daysWord(g.daysToDeadline, lang)} are left.`,
      figures,
      impact: worth,
      href: "/",
    };
  }
  if (ahead) {
    return {
      id: "pace",
      rule: "pace",
      severity: "ok",
      title: lang === "es" ? "El ritmo cubre el horizonte" : "The pace covers the horizon",
      body:
        lang === "es"
          ? `Se producen ${figures.producingPerDay} al día contra ${figures.requiredPerDay} pedidos. Quedan ${figures.remaining} y ${daysWord(g.daysToDeadline, lang)}.`
          : `Producing ${figures.producingPerDay} a day against ${figures.requiredPerDay} required. ${figures.remaining} remains and ${daysWord(g.daysToDeadline, lang)} are left.`,
      figures,
      impact: worth,
      href: "/",
    };
  }
  return {
    id: "pace",
    rule: "pace",
    severity: "ok",
    title: lang === "es" ? "El ritmo cae justo en el horizonte" : "The pace lands on the horizon",
    body:
      lang === "es"
        ? `Se producen ${figures.producingPerDay} al día; el horizonte pide ${figures.requiredPerDay}.`
        : `Producing ${figures.producingPerDay} a day; the horizon asks ${figures.requiredPerDay}.`,
    figures,
    impact: worth,
    href: "/",
  };
}

function stuckInsight(realm: Realm, lang: QualityLang): Insight {
  const p = realm.pipeline;
  const figures = {
    stuck: String(p.stuckCount),
    trapped: money(p.netProfitTrapped),
    afterDays: String(p.stuckAfterDays),
  };
  const severity: InsightSeverity = p.stuckCount === 0 ? "ok" : p.stuckCount >= 3 ? "critical" : "warning";
  return {
    id: "stuck",
    rule: "stuck",
    severity,
    title:
      lang === "es"
        ? p.stuckCount === 0
          ? "Ninguna reserva llevaba más de 60 días"
          : `${p.stuckCount} reservas atascadas`
        : p.stuckCount === 0
          ? "No reservation has been waiting 60 days"
          : `${p.stuckCount} stuck reservations`,
    body:
      lang === "es"
        ? p.stuckCount === 0
          ? `Ningún lote reservado lleva más de ${p.stuckAfterDays} días sin cerrar.`
          : `${p.stuckCount} reservas llevan más de ${p.stuckAfterDays} días; ${money(p.netProfitTrapped)} de utilidad está atrapada hasta que cierren.`
        : p.stuckCount === 0
          ? `No reserved lot has been waiting more than ${p.stuckAfterDays} days.`
          : `${p.stuckCount} reservations have waited more than ${p.stuckAfterDays} days; ${money(p.netProfitTrapped)} of profit is trapped until they close.`,
    figures,
    impact: impact(p.stuckCount === 0 ? null : money(p.netProfitTrapped), null),
    href: "/pipeline",
  };
}

function stageBottleneckInsight(realm: Realm, lang: QualityLang): Insight {
  const asOf = parseDate(realm.goal.asOf) ?? new Date(`${realm.goal.asOf}T00:00:00Z`);
  const stages = computeStageBottleneck(realm.lots, asOf);
  const top = stages[0];
  const figures = {
    stageName: top?.stageName || "—",
    count: top ? String(top.count) : "0",
    salePrice: top ? money(top.salePrice) : money(0),
    medianDays: top?.medianDaysWaiting === null || top?.medianDaysWaiting === undefined ? "—" : String(top.medianDaysWaiting),
    stages: String(stages.length),
  };
  if (!top || top.count === 0) {
    return {
      id: "stage_bottleneck",
      rule: "stage_bottleneck",
      severity: "ok",
      title: lang === "es" ? "Ninguna etapa retiene reservas" : "No stage is holding reservations",
      body:
        lang === "es"
          ? "No hay reservas abiertas agrupadas por etapa de Payments."
          : "There are no open reservations to group by Payments stage.",
      figures,
      impact: impact(null, null),
      href: "/pipeline",
    };
  }
  const named = top.stageName || (lang === "es" ? "Sin etapa en Payments" : "No stage in Payments");
  return {
    id: "stage_bottleneck",
    rule: "stage_bottleneck",
    severity: top.count >= 3 ? "critical" : "warning",
    title: lang === "es" ? `Cuello de botella: ${named}` : `Stage bottleneck: ${named}`,
    body:
      lang === "es"
        ? `${top.count} reservas abiertas están en «${named}», ${money(top.salePrice)} de precio de venta, mediana ${top.medianDaysWaiting ?? "—"} días esperando. Es la etapa que más valor retiene.`
        : `${top.count} open reservations sit in “${named}”, ${money(top.salePrice)} of sale price, median ${top.medianDaysWaiting ?? "—"} days waiting. That stage holds the most value.`,
    figures,
    impact: impact(money(top.salePrice), top.medianDaysWaiting === null ? null : daysWord(top.medianDaysWaiting, lang)),
    href: "/pipeline",
  };
}

function inventoryInsight(realm: Realm, lang: QualityLang): Insight {
  const g = realm.goal;
  const path = realm.pathToGoal;
  const available = path.inventoryOnHand;
  const runway = path.inventoryRunwayMonths;
  const zeroDate = path.inventoryZeroDate;
  const fundBy = path.nextFarmFundByDate;
  const lag = path.farmToFirstCloseLagMonths;
  const severity =
    path.inventorySeverity === "critical" ? "critical" : path.inventorySeverity === "warning" ? "warning" : "ok";
  const figures = {
    available: String(available),
    reserved: String(g.reservedLots),
    runwayMonths: runway === null ? "—" : String(runway),
    inventoryZeroDate: zeroDate ?? "—",
    nextFarmFundByDate: fundBy ?? "—",
    farmToFirstCloseLagMonths: String(lag),
    farmsToBuy: String(path.farmsToBuy),
    lotsToSell: path.lotsToSell === null ? "—" : String(path.lotsToSell),
  };
  const urgent = severity !== "ok";
  return {
    id: "inventory",
    rule: "inventory",
    severity,
    title:
      lang === "es"
        ? urgent
          ? "El inventario se agota — hay que fondear la próxima finca"
          : "El inventario tiene pista suficiente"
        : urgent
          ? "Inventory is running out — fund the next farm"
          : "Inventory runway is healthy",
    body:
      lang === "es"
        ? runway === null
          ? `${lotsWord(available, lang)} en mano; el ritmo de cierres es cero, así que no hay pista de inventario que medir.`
          : `${lotsWord(available, lang)} en mano duran ~${runway} meses al ritmo actual de cierres; el inventario llega a cero hacia ${zeroDate ?? "—"}. Con ${lag} meses de desfase finca→primer cierre, la próxima finca debe fondearse para ${fundBy ?? "—"} (no es un hueco contra los ${path.lotsToSell ?? "—"} cierres totales hasta la meta).`
        : runway === null
          ? `${lotsWord(available, lang)} on hand; closing pace is zero, so there is no inventory runway to measure.`
          : `${lotsWord(available, lang)} on hand last ~${runway} months at the current closing pace; inventory hits zero around ${zeroDate ?? "—"}. With a ${lag}-month farm→first-close lag, the next farm must be funded by ${fundBy ?? "—"} (not a gap against the ${path.lotsToSell ?? "—"} total closings to the goal).`,
    figures,
    impact: impact(null, null),
    href: "/warplan",
  };
}

function concentrationInsight(realm: Realm, lang: QualityLang): Insight {
  const investors = realm.investors;
  const totalDeployed = round2(sum(investors.map((i) => i.capitalDeployed)));
  const ranked = investors
    .filter((i) => i.dealType !== "own_capital" && i.capitalDeployed > 0)
    .slice()
    .sort((a, b) => b.capitalDeployed - a.capitalDeployed || a.name.localeCompare(b.name));
  const largest = ranked[0];
  const share = largest && totalDeployed > 0 ? round2((largest.capitalDeployed / totalDeployed) * 100) : null;
  const topTwo = ranked.slice(0, 2);
  const topTwoShare = totalDeployed > 0 && topTwo.length > 0 ? round2((sum(topTwo.map((i) => i.capitalDeployed)) / totalDeployed) * 100) : null;
  const flagged = share !== null && share > SPONSOR_CONCENTRATION_WARN_PCT;
  const figures = {
    threshold: pct(SPONSOR_CONCENTRATION_WARN_PCT, 0),
    largestName: largest?.name ?? "—",
    largestShare: share === null ? "—" : pct(share, 1),
    largestDollars: largest ? money(largest.capitalDeployed) : "—",
    topTwoShare: topTwoShare === null ? "—" : pct(topTwoShare, 1),
    totalDeployed: money(totalDeployed),
  };
  return {
    id: "concentration",
    rule: "concentration",
    severity: flagged ? "warning" : "ok",
    title: lang === "es" ? (flagged ? "Un sponsor concentra más de un tercio del capital" : "La concentración de sponsors está bajo el umbral") : flagged ? "One sponsor holds more than a third of deployed capital" : "Sponsor concentration is under the threshold",
    body:
      lang === "es"
        ? largest && share !== null
          ? `${largest.name} tiene el ${pct(share, 1)} del capital desplegado (${money(largest.capitalDeployed)} de ${money(totalDeployed)}). El umbral es ${pct(SPONSOR_CONCENTRATION_WARN_PCT, 0)}.`
          : "No hay capital externo desplegado."
        : largest && share !== null
          ? `${largest.name} holds ${pct(share, 1)} of deployed capital (${money(largest.capitalDeployed)} of ${money(totalDeployed)}). The threshold is ${pct(SPONSOR_CONCENTRATION_WARN_PCT, 0)}.`
          : "No outside capital is deployed.",
    figures,
    impact: impact(largest ? money(largest.capitalDeployed) : null, null),
    href: "/sponsors",
  };
}

function losingGroundInsight(realm: Realm, lang: QualityLang): Insight {
  const losing = realm.campaigns.filter((c) => c.state === "losing_ground");
  const outstanding = losing.reduce((a, c) => a + c.capitalOutstanding, 0);
  const names = losing.map((c) => c.farmName);
  const figures = {
    farms: String(losing.length),
    names: names.join(", ") || "—",
    outstanding: money(outstanding),
  };
  return {
    id: "losing_ground",
    rule: "losing_ground",
    severity: losing.length === 0 ? "ok" : "warning",
    title:
      lang === "es"
        ? losing.length === 0
          ? "Ninguna finca sin cierres recientes"
          : `${losing.length} fincas sin cierres recientes`
        : losing.length === 0
          ? "Every farm has a recent closing"
          : `${losing.length} farms with no recent closings`,
    body:
      lang === "es"
        ? losing.length === 0
          ? "Ninguna finca con interés corriendo lleva 60 días sin un cierre."
          : `${names.join(", ")}: interés corriendo sobre ${money(outstanding)} sin un cierre en 60 días.`
        : losing.length === 0
          ? "No farm with interest accruing has gone 60 days without a closing."
          : `${names.join(", ")}: interest accruing on ${money(outstanding)} with no closing in 60 days.`,
    figures,
    impact: impact(losing.length === 0 ? null : money(outstanding), null),
    href: "/realm",
  };
}

function conversionInsight(realm: Realm, lang: QualityLang): Insight {
  const c = realm.pipeline.conversion;
  const e = realm.expected;
  const resolved = c.resolvedPct === null ? "—" : pct(c.resolvedPct);
  const blended = c.pct === null ? "—" : pct(c.pct);
  const figures = {
    conversion: blended,
    resolved: resolved,
    closed: String(c.closed),
    resolvedDenominator: String(c.resolvedDenominator),
    stillOpen: String(c.stillReserved),
    cohort: String(c.cohort),
    reservationsPerMonth: number(e.reservationsPerMonth),
    requiredReservationsPerMonth: e.requiredReservationsPerMonth === null ? "—" : number(e.requiredReservationsPerMonth),
    closingsPerMonth: number(e.closingsPerMonth),
    requiredClosingsPerMonth: e.requiredClosingsPerMonth === null ? "—" : number(e.requiredClosingsPerMonth),
  };
  const short = e.requiredReservationsPerMonth !== null && e.reservationsPerMonth < e.requiredReservationsPerMonth;
  return {
    id: "conversion",
    rule: "conversion",
    severity: short ? "warning" : "ok",
    title: lang === "es" ? "Reservas contra lo que pide el horizonte" : "Reservations against what the horizon asks",
    body:
      lang === "es"
        ? `Conversión resuelta ${resolved} — ${c.closed} de ${c.resolvedDenominator} resueltas · ${c.stillReserved} aún abiertas. Mezclada (incluye sin resolver) ${blended}. Se reservan ${figures.reservationsPerMonth}/mes; el horizonte pide ${figures.requiredReservationsPerMonth}/mes para cerrar ${figures.requiredClosingsPerMonth}/mes.`
        : `Resolved conversion ${resolved} — ${c.closed} of ${c.resolvedDenominator} resolved · ${c.stillReserved} still open. Blended (includes unresolved) ${blended}. Reservations run ${figures.reservationsPerMonth}/month; the horizon asks ${figures.requiredReservationsPerMonth}/month to close ${figures.requiredClosingsPerMonth}/month.`,
    figures,
    impact: impact(null, null),
    href: "/pipeline",
  };
}

function recycleInsight(realm: Realm, lang: QualityLang): Insight {
  const events = recycledCapitalNext90(realm);
  const total = events.reduce((a, e) => a + e.amount, 0);
  const figures = {
    count: String(events.length),
    total: money(total),
    windowDays: "90",
    dates: events.map((e) => e.date).join(", ") || "—",
  };
  return {
    id: "recycle",
    rule: "recycle",
    severity: events.length === 0 ? "ok" : "ok",
    title: lang === "es" ? "Capital que vuelve en 90 días" : "Capital returning in 90 days",
    body:
      lang === "es"
        ? events.length === 0
          ? "El plan requerido no tiene ninguna devolución de capital en los próximos 90 días."
          : `${events.length} devoluciones del plan requerido suman ${money(total)} en 90 días (${events.map((e) => `${e.sponsor} ${money(e.amount)} el ${e.date}`).join("; ")}).`
        : events.length === 0
          ? "The required plan has no sponsor capital-return in the next 90 days."
          : `${events.length} required-plan returns total ${money(total)} in 90 days (${events.map((e) => `${e.sponsor} ${money(e.amount)} on ${e.date}`).join("; ")}).`,
    figures,
    impact: impact(events.length === 0 ? null : money(total), null),
    href: "/warplan",
  };
}

function qualityInsight(realm: Realm, lang: QualityLang): Insight {
  const errors = realm.quality.filter((q) => q.severity === "error").length;
  const warnings = realm.quality.filter((q) => q.severity === "warning").length;
  const figures = {
    errors: String(errors),
    warnings: String(warnings),
    total: String(realm.quality.length),
  };
  return {
    id: "quality",
    rule: "quality",
    severity: errors > 0 ? "warning" : "ok",
    title: lang === "es" ? "Desacuerdos en Payments" : "Disagreements in Payments",
    body:
      lang === "es"
        ? `${errors} errores y ${warnings} avisos en Calidad de datos. Recomendaciones no corrige ninguno.`
        : `${errors} errors and ${warnings} warnings on Data Quality. Recommendations does not correct any of them.`,
    figures,
    impact: impact(null, null),
    href: "/quality",
  };
}

/**
 * The nine rules, in a fixed order. A zero-farm realm still returns every rule (with empty
 * figures) so the weekly payload's shape never depends on which alarms fired.
 */
export function computeCouncil(realm: Realm, lang: QualityLang = "en"): Insight[] {
  return [
    paceInsight(realm, lang),
    stuckInsight(realm, lang),
    stageBottleneckInsight(realm, lang),
    inventoryInsight(realm, lang),
    concentrationInsight(realm, lang),
    losingGroundInsight(realm, lang),
    conversionInsight(realm, lang),
    recycleInsight(realm, lang),
    qualityInsight(realm, lang),
  ];
}
