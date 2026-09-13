import type { GoalStatus } from "./goal";
import type { MonthlyPoint } from "./history";
import type { Expected } from "./expected";
import type { WarPlan, WarPlanRealValues } from "./warplan";
import { buildMonthGrid } from "./oracle";
import { addMonths, endOfUtcMonth, parseDate, toIsoDate } from "./dates";
import { round2 } from "./math";
import { DAYS_PER_MONTH } from "../config/goal";

/**
 * FORECAST VISUALS — the shapes the Curve, the Gauge, the Farm Calendar and the Reverse Funnel
 * draw. Nothing here forecasts: every date, pace and dollar is read off `computeGoal`, the War
 * Plan engine (`solveWarPlan`, whose farms carry the Oracle's `fundSchedule` recycling) and
 * `computeExpected`, then laid out on a time axis. Two forecasts would be two truths, so when a
 * figure is missing here it is added to the domain function that owns it, not derived again.
 */

// ---------------------------------------------------------------------------------------------
// A. THE CURVE
// ---------------------------------------------------------------------------------------------

/** A point on the required line, the actual curve or a projection; `t` is UTC ms for a numeric axis. */
export interface CurvePoint {
  t: number;
  iso: string;
  value: number;
}

/** Where a projection reaches the goal, read off `GoalStatus.projectedDate` / `projectedDateRecent`. */
export interface CurveCrossing {
  iso: string;
  t: number;
  /** Months after (positive) or before (negative) the deadline: `monthsAtCurrentPace − monthsToDeadline`. */
  monthsVsDeadline: number;
  /** True when the crossing lies past the axis cap and is drawn at the edge. */
  beyondAxis: boolean;
}

/** One projection: the straight line from today to its crossing, labelled by the $/lot behind it. */
export interface CurveProjection {
  /** Net profit per closed lot the projection prices the remaining lots at. */
  avgNetProfitPerClosedLot: number;
  closedLots: number;
  lotsStillNeeded: number;
  monthsAtCurrentPace: number;
  crossing: CurveCrossing;
  line: CurvePoint[];
}

export interface GoalCurve {
  asOf: string;
  deadline: string;
  goal: number;
  netProfitToDate: number;
  /** Trailing closings per month every projection extrapolates with. */
  closedLotsPerMonth: number;
  /** Axis span: the first month of history (or today) to the deadline, stretched to the latest crossing and capped. */
  axis: { from: number; to: number; fromIso: string; toIso: string; capped: boolean };
  /** Cumulative net profit by month end, anchored so the last point equals `netProfitToDate` today. */
  actual: CurvePoint[];
  /** Straight from (today, netProfitToDate) to (deadline, goal). */
  required: [CurvePoint, CurvePoint];
  /** At the all-sold average — the verdict's own projection (`GoalStatus.projectedDate`). Null with no pace or no closings. */
  lifetime: CurveProjection | null;
  /** At the era average (`GoalStatus.projectedDateRecent`). Null without an era or era closings. */
  recent: CurveProjection | null;
  /** "since Mar 2026" for the recent projection's label. */
  recentSinceLabel: string | null;
  /** The verdict's side: `GoalStatus.onTrack` (null with nothing to project). */
  onTrack: boolean | null;
  /** True once the goal is met — every line collapses to the top edge. */
  met: boolean;
}

/** Extra months the axis may stretch past the deadline to show a late crossing before it is drawn at the edge. */
export const CURVE_AXIS_SLACK_MONTHS = 24;

function pointAt(d: Date, value: number): CurvePoint {
  return { t: d.getTime(), iso: toIsoDate(d), value };
}

/**
 * The actual curve from the monthly history. Each month sits at its month end with the cumulative
 * net profit booked by then; the in-progress month sits at today with `netProfitToDate`. The sum
 * is anchored backwards from `netProfitToDate` so the curve always ends on the counter (a capped
 * 24-month history then starts above zero — honest: money booked before the window).
 */
export function actualCurve(history: MonthlyPoint[], goal: Pick<GoalStatus, "asOf" | "netProfitToDate">): CurvePoint[] {
  const asOf = parseDate(goal.asOf) as Date;
  if (history.length === 0) return [pointAt(asOf, goal.netProfitToDate)];
  const cumulative: number[] = new Array<number>(history.length);
  let running = goal.netProfitToDate;
  for (let i = history.length - 1; i >= 0; i--) {
    cumulative[i] = round2(running);
    running -= history[i]?.netProfit ?? 0;
  }
  const out: CurvePoint[] = [];
  const firstStart = parseDate(history[0]?.month) as Date;
  out.push(pointAt(firstStart, round2(Math.max(0, running))));
  history.forEach((m, i) => {
    const start = parseDate(m.month) as Date;
    const at = m.partial ? asOf : endOfUtcMonth(start);
    out.push(pointAt(at < asOf ? at : asOf, cumulative[i] as number));
  });
  return out;
}

function projection(
  asOf: Date,
  start: number,
  goalValue: number,
  monthsToDeadline: number,
  closedLots: number,
  avg: number | null,
  lotsStillNeeded: number | null,
  months: number | null,
  projectedDate: string | null,
): CurveProjection | null {
  if (avg === null || lotsStillNeeded === null || months === null || projectedDate === null) return null;
  const cross = parseDate(projectedDate) as Date;
  const crossing: CurveCrossing = { iso: projectedDate, t: cross.getTime(), monthsVsDeadline: round2(months - monthsToDeadline), beyondAxis: false };
  return {
    avgNetProfitPerClosedLot: avg,
    closedLots,
    lotsStillNeeded,
    monthsAtCurrentPace: months,
    crossing,
    line: [pointAt(asOf, start), pointAt(cross, goalValue)],
  };
}

/** Lays the goal's own figures on a time axis. Pure; every number is `computeGoal`'s. */
export function buildGoalCurve(goal: GoalStatus, history: MonthlyPoint[]): GoalCurve {
  const asOf = parseDate(goal.asOf) as Date;
  const deadline = parseDate(goal.deadline) ?? asOf;
  const start = Math.min(goal.netProfitToDate, goal.goal);
  const met = goal.remaining === 0;
  const actual = actualCurve(history, goal);
  const required: [CurvePoint, CurvePoint] = [pointAt(asOf, start), pointAt(deadline, goal.goal)];

  const lifetime = met
    ? null
    : projection(asOf, start, goal.goal, goal.monthsToDeadline, goal.closedLots, goal.avgNetProfitPerClosedLot, goal.lotsStillNeeded, goal.monthsAtCurrentPace, goal.projectedDate);
  const recent = met
    ? null
    : projection(
        asOf,
        start,
        goal.goal,
        goal.monthsToDeadline,
        goal.recentClosedLots,
        goal.recentAvgNetProfitPerClosedLot,
        goal.lotsStillNeededRecent,
        goal.monthsAtCurrentPaceRecent,
        goal.projectedDateRecent,
      );

  const from = actual[0]?.t ?? asOf.getTime();
  const cap = addMonths(deadline, CURVE_AXIS_SLACK_MONTHS).getTime();
  let to = deadline.getTime();
  let capped = false;
  for (const p of [lifetime, recent]) {
    if (!p) continue;
    if (p.crossing.t > cap) {
      p.crossing.beyondAxis = true;
      capped = true;
      to = cap;
    } else if (p.crossing.t > to) {
      to = p.crossing.t;
    }
  }
  // A projection past the cap is drawn to the edge: the axis ends where the line is still short of the goal.
  for (const p of [lifetime, recent]) {
    if (!p || !p.crossing.beyondAxis) continue;
    const share = (to - asOf.getTime()) / Math.max(1, p.crossing.t - asOf.getTime());
    p.line = [pointAt(asOf, start), pointAt(new Date(to), round2(start + (goal.goal - start) * share))];
  }

  return {
    asOf: goal.asOf,
    deadline: goal.deadline,
    goal: goal.goal,
    netProfitToDate: goal.netProfitToDate,
    closedLotsPerMonth: goal.closedLotsPerMonth,
    axis: { from, to, fromIso: toIsoDate(new Date(from)), toIso: toIsoDate(new Date(to)), capped },
    actual,
    required,
    lifetime,
    recent,
    recentSinceLabel: goal.recentSinceLabel,
    onTrack: goal.onTrack,
    met,
  };
}

/** Value of the straight line through two points at `t`, clamped to the segment's ends. */
export function lineValueAt(line: readonly [CurvePoint, CurvePoint] | readonly CurvePoint[], t: number): number | null {
  const a = line[0];
  const b = line[line.length - 1];
  if (!a || !b) return null;
  if (t <= a.t) return a.value;
  if (t >= b.t) return b.value;
  return a.value + ((b.value - a.value) * (t - a.t)) / (b.t - a.t);
}

// ---------------------------------------------------------------------------------------------
// B. THE GAUGE
// ---------------------------------------------------------------------------------------------

export type DeviationSide = "ahead" | "behind" | "even";

/**
 * Where today's pace lands against the deadline, in three units that share one root: lots closed
 * by the deadline at `closedLotsPerMonth` minus `lotsStillNeeded`; those lots at the ledger
 * average; those dollars over `netProfitPerDayAtPace` (Oxygen). Days equal the Curve marker's
 * months × 30.44 by construction, so the strip and the chart cannot disagree.
 */
export interface DeadlineDeviation {
  side: DeviationSide | null;
  /** Lots the pace closes by the deadline beyond (+) or short of (−) the lots still needed. */
  lots: number | null;
  dollars: number | null;
  /** Days of delay (−) or slack (+); null when nothing is being produced (no pace to divide by). */
  days: number | null;
  /** closedLotsPerMonth × monthsToDeadline. */
  lotsAtDeadline: number | null;
  lotsStillNeeded: number | null;
  closedLotsPerMonth: number;
  netProfitPerDayAtPace: number | null;
  met: boolean;
  /** No closed lot ever: nothing to price the remaining lots with. */
  noHistory: boolean;
}

export function deviationAtDeadline(goal: GoalStatus, netProfitPerDay: number | null): DeadlineDeviation {
  const base: DeadlineDeviation = {
    side: null,
    lots: null,
    dollars: null,
    days: null,
    lotsAtDeadline: null,
    lotsStillNeeded: goal.lotsStillNeeded,
    closedLotsPerMonth: goal.closedLotsPerMonth,
    netProfitPerDayAtPace: netProfitPerDay,
    met: goal.remaining === 0,
    noHistory: goal.lotsStillNeeded === null && goal.remaining > 0,
  };
  if (base.met) return { ...base, side: "ahead", lots: 0, dollars: 0, days: 0, lotsAtDeadline: 0, lotsStillNeeded: 0 };
  if (goal.lotsStillNeeded === null || goal.avgNetProfitPerClosedLot === null) return base;
  const lotsAtDeadline = round2(goal.closedLotsPerMonth * Math.max(0, goal.monthsToDeadline));
  const lots = round2(lotsAtDeadline - goal.lotsStillNeeded);
  const dollars = round2(lots * goal.avgNetProfitPerClosedLot);
  const days = netProfitPerDay !== null && netProfitPerDay > 0 ? Math.round(dollars / netProfitPerDay) : null;
  const side: DeviationSide = lots > 0 ? "ahead" : lots < 0 ? "behind" : "even";
  return { ...base, side, lots, dollars, days, lotsAtDeadline };
}

// ---------------------------------------------------------------------------------------------
// C. THE FARM CALENDAR
// ---------------------------------------------------------------------------------------------

export interface CalendarMonth {
  /** War Plan month index (1 = the month containing today). */
  index: number;
  /** Month end (ISO), as the War Plan rows date it. */
  iso: string;
  label: string;
  /** Month index the deadline falls in. */
  isDeadline: boolean;
}

export interface InventoryRunout {
  /** Lots in the War Plan's inventory today: available + reserved (`WarPlan.startInventory`). */
  lots: number;
  availableLots: number;
  reservedLots: number;
  /** The required plan's closings per month. */
  requiredPerMonth: number;
  /** lots ÷ requiredPerMonth; null when the required pace is zero (the target is met or unreachable). */
  months: number | null;
  /** Today + months (ISO); null when never. */
  iso: string | null;
  /** War Plan month index containing that date; null when never or past the plan's grid. */
  monthIndex: number | null;
  /** True when inventory outlasts the deadline. */
  afterDeadline: boolean;
}

export type LagSource = "observed" | "assumption";

export interface FarmLag {
  /** Months from funding to first closing the schedule works back with (`WarPlan.landLag`). */
  months: number;
  /** "observed" when the input still equals the median of ≥ 2 funded farms; "assumption" otherwise. */
  source: LagSource;
  /** Funded farms with a first closing behind the observed median. */
  observedFarms: number;
  observedMonths: number | null;
}

export interface PlannedFarm {
  /** 1-based position in the required plan. */
  number: number;
  /** Month the farm must be funded by (month end ISO). */
  purchaseMonth: number;
  purchaseIso: string;
  /** First month its lots can close. */
  landMonth: number;
  landIso: string | null;
  lots: number;
  cost: number;
  /** Covered by capital returned from an earlier farm in this plan (the Oracle's recycling). */
  recycled: number;
  /** Fresh sponsor capital to raise. */
  fresh: number;
  /** Nothing in the mix covers this part. */
  unfunded: number;
  sponsors: { name: string; amount: number }[];
  /** Bought later than the plan can convert before the deadline. */
  tooLate: boolean;
}

export interface PlannedCapitalReturn {
  monthIndex: number;
  iso: string | null;
  /** The planned farm whose capital comes back. */
  farmNumber: number;
  sponsor: string;
  amount: number;
  /** Planned farm this money can fund (the first bought from that month on that used recycled capital), if any. */
  fundsFarmNumber: number | null;
  /** True when the turn completes after the deadline month. */
  afterDeadline: boolean;
}

export interface FarmCalendar {
  asOf: string;
  deadline: string;
  deadlineMonthIndex: number;
  months: CalendarMonth[];
  inventoryOut: InventoryRunout;
  lag: FarmLag;
  farms: PlannedFarm[];
  returns: PlannedCapitalReturn[];
  /** Months of the plan's capital cycle, or null when capital never rotates inside the plan. */
  cycleMonths: number | null;
  /** Fresh capital over the plan (`WarPlanColumn.capitalToRaise`). */
  capitalToRaise: number;
  recycledTotal: number;
}

const calendarMonthFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The required plan's farms, funding deadlines and sponsor paybacks on the months from today to
 * the deadline. Funding deadlines are the plan's just-in-time purchase months (worked back from
 * the month inventory runs short by `landLag`); paybacks are each funded farm's slices returning
 * at `turnCompletesMonth`, exactly as the Oracle's `fundSchedule` recycles them.
 */
export function buildFarmCalendar(plan: WarPlan, real: Pick<WarPlanRealValues, "farmToFirstCloseMonths" | "farmToFirstCloseFarms">): FarmCalendar {
  const asOf = parseDate(plan.asOf) as Date;
  const deadline = parseDate(plan.goal.deadline) ?? asOf;
  const grid = buildMonthGrid(asOf, deadline, true);
  const k = plan.deadlineMonthIndex;
  const isoFor = (m: number): string | null => {
    const row = plan.required.rows.find((r) => r.monthIndex === m);
    if (row) return row.date;
    const mo = grid.months[m - 1];
    return mo ? toIsoDate(mo.end) : null;
  };
  const months: CalendarMonth[] = plan.required.rows.map((r) => ({
    index: r.monthIndex,
    iso: r.date,
    label: calendarMonthFmt.format(parseDate(r.date) as Date),
    isDeadline: r.monthIndex === k,
  }));

  const requiredPerMonth = plan.required.closingsPerMonth;
  const runoutMonths = requiredPerMonth > 0 ? round2(plan.startInventory / requiredPerMonth) : null;
  const runoutDate = runoutMonths === null ? null : addMonths(asOf, runoutMonths);
  let runoutIndex: number | null = null;
  if (runoutDate) {
    for (const mo of grid.months) {
      if (runoutDate <= mo.end) {
        runoutIndex = mo.index;
        break;
      }
    }
  }
  const inventoryOut: InventoryRunout = {
    lots: plan.startInventory,
    availableLots: plan.goal.availableLots,
    reservedLots: plan.goal.reservedLots,
    requiredPerMonth,
    months: runoutMonths,
    iso: runoutDate ? toIsoDate(runoutDate) : null,
    monthIndex: runoutIndex,
    afterDeadline: runoutDate === null || runoutDate > deadline,
  };

  const observed = real.farmToFirstCloseFarms >= 2 && real.farmToFirstCloseMonths !== null && plan.inputs.farmToFirstCloseMonths === real.farmToFirstCloseMonths;
  const lag: FarmLag = {
    months: plan.landLag,
    source: observed ? "observed" : "assumption",
    observedFarms: real.farmToFirstCloseFarms,
    observedMonths: real.farmToFirstCloseMonths,
  };

  const planned = plan.required.schedule;
  const farms: PlannedFarm[] = planned.map((f, i) => ({
    number: i + 1,
    purchaseMonth: f.purchaseMonth,
    purchaseIso: isoFor(f.purchaseMonth) ?? plan.goal.deadline,
    landMonth: f.landMonth,
    landIso: isoFor(f.landMonth),
    lots: f.lots,
    cost: round2(f.cost),
    recycled: round2(f.recycled),
    fresh: round2(Math.max(0, f.cost - f.recycled - f.unfunded)),
    unfunded: round2(f.unfunded),
    sponsors: f.funding.map((s) => ({ name: s.name, amount: round2(s.amount) })),
    tooLate: f.tooLate,
  }));

  const returns: PlannedCapitalReturn[] = [];
  planned.forEach((f, i) => {
    if (f.turnCompletesMonth === null) return;
    const month = f.turnCompletesMonth;
    const fed = planned.find((g) => g.purchaseMonth >= month && g.recycled > 0);
    for (const s of f.funding) {
      returns.push({
        monthIndex: month,
        iso: isoFor(month),
        farmNumber: i + 1,
        sponsor: s.name,
        amount: round2(s.amount),
        fundsFarmNumber: fed ? fed.index + 1 : null,
        afterDeadline: k === 0 || month > k,
      });
    }
  });
  returns.sort((a, b) => a.monthIndex - b.monthIndex || a.farmNumber - b.farmNumber);

  return {
    asOf: plan.asOf,
    deadline: plan.goal.deadline,
    deadlineMonthIndex: k,
    months,
    inventoryOut,
    lag,
    farms,
    returns,
    cycleMonths: plan.rotation.cycleMonths,
    capitalToRaise: plan.required.capitalToRaise,
    recycledTotal: plan.rotation.recycled,
  };
}

// ---------------------------------------------------------------------------------------------
// D. THE REVERSE FUNNEL
// ---------------------------------------------------------------------------------------------

/** A quantity at both averages; `recent` is null without an era average. */
export interface FunnelPair {
  lifetime: number | null;
  recent: number | null;
}

export interface FunnelStep {
  id: "remaining" | "lots" | "reservations" | "perMonth" | "perWeek";
  /** The demand in the step's own unit (dollars, lots, reservations). */
  total: FunnelPair;
  /** The same demand per month. */
  perMonth: FunnelPair;
}

export interface ReverseFunnel {
  remaining: number;
  monthsToDeadline: number;
  /** Reservation → closing conversion the funnel divides by (Expected's, cancellations included when measured). */
  conversionPct: number;
  conversionSource: Expected["conversionSource"];
  avgNetProfitPerClosedLot: number | null;
  recentAvgNetProfitPerClosedLot: number | null;
  recentSinceLabel: string | null;
  steps: FunnelStep[];
  /** True when nothing can be priced (no closed lot ever). */
  noHistory: boolean;
  met: boolean;
}

const WEEKS_PER_MONTH = DAYS_PER_MONTH / 7;

function pair(lifetime: number | null, recent: number | null): FunnelPair {
  return { lifetime: lifetime === null ? null : round2(lifetime), recent: recent === null ? null : round2(recent) };
}

/**
 * From the remaining dollars back to reservations per week, at the ledger average and at the era
 * average side by side. Lots are `computeGoal`'s two `lotsStillNeeded`; reservations divide them
 * by `Expected.conversionPct`; per month is `Expected.requiredReservationsPerMonth(Recent)`;
 * per week is that over 30.44 ÷ 7.
 */
export function buildReverseFunnel(goal: GoalStatus, expected: Expected): ReverseFunnel {
  const months = goal.monthsToDeadline;
  const conversion = expected.conversionPct / 100;
  const perMonthOf = (total: number | null) => (total === null ? null : months > 0 ? total / months : null);
  const reservationsOf = (lots: number | null) => (lots === null || conversion <= 0 ? null : lots / conversion);
  const perWeekOf = (perMonth: number | null) => (perMonth === null ? null : perMonth / WEEKS_PER_MONTH);

  const lots = pair(goal.lotsStillNeeded, goal.lotsStillNeededRecent);
  const reservations = pair(reservationsOf(goal.lotsStillNeeded), reservationsOf(goal.lotsStillNeededRecent));
  const perMonth = pair(expected.requiredReservationsPerMonth, expected.requiredReservationsPerMonthRecent);
  const perWeek = pair(perWeekOf(expected.requiredReservationsPerMonth), perWeekOf(expected.requiredReservationsPerMonthRecent));

  const steps: FunnelStep[] = [
    { id: "remaining", total: pair(goal.remaining, goal.remaining), perMonth: pair(perMonthOf(goal.remaining), perMonthOf(goal.remaining)) },
    { id: "lots", total: lots, perMonth: pair(goal.requiredLotsPerMonthToHitDeadline, goal.requiredLotsPerMonthToHitDeadlineRecent) },
    { id: "reservations", total: reservations, perMonth },
    { id: "perMonth", total: perMonth, perMonth },
    { id: "perWeek", total: perWeek, perMonth },
  ];

  return {
    remaining: goal.remaining,
    monthsToDeadline: months,
    conversionPct: expected.conversionPct,
    conversionSource: expected.conversionSource,
    avgNetProfitPerClosedLot: goal.avgNetProfitPerClosedLot,
    recentAvgNetProfitPerClosedLot: goal.recentAvgNetProfitPerClosedLot,
    recentSinceLabel: goal.recentSinceLabel,
    steps,
    noHistory: goal.lotsStillNeeded === null && goal.remaining > 0,
    met: goal.remaining === 0,
  };
}