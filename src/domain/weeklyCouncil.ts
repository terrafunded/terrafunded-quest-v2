import type { QualityLang } from "./quality_human";
import { recycledCapitalNext90, type Insight } from "./council";
import type { Realm } from "./realm";
import { isoWeekOf, utcToday, type IsoWeek } from "./isoWeek";
import { money, moneyExact, number, pct } from "../lib/format";
import { GOAL_NET_PROFIT, type ExitHorizon } from "../config/goal";

/**
 * Facts the weekly read is allowed to cite. Every value is pre-computed and pre-formatted.
 * The model must not invent a figure; the server rejects any number that cannot be traced here.
 */

export interface WeeklyAction {
  action: string;
  why: string;
  worth: string;
}

export interface WeeklyRead {
  week_of: string;
  headline: string;
  actions: WeeklyAction[];
  watch_out: string;
}

export interface WeeklyFarmFact {
  name: string;
  status: string;
  sold: string;
  total: string;
  outstanding: string;
}

export interface WeeklySponsorFact {
  name: string;
  terms: string;
  outstanding: string;
  deployed: string;
}

export interface WeeklyReturnFact {
  date: string;
  farm: string;
  sponsor: string;
  amount: string;
}

export interface WeeklyMonthFact {
  month: string;
  label: string;
  closings: string;
  reservations: string;
  netProfit: string;
}

export interface WeeklyFacts {
  week: string;
  week_of: string;
  horizon: ExitHorizon;
  lang: QualityLang;
  /** Compact realm summary — every field a formatted string or a list of formatted strings. */
  summary: {
    netProfitToDate: string;
    remaining: string;
    deadline: string;
    daysLeft: string;
    producingPerDay: string;
    requiredPerDay: string;
    closingsPerMonth: string;
    requiredClosingsPerMonth: string;
    reservationsPerMonth: string;
    requiredReservationsPerMonth: string;
    conversion: string;
    lotsAvailable: string;
    lotsReserved: string;
    lotsStillNeeded: string;
    stuckCount: string;
    trappedProfit: string;
    stuckAfterDays: string;
    avgNetProfitPerLot: string;
    recentAvgNetProfitPerLot: string;
    thisWeekDays: string;
  };
  farms: WeeklyFarmFact[];
  sponsors: WeeklySponsorFact[];
  recycledNext90: WeeklyReturnFact[];
  historyLast6: WeeklyMonthFact[];
  insights: Insight[];
}

export interface WeeklyCouncilRequestBody {
  facts: WeeklyFacts;
  force?: boolean;
}

/** Structural integers the model may use as ranks, action counts or "this week" without citing a ledger field. */
export const WEEKLY_STRUCTURAL_NUMBERS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

export function buildWeeklyFacts(realm: Realm, insights: Insight[], opts: { horizon: ExitHorizon; lang: QualityLang; now?: Date }): WeeklyFacts {
  const week = isoWeekOf(utcToday(opts.now));
  const g = realm.goal;
  const producing = realm.oxygen.netProfitPerDayAtPace;
  const required = realm.debt.requiredNetProfitPerDay;
  const history = realm.history.slice(-6);
  return {
    week: week.week,
    week_of: week.weekOf,
    horizon: opts.horizon,
    lang: opts.lang,
    summary: {
      netProfitToDate: money(g.netProfitToDate),
      remaining: money(g.remaining),
      deadline: g.deadline,
      daysLeft: String(g.daysToDeadline),
      producingPerDay: producing === null ? "—" : moneyExact(producing),
      requiredPerDay: required === null ? "—" : moneyExact(required),
      closingsPerMonth: number(g.closedLotsPerMonth),
      requiredClosingsPerMonth: g.requiredLotsPerMonthToHitDeadline === null ? "—" : number(g.requiredLotsPerMonthToHitDeadline),
      reservationsPerMonth: number(realm.expected.reservationsPerMonth),
      requiredReservationsPerMonth: realm.expected.requiredReservationsPerMonth === null ? "—" : number(realm.expected.requiredReservationsPerMonth),
      conversion: (() => {
        const c = realm.pipeline.conversion;
        const resolved = c.resolvedPct === null ? "—" : pct(c.resolvedPct, 0);
        const blended = c.pct === null ? "—" : pct(c.pct, 0);
        if (c.resolvedPct === null) return blended;
        return opts.lang === "es"
          ? `${resolved} — ${c.closed} de ${c.resolvedDenominator} resueltas · ${c.stillReserved} aún abiertas · ${blended} incluye sin resolver`
          : `${resolved} — ${c.closed} of ${c.resolvedDenominator} resolved · ${c.stillReserved} still open · ${blended} including unresolved`;
      })(),
      lotsAvailable: String(g.availableLots),
      lotsReserved: String(g.reservedLots),
      lotsStillNeeded: g.lotsStillNeeded === null ? "—" : String(g.lotsStillNeeded),
      stuckCount: String(realm.pipeline.stuckCount),
      trappedProfit: money(realm.pipeline.netProfitTrapped),
      stuckAfterDays: String(realm.pipeline.stuckAfterDays),
      avgNetProfitPerLot: g.avgNetProfitPerClosedLot === null ? "—" : moneyExact(g.avgNetProfitPerClosedLot),
      // The realm does not compute a recent-window average; last-6-month history is in `historyLast6`.
      recentAvgNetProfitPerLot: "—",
      thisWeekDays: "7",
    },
    farms: realm.farms.map((f) => {
      const campaign = realm.campaignByFarm.get(f.farmId);
      return {
        name: f.name,
        status: campaign?.state ?? "—",
        sold: String(f.soldLots),
        total: String(f.totalLots),
        outstanding: money(f.capitalOutstanding),
      };
    }),
    sponsors: realm.investors
      .filter((i) => i.dealType !== "own_capital" && i.capitalDeployed > 0)
      .map((i) => ({
        name: i.name,
        terms: i.dealType,
        outstanding: money(i.capitalOutstanding),
        deployed: money(i.capitalDeployed),
      })),
    recycledNext90: recycledCapitalNext90(realm).map((e) => ({
      date: e.date,
      farm: e.farm,
      sponsor: e.sponsor,
      amount: money(e.amount),
    })),
    historyLast6: history.map((h) => ({
      month: h.month,
      label: h.label,
      closings: String(h.closings),
      reservations: String(h.reservations),
      netProfit: money(h.netProfit),
    })),
    insights,
  };
}

export function isoWeekFor(now?: Date): IsoWeek {
  return isoWeekOf(utcToday(now));
}

/** Strip currency/percent/grouping so "$1,103,375.00" and "1103375" compare equal. */
export function normalizeNumberToken(raw: string): string | null {
  const t = raw.replace(/[$,%\s]/g, "").replace(/^[−–—-]/, "-");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  if (t.includes(".")) {
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return String(n);
  }
  return t.replace(/^(-?)0+(?=\d)/, "$1");
}

export function parseNumberToken(raw: string): number | null {
  const n = normalizeNumberToken(raw);
  if (n === null) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

/** Tokens the validator treats as numbers: $1,234, 12.5%, 2027-12-31's 2027/12/31, plain integers. */
export const NUMBER_TOKEN_RE = /\$\d{1,3}(?:,\d{3})+(?:\.\d+)?|\$\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+|\d+/g;

function walkStrings(value: unknown, into: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    into.push(value);
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    into.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) walkStrings(v, into);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) walkStrings(v, into);
  }
}

export function collectAllowedNumbers(facts: WeeklyFacts): { tokens: Set<string>; values: number[] } {
  const strings: string[] = [];
  walkStrings(facts, strings);
  strings.push(String(GOAL_NET_PROFIT), money(GOAL_NET_PROFIT), String(facts.horizon));
  const tokens = new Set<string>();
  const values: number[] = [];
  const add = (raw: string) => {
    const norm = normalizeNumberToken(raw);
    if (norm === null) return;
    tokens.add(norm);
    const n = Number(norm);
    if (Number.isFinite(n)) values.push(n);
  };
  for (const s of strings) {
    const matches = s.match(NUMBER_TOKEN_RE) ?? [];
    for (const m of matches) add(m);
  }
  for (const n of WEEKLY_STRUCTURAL_NUMBERS) add(String(n));
  return { tokens, values };
}

export interface NumberTrace {
  token: string;
  ok: boolean;
}

export interface WeeklyValidation {
  ok: boolean;
  read?: WeeklyRead;
  reason?: "malformed_json" | "untraceable_number" | "bad_shape";
  untraceable?: string[];
}

function isAction(v: unknown): v is WeeklyAction {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.action === "string" && typeof o.why === "string" && typeof o.worth === "string" && o.action.length > 0;
}

function parseRead(raw: unknown): WeeklyRead | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.week_of !== "string" || typeof o.headline !== "string" || typeof o.watch_out !== "string") return null;
  if (!Array.isArray(o.actions) || o.actions.length < 3 || o.actions.length > 5) return null;
  if (!o.actions.every(isAction)) return null;
  if (!o.headline.trim() || !o.watch_out.trim()) return null;
  return { week_of: o.week_of, headline: o.headline, actions: o.actions as WeeklyAction[], watch_out: o.watch_out };
}

/** Pull a JSON object out of a model reply, tolerating accidental fences the model was told not to emit. */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed.startsWith("```") ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "") : trimmed;
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function valuesMatch(tokenValue: number, allowed: number[]): boolean {
  for (const a of allowed) {
    if (tokenValue === a) return true;
    // Same dollar to the cent, or the same whole-dollar rounding the payload already printed.
    if (Math.abs(tokenValue - a) < 0.005) return true;
    if (Number.isInteger(tokenValue) && Math.abs(tokenValue - Math.round(a)) < 0.005 && Math.abs(a) >= 1) return true;
  }
  return false;
}

/**
 * Parse the model text strictly and assert every number in it is traceable to the facts.
 * A hallucinated figure is worse than no weekly read: on any failure the text is discarded.
 */
export function validateWeeklyRead(text: string, facts: WeeklyFacts): WeeklyValidation {
  const raw = extractJsonObject(text);
  if (raw === null) return { ok: false, reason: "malformed_json" };
  const read = parseRead(raw);
  if (!read) return { ok: false, reason: "bad_shape" };
  const allowed = collectAllowedNumbers(facts);
  const corpus = [read.week_of, read.headline, read.watch_out, ...read.actions.flatMap((a) => [a.action, a.why, a.worth])].join("\n");
  const tokens = corpus.match(NUMBER_TOKEN_RE) ?? [];
  const untraceable: string[] = [];
  for (const token of tokens) {
    const norm = normalizeNumberToken(token);
    const value = parseNumberToken(token);
    if (norm === null || value === null) {
      untraceable.push(token);
      continue;
    }
    if (allowed.tokens.has(norm)) continue;
    if (valuesMatch(value, allowed.values)) continue;
    untraceable.push(token);
  }
  if (untraceable.length > 0) return { ok: false, reason: "untraceable_number", untraceable };
  return { ok: true, read };
}
