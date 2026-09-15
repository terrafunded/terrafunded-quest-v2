/**
 * This week — detectors that name real records and score them in days toward the goal.
 * One source of recommendations: the nine Council rules plus the weekly-action detectors.
 * Scoring is documented in AUDIT.md §8. Pure; fixture-tested.
 */

import {
  HELD_NOTE_DISCOUNT_MIN_USD,
  WEEKLY_FUND_BY_WINDOW_DAYS,
  WEEKLY_MIN_DAYS,
  WEEKLY_URGENCY_MULTIPLIER,
  WEEKLY_URGENCY_WITHIN_DAYS,
} from "../config/weeklyActions";
import type { Insight } from "./council";
import { COUNCIL_RULES, computeCouncil, engineGoalCovered, recycledCapitalNext90 } from "./council";
import { addDays, daysBetween, parseDate, toIsoDate } from "./dates";
import { chicagoIsoWeek } from "./isoWeek";
import { money, moneyExact, number, pct } from "../lib/format";
import { round2, sum } from "./math";
import { noteIsHeld } from "./profitLayers";
import { STUCK_AFTER_DAYS } from "./pipeline";
import type { QualityLang } from "./quality_human";
import type { Realm } from "./realm";
import { runPreset, simulatorContextFromRealm, type SimulatorBottleneckKind } from "./simulator";

export type WeeklyDetectorType =
  | "stuck_reservation"
  | "farm_fully_reserved_no_closings"
  | "idle_farm"
  | "committed_unfunded_capital"
  | "next_farm_fund_by"
  | "held_note_discount"
  | "quality_blocker"
  | "pace"
  | "stage_bottleneck"
  | "inventory"
  | "concentration"
  | "losing_ground"
  | "conversion"
  | "recycle"
  | "quality";

export type WeeklyActionStatus = "pending" | "done" | "dismissed";
export type WeeklyDaysLabel = "gained" | "parked";

export interface WeeklyFormula {
  dollars: number;
  requiredNetProfitPerDay: number;
  conversionPct: number | null;
  lotCount: number | null;
  eraNetPerLot: number | null;
  days: number;
  expression: string;
}

export interface WeeklyActionRecords {
  farmIds: string[];
  farmNames: string[];
  propertyIds: string[];
  lotNames: string[];
  qualityIds: string[];
  amounts: number[];
  dates: string[];
}

export interface WeeklyActionCandidate {
  id: string;
  detector: WeeklyDetectorType;
  /** Set when this candidate is the migrated form of a Council rule. */
  councilRule: Insight["rule"] | null;
  daysTowardGoal: number;
  daysLabel: WeeklyDaysLabel;
  urgency: number;
  score: number;
  dueDate: string | null;
  href: string;
  formula: WeeklyFormula;
  records: WeeklyActionRecords;
  fingerprint: string;
  /** Spanish Score body. Never contains " - ". */
  scoreDescription: string;
  titleKey: string;
  whyKey: string;
  titleParams: Record<string, string | number>;
  whyParams: Record<string, string | number>;
}

export interface WeeklyBottleneckLever {
  kind: SimulatorBottleneckKind;
  date: string | null;
  fundByDate: string | null;
  capitalShort: number;
  href: string;
}

export interface WeeklyActionsResult {
  week: string;
  weekOf: string;
  asOf: string;
  requiredNetProfitPerDay: number;
  minDays: number;
  belowMinimum: boolean;
  lever: WeeklyBottleneckLever | null;
  candidates: WeeklyActionCandidate[];
}

export interface FrozenWeeklyAction extends WeeklyActionCandidate {
  status: WeeklyActionStatus;
  dismissReason: string | null;
}

export interface FrozenWeeklyWeek {
  week: string;
  weekOf: string;
  generatedAt: string;
  horizon: number;
  asOf: string;
  requiredNetProfitPerDay: number;
  belowMinimum: boolean;
  lever: WeeklyBottleneckLever | null;
  actions: FrozenWeeklyAction[];
}

export interface WeeklyWeekResult {
  week: string;
  weekOf: string;
  doneCount: number;
  dismissedCount: number;
  pendingCount: number;
  daysGained: number;
}

const DETECTOR_TO_COUNCIL: Partial<Record<WeeklyDetectorType, Insight["rule"]>> = {
  stuck_reservation: "stuck",
  next_farm_fund_by: "inventory",
  inventory: "inventory",
  quality_blocker: "quality",
  quality: "quality",
  pace: "pace",
  stage_bottleneck: "stage_bottleneck",
  concentration: "concentration",
  losing_ground: "losing_ground",
  conversion: "conversion",
  recycle: "recycle",
};

export function resolvedConversionRatio(realm: Realm): number {
  const pctValue = realm.pipeline.conversion.resolvedPct;
  if (pctValue === null || !Number.isFinite(pctValue)) return 1;
  return Math.max(0, Math.min(1, pctValue / 100));
}

function requiredPerDay(realm: Realm): number {
  return realm.debt.requiredNetProfitPerDay && realm.debt.requiredNetProfitPerDay > 0
    ? realm.debt.requiredNetProfitPerDay
    : 0;
}

function daysFromDollars(dollars: number, perDay: number): number {
  if (!(perDay > 0) || !Number.isFinite(dollars)) return 0;
  return round2(Math.abs(dollars) / perDay);
}

function urgencyFor(dueDate: string | null, asOf: Date): number {
  if (!dueDate) return 1;
  const due = parseDate(dueDate);
  if (!due) return 1;
  return daysBetween(asOf, due) <= WEEKLY_URGENCY_WITHIN_DAYS ? WEEKLY_URGENCY_MULTIPLIER : 1;
}

function emptyRecords(): WeeklyActionRecords {
  return { farmIds: [], farmNames: [], propertyIds: [], lotNames: [], qualityIds: [], amounts: [], dates: [] };
}

function formula(
  dollars: number,
  perDay: number,
  days: number,
  expression: string,
  extra: Partial<WeeklyFormula> = {},
): WeeklyFormula {
  return {
    dollars: round2(dollars),
    requiredNetProfitPerDay: perDay,
    conversionPct: extra.conversionPct ?? null,
    lotCount: extra.lotCount ?? null,
    eraNetPerLot: extra.eraNetPerLot ?? null,
    days,
    expression,
  };
}

function candidate(partial: Omit<WeeklyActionCandidate, "urgency" | "score" | "councilRule"> & { councilRule?: Insight["rule"] | null }, asOf: Date): WeeklyActionCandidate {
  const urgency = urgencyFor(partial.dueDate, asOf);
  const councilRule = partial.councilRule ?? DETECTOR_TO_COUNCIL[partial.detector] ?? null;
  return {
    ...partial,
    councilRule,
    urgency,
    score: round2(partial.daysTowardGoal * urgency),
  };
}

function moneyPlain(n: number): string {
  return moneyExact(n).replace(/\u00a0/g, " ");
}

function noSpacedHyphen(text: string): string {
  return text.replace(/ - /g, ", ");
}

function scoreSentences(parts: string[]): string {
  return noSpacedHyphen(parts.filter(Boolean).join(" "));
}

function encodeFarm(name: string): string {
  return encodeURIComponent(name);
}

export function daysTowardGoalFromReservations(netAtStake: number, conversion: number, perDay: number): number {
  return daysFromDollars(netAtStake * conversion, perDay);
}

export function daysParkedFromIdleLots(availableLots: number, eraNetPerLot: number, perDay: number): number {
  return daysFromDollars(availableLots * eraNetPerLot, perDay);
}

export function daysFromLiquidityCost(cost: number, perDay: number): number {
  return daysFromDollars(cost, perDay);
}

export function daysEmptyInventoryAvoided(fundBy: string, inventoryZero: string): number {
  const a = parseDate(fundBy);
  const b = parseDate(inventoryZero);
  if (!a || !b) return 0;
  return Math.max(0, daysBetween(a, b));
}

export function daysFromQualityProfit(profitAffected: number, perDay: number): number {
  return daysFromDollars(profitAffected, perDay);
}

function detectStuck(realm: Realm, perDay: number, conversion: number, asOf: Date): WeeklyActionCandidate[] {
  const stuck = realm.pipeline.stuck;
  if (stuck.length === 0) return [];
  const byFarm = new Map<string, typeof stuck>();
  for (const row of stuck) {
    const list = byFarm.get(row.farmId) ?? [];
    list.push(row);
    byFarm.set(row.farmId, list);
  }
  const out: WeeklyActionCandidate[] = [];
  for (const [farmId, rows] of byFarm) {
    const farmName = rows[0]?.farmName ?? farmId;
    const group = rows.length >= 3;
    const items = group ? [rows] : rows.map((r) => [r]);
    for (const pack of items) {
      const stake = round2(sum(pack.map((r) => r.netProfitAtStake)));
      const days = daysTowardGoalFromReservations(stake, conversion, perDay);
      const due = pack
        .map((r) => {
          const reserved = parseDate(r.reservationDate);
          return reserved ? toIsoDate(addDays(reserved, STUCK_AFTER_DAYS)) : null;
        })
        .filter((d): d is string => !!d)
        .sort()[0] ?? null;
      const ids = pack.map((r) => r.propertyId);
      const lots = pack.map((r) => r.lotName);
      const id = group ? `stuck_reservation:farm:${farmId}` : `stuck_reservation:lot:${ids[0]}`;
      out.push(
        candidate(
          {
            id,
            detector: "stuck_reservation",
            councilRule: "stuck",
            daysTowardGoal: days,
            daysLabel: "gained",
            dueDate: due,
            href: `/pipeline?farm=${encodeFarm(farmName)}`,
            formula: formula(round2(stake * conversion), perDay, days, "Σ netProfitAtStake × resolvedConversion ÷ requiredNetProfitPerDay", {
              conversionPct: round2(conversion * 100),
              lotCount: pack.length,
            }),
            records: {
              ...emptyRecords(),
              farmIds: [farmId],
              farmNames: [farmName],
              propertyIds: ids,
              lotNames: lots,
              amounts: [stake],
              dates: pack.map((r) => r.reservationDate),
            },
            fingerprint: JSON.stringify({ d: "stuck_reservation", propertyIds: ids.slice().sort() }),
            scoreDescription: scoreSentences([
              group
                ? `Necesito que desatasques las ${pack.length} reservas de ${farmName} que llevan más de ${STUCK_AFTER_DAYS} días (${lots.join(", ")}).`
                : `Necesito que desatasques la reserva de ${lots[0]} en ${farmName}, que lleva más de ${STUCK_AFTER_DAYS} días.`,
              `Cerrarlas mueve ${number(days)} días hacia la meta: ${moneyPlain(stake)} de utilidad en juego × ${pct(conversion * 100)} de conversión resuelta ÷ ${moneyPlain(perDay)} al día.`,
              "Queda hecho cuando esas reservas cierren o se cancelen en Payments.",
            ]),
            titleKey: group ? "stuckFarm" : "stuckLot",
            whyKey: "stuckWhy",
            titleParams: { farm: farmName, count: pack.length, lot: lots[0] ?? farmName },
            whyParams: { dollars: money(stake), days: number(days), conversion: pct(conversion * 100), perDay: moneyExact(perDay) },
          },
          asOf,
        ),
      );
    }
  }
  return out;
}

function detectFullyReserved(realm: Realm, perDay: number, conversion: number, asOf: Date): WeeklyActionCandidate[] {
  const out: WeeklyActionCandidate[] = [];
  for (const row of realm.farmScorecard.rows) {
    if (row.soldLots > 0 || row.reservedLots <= 0) continue;
    const fully = row.availableLots === 0 || row.reservedLots >= row.availableLots;
    if (!fully) continue;
    const lots = realm.expected.lots.filter((l) => l.farmId === row.farmId);
    const stake = round2(sum(lots.map((l) => l.netProfitAtStake)));
    const days = daysTowardGoalFromReservations(stake, conversion, perDay);
    const due = lots
      .map((l) => {
        const reserved = parseDate(l.reservationDate);
        return reserved ? toIsoDate(addDays(reserved, STUCK_AFTER_DAYS)) : null;
      })
      .filter((d): d is string => !!d)
      .sort()[0] ?? null;
    out.push(
      candidate(
        {
          id: `farm_fully_reserved_no_closings:${row.farmId}`,
          detector: "farm_fully_reserved_no_closings",
          daysTowardGoal: days,
          daysLabel: "gained",
          dueDate: due,
          href: `/pipeline?farm=${encodeFarm(row.name)}`,
          formula: formula(round2(stake * conversion), perDay, days, "Σ netProfitAtStake × resolvedConversion ÷ requiredNetProfitPerDay", {
            conversionPct: round2(conversion * 100),
            lotCount: lots.length,
          }),
          records: {
            ...emptyRecords(),
            farmIds: [row.farmId],
            farmNames: [row.name],
            propertyIds: lots.map((l) => l.propertyId),
            lotNames: lots.map((l) => l.lotName),
            amounts: [stake],
          },
          fingerprint: JSON.stringify({ d: "farm_fully_reserved_no_closings", farmId: row.farmId, reserved: row.reservedLots, sold: row.soldLots }),
          scoreDescription: scoreSentences([
            `Necesito que cierres al menos un lote de ${row.name}: ${row.reservedLots} reservas y cero cierres${row.availableLots > 0 ? `, con ${row.availableLots} lotes aún libres` : ""}.`,
            `Eso mueve ${number(days)} días hacia la meta: ${moneyPlain(stake)} de utilidad en juego × ${pct(conversion * 100)} ÷ ${moneyPlain(perDay)} al día.`,
            `Queda hecho cuando ${row.name} tenga un cierre en Payments.`,
          ]),
          titleKey: "fullyReserved",
          whyKey: "fullyReservedWhy",
          titleParams: { farm: row.name, reserved: row.reservedLots },
          whyParams: { dollars: money(stake), days: number(days), reserved: row.reservedLots, perDay: moneyExact(perDay) },
        },
        asOf,
      ),
    );
  }
  return out;
}

function detectIdleFarms(realm: Realm, perDay: number, asOf: Date): WeeklyActionCandidate[] {
  const era = realm.goal.recentAvgNetProfitPerClosedLot ?? realm.goal.avgNetProfitPerClosedLot ?? 0;
  const out: WeeklyActionCandidate[] = [];
  for (const row of realm.farmScorecard.rows) {
    if (row.availableLots <= 0 || row.reservationsInLast90 > 0) continue;
    const days = daysParkedFromIdleLots(row.availableLots, era, perDay);
    out.push(
      candidate(
        {
          id: `idle_farm:${row.farmId}`,
          detector: "idle_farm",
          daysTowardGoal: days,
          daysLabel: "parked",
          dueDate: null,
          href: `/realm?farm=${encodeFarm(row.name)}`,
          formula: formula(round2(row.availableLots * era), perDay, days, "availableLots × eraNetPerLot ÷ requiredNetProfitPerDay", {
            lotCount: row.availableLots,
            eraNetPerLot: era,
          }),
          records: {
            ...emptyRecords(),
            farmIds: [row.farmId],
            farmNames: [row.name],
            amounts: [era],
          },
          fingerprint: JSON.stringify({ d: "idle_farm", farmId: row.farmId, reservationsInLast90: row.reservationsInLast90 }),
          scoreDescription: scoreSentences([
            `Necesito que reserves lotes en ${row.name}: ${row.availableLots} disponibles y cero reservas en 90 días.`,
            `Ese inventario aparca ${number(days)} días: ${row.availableLots} lotes × ${moneyPlain(era)} de la era ÷ ${moneyPlain(perDay)} al día.`,
            `Queda hecho cuando ${row.name} tenga una reserva nueva en Payments.`,
          ]),
          titleKey: "idleFarm",
          whyKey: "idleFarmWhy",
          titleParams: { farm: row.name, lots: row.availableLots },
          whyParams: { lots: row.availableLots, era: money(era), days: number(days), perDay: moneyExact(perDay) },
        },
        asOf,
      ),
    );
  }
  return out;
}

function detectUnfunded(realm: Realm, perDay: number, asOf: Date): WeeklyActionCandidate[] {
  const unfunded = realm.debt.capitalCommittedUnfunded;
  if (!(unfunded > 0)) return [];
  const days = daysFromDollars(unfunded, perDay);
  const farms = realm.farms.filter((f) => (f.capitalCommittedUnfunded ?? 0) > 0);
  return [
    candidate(
      {
        id: "committed_unfunded_capital",
        detector: "committed_unfunded_capital",
        daysTowardGoal: days,
        daysLabel: "gained",
        dueDate: null,
        href: "/warplan",
        formula: formula(unfunded, perDay, days, "capitalCommittedUnfunded ÷ requiredNetProfitPerDay"),
        records: {
          ...emptyRecords(),
          farmIds: farms.map((f) => f.farmId),
          farmNames: farms.map((f) => f.name),
          amounts: [unfunded],
        },
        fingerprint: JSON.stringify({ d: "committed_unfunded_capital", amount: unfunded }),
        scoreDescription: scoreSentences([
          `Necesito que fondees el capital comprometido sin fondear: ${moneyPlain(unfunded)}.`,
          `Eso mueve ${number(days)} días hacia la meta: ${moneyPlain(unfunded)} ÷ ${moneyPlain(perDay)} al día.`,
          "Queda hecho cuando capitalCommittedUnfunded baje a cero en el cálculo de deuda.",
        ]),
        titleKey: "unfunded",
        whyKey: "unfundedWhy",
        titleParams: { amount: money(unfunded) },
        whyParams: { amount: money(unfunded), days: number(days), perDay: moneyExact(perDay) },
      },
      asOf,
    ),
  ];
}

function detectFundBy(realm: Realm, perDay: number, asOf: Date): WeeklyActionCandidate[] {
  const fundBy = realm.pathToGoal.nextFarmFundByDate;
  const zero = realm.pathToGoal.inventoryZeroDate;
  if (!fundBy || !zero) return [];
  const fundDate = parseDate(fundBy);
  if (!fundDate) return [];
  const until = daysBetween(asOf, fundDate);
  if (until > WEEKLY_FUND_BY_WINDOW_DAYS) return [];
  const days = daysEmptyInventoryAvoided(fundBy, zero);
  const due = fundBy;
  return [
    candidate(
      {
        id: "next_farm_fund_by",
        detector: "next_farm_fund_by",
        councilRule: "inventory",
        daysTowardGoal: days,
        daysLabel: "gained",
        dueDate: due,
        href: "/warplan",
        formula: formula(round2(days * perDay), perDay, days, "daysBetween(nextFarmFundByDate, inventoryZeroDate)", {
          lotCount: realm.pathToGoal.inventoryOnHand,
        }),
        records: {
          ...emptyRecords(),
          dates: [fundBy, zero],
          amounts: [realm.pathToGoal.farmToFirstCloseLagMonths],
        },
        fingerprint: JSON.stringify({ d: "next_farm_fund_by", fundBy, zero }),
        scoreDescription: scoreSentences([
          `Necesito que fondees la próxima finca para el ${fundBy}. El inventario llega a cero el ${zero}.`,
          `Fondear a tiempo evita ${number(days)} días de inventario vacío (desfase finca a primer cierre).`,
          "Queda hecho cuando la próxima finca esté fondeada en Payments antes de esa fecha.",
        ]),
        titleKey: "fundBy",
        whyKey: "fundByWhy",
        titleParams: { fundBy, zero },
        whyParams: { fundBy, zero, days: number(days), lag: realm.pathToGoal.farmToFirstCloseLagMonths },
      },
      asOf,
    ),
  ];
}

function detectHeldNotes(realm: Realm, perDay: number, asOf: Date): WeeklyActionCandidate[] {
  const notes = realm.noteStrategies.notes.filter((n) => n.costOfSelling > HELD_NOTE_DISCOUNT_MIN_USD);
  if (notes.length === 0) return [];
  const cost = round2(sum(notes.map((n) => n.costOfSelling)));
  const days = daysFromLiquidityCost(cost, perDay);
  return [
    candidate(
      {
        id: "held_note_discount",
        detector: "held_note_discount",
        daysTowardGoal: days,
        daysLabel: "gained",
        dueDate: null,
        href: "/treasury#notes-strategies",
        formula: formula(cost, perDay, days, "Σ costOfSelling (notes above threshold) ÷ requiredNetProfitPerDay", {
          lotCount: notes.length,
        }),
        records: {
          ...emptyRecords(),
          farmNames: [...new Set(notes.map((n) => n.farmName))],
          propertyIds: notes.map((n) => n.propertyId),
          lotNames: notes.map((n) => n.lotName),
          amounts: notes.map((n) => n.costOfSelling),
        },
        fingerprint: JSON.stringify({ d: "held_note_discount", propertyIds: notes.map((n) => n.propertyId).sort() }),
        scoreDescription: scoreSentences([
          `Necesito que no vendas estas ${notes.length} notas por debajo del umbral: el descuento medido suma ${moneyPlain(cost)} (${notes.map((n) => n.lotName).join(", ")}).`,
          `Evitar esa venta ahorra ${number(days)} días: ${moneyPlain(cost)} ÷ ${moneyPlain(perDay)} al día.`,
          "Queda hecho cuando esas notas se entreguen o se mantengan, no cuando se vendan con descuento.",
        ]),
        titleKey: "heldNotes",
        whyKey: "heldNotesWhy",
        titleParams: { count: notes.length, cost: money(cost) },
        whyParams: { cost: money(cost), days: number(days), count: notes.length, perDay: moneyExact(perDay) },
      },
      asOf,
    ),
  ];
}

export function qualityProfitAffected(realm: Realm): number {
  const mismatches = realm.quality.filter((q) => q.kind === "price_mismatch");
  return round2(
    sum(
      mismatches.map((i) => {
        const d = i.details as { fileCaseSalePrice?: number; noteOriginalAmount?: number };
        return Math.abs((d.fileCaseSalePrice ?? 0) - (d.noteOriginalAmount ?? 0));
      }),
    ),
  );
}

function detectQuality(realm: Realm, perDay: number, asOf: Date): WeeklyActionCandidate[] {
  const issues = realm.quality.filter((q) => q.kind === "price_mismatch");
  if (issues.length === 0) return [];
  const dollars = qualityProfitAffected(realm);
  const days = daysFromQualityProfit(dollars, perDay);
  const lots = issues.map((i) => i.lotName).filter((n): n is string => !!n);
  return [
    candidate(
      {
        id: "quality_blocker",
        detector: "quality_blocker",
        councilRule: "quality",
        daysTowardGoal: days,
        daysLabel: "gained",
        dueDate: issues.map((i) => i.since).filter((d): d is string => !!d).sort()[0] ?? null,
        href: "/quality",
        formula: formula(dollars, perDay, days, "Σ |fileCaseSalePrice − noteOriginalAmount| ÷ requiredNetProfitPerDay", {
          lotCount: issues.length,
        }),
        records: {
          ...emptyRecords(),
          farmNames: [...new Set(issues.map((i) => i.farmName).filter((n): n is string => !!n))],
          propertyIds: issues.map((i) => i.propertyId).filter((id): id is string => !!id),
          lotNames: lots,
          qualityIds: issues.map((i) => i.id),
          amounts: [dollars],
        },
        fingerprint: JSON.stringify({ d: "quality_blocker", qualityIds: issues.map((i) => i.id).sort() }),
        scoreDescription: scoreSentences([
          `Necesito que corrijas las diferencias de precio en ${lots.join(", ")}: ${moneyPlain(dollars)} de utilidad neta afectada.`,
          `Eso mueve ${number(days)} días: ${moneyPlain(dollars)} ÷ ${moneyPlain(perDay)} al día.`,
          "Queda hecho cuando esos desacuerdos de precio desaparezcan de Calidad de datos.",
        ]),
        titleKey: "qualityBlocker",
        whyKey: "qualityBlockerWhy",
        titleParams: { count: issues.length },
        whyParams: { dollars: money(dollars), days: number(days), count: issues.length, perDay: moneyExact(perDay) },
      },
      asOf,
    ),
  ];
}

/** Migrated Council rules that are not already a primary detector. Days are 0 so they never steal the week. */
function detectCouncilPresence(realm: Realm, asOf: Date, lang: QualityLang, already: Set<Insight["rule"]>): WeeklyActionCandidate[] {
  const insights = computeCouncil(realm, lang);
  const perDay = requiredPerDay(realm);
  const out: WeeklyActionCandidate[] = [];
  for (const insight of insights) {
    if (already.has(insight.rule)) continue;
    const href = insight.href ?? "/council";
    out.push(
      candidate(
        {
          id: `council:${insight.rule}`,
          detector: (insight.rule === "stuck" ? "stuck_reservation" : insight.rule) as WeeklyDetectorType,
          councilRule: insight.rule,
          daysTowardGoal: 0,
          daysLabel: "gained",
          dueDate: null,
          href,
          formula: formula(0, perDay, 0, "council diagnostic (no days currency)"),
          records: emptyRecords(),
          fingerprint: JSON.stringify({ d: insight.rule, severity: insight.severity }),
          scoreDescription: scoreSentences([
            `Necesito que revises esta alerta de ${insight.rule}.`,
            "Los registros ya tienen los números; hay que actuar sobre ellos esta semana.",
            "Queda hecho cuando el aviso deje de aplicar en Payments.",
          ]),
          titleKey: `council.${insight.rule}`,
          whyKey: `council.${insight.rule}.why`,
          titleParams: { title: insight.title },
          whyParams: { body: insight.body },
        },
        asOf,
      ),
    );
  }
  return out;
}

export function simulatorLever(realm: Realm): WeeklyBottleneckLever {
  const ctx = simulatorContextFromRealm(realm);
  const result = runPreset("today", ctx, true);
  const kind = result.bottleneck.kind;
  const href = kind === "demand" ? "/pipeline" : kind === "none" ? "/" : "/warplan";
  return {
    kind,
    date: result.bottleneck.date,
    fundByDate: result.bottleneck.fundByDate,
    capitalShort: result.bottleneck.capitalShort,
    href,
  };
}

function rank(a: WeeklyActionCandidate, b: WeeklyActionCandidate): number {
  return b.score - a.score || b.daysTowardGoal - a.daysTowardGoal || a.id.localeCompare(b.id);
}

/**
 * Generate this week's candidates from a built realm. Does not freeze or persist.
 * `now` selects the Chicago ISO week label only; detectors read `realm.asOf`.
 */
export function computeWeeklyActions(realm: Realm, now: Date = realm.asOf, lang: QualityLang = "en"): WeeklyActionsResult {
  const clock = chicagoIsoWeek(now);
  const asOf = realm.asOf;
  const perDay = requiredPerDay(realm);
  const conversion = resolvedConversionRatio(realm);

  const primary: WeeklyActionCandidate[] = [
    ...detectStuck(realm, perDay, conversion, asOf),
    ...detectFullyReserved(realm, perDay, conversion, asOf),
    ...detectIdleFarms(realm, perDay, asOf),
    ...detectUnfunded(realm, perDay, asOf),
    ...detectFundBy(realm, perDay, asOf),
    ...detectHeldNotes(realm, perDay, asOf),
    ...detectQuality(realm, perDay, asOf),
  ];

  const coveredRules = new Set<Insight["rule"]>();
  for (const c of primary) {
    if (c.councilRule) coveredRules.add(c.councilRule);
  }
  // inventory is covered only when next_farm_fund_by fired
  if (!primary.some((c) => c.detector === "next_farm_fund_by")) {
    coveredRules.delete("inventory");
  }
  if (!primary.some((c) => c.detector === "quality_blocker" || c.detector === "quality")) {
    coveredRules.delete("quality");
  }

  const council = detectCouncilPresence(realm, asOf, lang, coveredRules);
  const candidates = [...primary, ...council].sort(rank);

  const above = candidates.filter((c) => c.daysTowardGoal >= WEEKLY_MIN_DAYS);
  const belowMinimum = above.length === 0;
  const lever = belowMinimum ? simulatorLever(realm) : null;

  return {
    week: clock.week,
    weekOf: clock.weekOf,
    asOf: realm.goal.asOf,
    requiredNetProfitPerDay: perDay,
    minDays: WEEKLY_MIN_DAYS,
    belowMinimum,
    lever,
    candidates,
  };
}

export function freezeWeeklyActions(generated: WeeklyActionsResult, generatedAt: string, horizon: number): FrozenWeeklyWeek {
  const actions: FrozenWeeklyAction[] = generated.belowMinimum
    ? generated.candidates.slice(0, 1).map((c) => ({ ...c, status: "pending", dismissReason: null }))
    : generated.candidates.map((c) => ({ ...c, status: "pending", dismissReason: null }));
  return {
    week: generated.week,
    weekOf: generated.weekOf,
    generatedAt,
    horizon,
    asOf: generated.asOf,
    requiredNetProfitPerDay: generated.requiredNetProfitPerDay,
    belowMinimum: generated.belowMinimum,
    lever: generated.lever,
    actions,
  };
}

export function fingerprintStillHolds(action: WeeklyActionCandidate, realm: Realm): boolean {
  let parsed: { d?: string; propertyIds?: string[]; farmId?: string; qualityIds?: string[]; amount?: number; fundBy?: string } = {};
  try {
    parsed = JSON.parse(action.fingerprint) as typeof parsed;
  } catch {
    return false;
  }
  const kind = parsed.d ?? action.detector;
  if (kind === "stuck_reservation") {
    const ids = new Set(parsed.propertyIds ?? action.records.propertyIds);
    return realm.lots.some((l) => ids.has(l.propertyId) && l.stage === "reserved");
  }
  if (kind === "farm_fully_reserved_no_closings") {
    const row = realm.farmScorecard.rows.find((r) => r.farmId === (parsed.farmId ?? action.records.farmIds[0]));
    return !!row && row.soldLots === 0 && row.reservedLots > 0;
  }
  if (kind === "idle_farm") {
    const row = realm.farmScorecard.rows.find((r) => r.farmId === (parsed.farmId ?? action.records.farmIds[0]));
    return !!row && row.availableLots > 0 && row.reservationsInLast90 === 0;
  }
  if (kind === "committed_unfunded_capital") {
    return realm.debt.capitalCommittedUnfunded > 0 && realm.debt.capitalCommittedUnfunded >= (parsed.amount ?? 0) - 0.005;
  }
  if (kind === "next_farm_fund_by") {
    return realm.pathToGoal.nextFarmFundByDate === (parsed.fundBy ?? action.records.dates[0]);
  }
  if (kind === "held_note_discount") {
    const ids = new Set(parsed.propertyIds ?? action.records.propertyIds);
    return realm.lots.some((l) => ids.has(l.propertyId) && noteIsHeld(l));
  }
  if (kind === "quality_blocker") {
    const ids = new Set(parsed.qualityIds ?? action.records.qualityIds);
    return realm.quality.some((q) => ids.has(q.id));
  }
  return true;
}

export function evaluateWeekResult(week: FrozenWeeklyWeek, realm: Realm): WeeklyWeekResult {
  let daysGained = 0;
  let doneCount = 0;
  let dismissedCount = 0;
  let pendingCount = 0;
  for (const action of week.actions) {
    if (action.status === "done") doneCount += 1;
    else if (action.status === "dismissed") dismissedCount += 1;
    else pendingCount += 1;
    if (!fingerprintStillHolds(action, realm)) {
      daysGained = round2(daysGained + action.daysTowardGoal);
    }
  }
  return {
    week: week.week,
    weekOf: week.weekOf,
    doneCount,
    dismissedCount,
    pendingCount,
    daysGained,
  };
}

export function pendingTopCount(week: FrozenWeeklyWeek | null, topN = 3): { pending: number; total: number } {
  if (!week) return { pending: 0, total: 0 };
  const ranked = week.actions.filter((a) => a.status !== "dismissed").sort(rank).slice(0, topN);
  const shown = ranked.length === 0 ? week.actions.slice(0, topN) : ranked;
  const pending = shown.filter((a) => a.status === "pending").length;
  return { pending, total: shown.length };
}

export const WEEKLY_DETECTOR_TYPES: readonly WeeklyDetectorType[] = [
  "stuck_reservation",
  "farm_fully_reserved_no_closings",
  "idle_farm",
  "committed_unfunded_capital",
  "next_farm_fund_by",
  "held_note_discount",
  "quality_blocker",
  "pace",
  "stage_bottleneck",
  "inventory",
  "concentration",
  "losing_ground",
  "conversion",
  "recycle",
  "quality",
];

export { COUNCIL_RULES, WEEKLY_MIN_DAYS, engineGoalCovered, recycledCapitalNext90 };
