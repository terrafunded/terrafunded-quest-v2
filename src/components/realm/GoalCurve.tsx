import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { buildGoalCurve, endOfUtcMonth, historyMonthLabel, lineValueAt, toIsoDate, type CurvePoint, type CurveProjection, type GoalCurve as GoalCurveShape, type GoalStatus, type MonthlyPoint } from "@/domain";
import { eraMonthLabel } from "@/domain/era";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useWideViewport } from "@/hooks/useWideViewport";
import { useTheme } from "@/theme/ThemeProvider";
import { date, money, moneyCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRealmStrings, type RealmUiStrings } from "@/i18n/realm";
import { BORDER, EMBER, FOREGROUND, GOLD, GREEN, MUTED, OXYGEN, POPOVER, TOOLTIP_CLASS, TOOLTIP_STYLE, useChartReveal } from "./chartTokens";

const MS_PER_MONTH = (365.25 / 12) * 86_400_000;
const MAX_LINE_DURATION_MS = 900;

interface Row {
  t: number;
  actual?: number;
  required?: number;
  lifetime?: number;
  recent?: number;
  shade?: [number, number];
  band?: [number, number];
}

/** Value of a projection at `t`, held at its end value once the line is over (the goal, or the axis edge). */
function extended(line: readonly CurvePoint[], t: number): number {
  const end = line[line.length - 1] as CurvePoint;
  return t >= end.t ? end.value : (lineValueAt(line, t) ?? end.value);
}

/** One row per moment any series has a point, so the range areas have both edges at every x. */
function buildRows(c: GoalCurveShape): Row[] {
  const asOf = c.required[0].t;
  const deadline = c.required[1].t;
  const ts = new Set<number>();
  for (const p of c.actual) ts.add(p.t);
  ts.add(asOf);
  ts.add(deadline);
  ts.add(c.axis.to);
  for (const p of [c.lifetime, c.recent]) if (p) ts.add(p.line[p.line.length - 1]?.t ?? asOf);
  let cursor = endOfUtcMonth(new Date(asOf));
  while (cursor.getTime() < c.axis.to) {
    if (cursor.getTime() > asOf) ts.add(cursor.getTime());
    cursor = endOfUtcMonth(new Date(cursor.getTime() + 86_400_000));
  }
  const actualAt = new Map(c.actual.map((p) => [p.t, p.value]));
  const lifetimeEnd = c.lifetime ? (c.lifetime.line[c.lifetime.line.length - 1] as CurvePoint).t : null;
  const recentEnd = c.recent ? (c.recent.line[c.recent.line.length - 1] as CurvePoint).t : null;
  const bandEnd = Math.max(lifetimeEnd ?? asOf, recentEnd ?? asOf);
  return [...ts]
    .sort((a, b) => a - b)
    .map((t) => {
      const row: Row = { t };
      const a = actualAt.get(t);
      if (a !== undefined) row.actual = a;
      if (t >= asOf && t <= deadline) row.required = lineValueAt(c.required, t) ?? undefined;
      if (c.lifetime && lifetimeEnd !== null && t >= asOf && t <= lifetimeEnd) row.lifetime = lineValueAt(c.lifetime.line, t) ?? undefined;
      if (c.recent && recentEnd !== null && t >= asOf && t <= recentEnd) row.recent = lineValueAt(c.recent.line, t) ?? undefined;
      if (c.lifetime && row.required !== undefined) {
        const proj = extended(c.lifetime.line, t);
        row.shade = [Math.min(row.required, proj), Math.max(row.required, proj)];
      }
      if (c.lifetime && c.recent && t >= asOf && t <= bandEnd) {
        const l = extended(c.lifetime.line, t);
        const r = extended(c.recent.line, t);
        row.band = [Math.min(l, r), Math.max(l, r)];
      }
      return row;
    });
}

/** Month-start ticks, thinned so labels never collide (about nine on a wide screen, four on a phone). */
function monthTicks(from: number, to: number, wide: boolean): number[] {
  const span = Math.max(1, (to - from) / MS_PER_MONTH);
  const step = Math.max(1, Math.ceil(span / (wide ? 9 : 4)));
  const start = new Date(from);
  let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  if (step >= 12) d = new Date(Date.UTC(d.getUTCMonth() === 0 ? d.getUTCFullYear() : d.getUTCFullYear() + 1, 0, 1));
  const out: number[] = [];
  while (d.getTime() <= to) {
    out.push(d.getTime());
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + step, 1));
  }
  return out;
}

const isoOf = (t: number) => toIsoDate(new Date(t));
const monthsLabel = (months: number) => Math.abs(months).toFixed(1);

function crossingText(p: CurveProjection, t: RealmUiStrings["goalCurve"], edgeIso: string): string {
  if (p.crossing.beyondAxis) return t.beyond(historyMonthLabel(edgeIso));
  const m = p.crossing.monthsVsDeadline;
  if (m > 0) return t.misses(date(p.crossing.iso), monthsLabel(m));
  if (m < 0) return t.beats(date(p.crossing.iso), monthsLabel(m));
  return t.onTheDay(date(p.crossing.iso));
}

interface DotLabelProps {
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
  text: string;
  sub?: string;
  fill: string;
  anchorEnd: boolean;
  strong: boolean;
  /** "above" hangs the text over the dot (into the top margin); "below" under it. */
  side: "above" | "below";
}

/** Text hung under a crossing dot, flipped to end-anchored near the right edge so it stays inside the plot. */
function DotLabel({ viewBox, text, sub, fill, anchorEnd, strong, side }: DotLabelProps) {
  const x = (viewBox?.x ?? 0) + (viewBox?.width ?? 0) / 2;
  const top = viewBox?.y ?? 0;
  const bottom = top + (viewBox?.height ?? 0);
  const anchor = anchorEnd ? "end" : "start";
  const dx = anchorEnd ? -8 : 8;
  const y = side === "above" ? top - 8 : bottom + 14;
  return (
    <g>
      <text x={x + dx} y={y} textAnchor={anchor} fill={fill} fontSize={strong ? 12 : 11} fontWeight={strong ? 600 : 400} style={{ textTransform: "none" }}>
        {text}
      </text>
      {sub && (
        <text x={x + dx} y={y + 14} textAnchor={anchor} fill={MUTED} fontSize={10} style={{ textTransform: "none" }}>
          {sub}
        </text>
      )}
    </g>
  );
}

type TooltipProps = {
  active?: boolean;
  label?: number;
  payload?: { payload: Row }[];
  t: RealmUiStrings["goalCurve"];
};

function CurveTooltip({ active, label, payload, t }: TooltipProps) {
  if (!active || !payload?.[0] || typeof label !== "number") return null;
  const row = payload[0].payload;
  const rows: { key: string; label: string; value: number | undefined; color: string }[] = [
    { key: "actual", label: t.tooltipActual, value: row.actual, color: GREEN },
    { key: "required", label: t.tooltipRequired, value: row.required, color: GOLD },
    { key: "lifetime", label: t.tooltipProjected, value: row.lifetime, color: FOREGROUND },
    { key: "recent", label: t.tooltipProjectedRecent, value: row.recent, color: MUTED },
  ];
  return (
    <div className={TOOLTIP_CLASS} style={TOOLTIP_STYLE} data-testid="goal-curve-tooltip">
      <div className="font-heading text-gold" style={{ textTransform: "none" }}>
        {date(isoOf(label))}
      </div>
      {rows
        .filter((r) => r.value !== undefined)
        .map((r) => (
          <div key={r.key} className="mt-1 flex items-center justify-between gap-4 tabular">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
              {r.label}
            </span>
            <span>{money(r.value)}</span>
          </div>
        ))}
    </div>
  );
}

/**
 * THE CURVE — cumulative net profit against the straight line the deadline requires, with today's
 * pace projected forward at the two averages the ledger offers (all sold lots; since the era
 * start). Every figure is `computeGoal`'s; `buildGoalCurve` only lays them on a time axis. Shade
 * between the required line and the projection: ember when the verdict is behind, oxygen when
 * ahead. Reads in two seconds: is the projection above or below the required line.
 */
export function GoalCurve({ goal, history }: { goal: GoalStatus; history: MonthlyPoint[] }) {
  const { d, reducedMotion } = useTheme();
  const t = useRealmStrings().goalCurve;
  const wide = useWideViewport();
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  const reveal = useChartReveal(reducedMotion);
  const curve = useMemo(() => buildGoalCurve(goal, history), [goal, history]);
  const rows = useMemo(() => buildRows(curve), [curve]);
  const ticks = useMemo(() => monthTicks(curve.axis.from, curve.axis.to, wide), [curve.axis.from, curve.axis.to, wide]);
  const duration = Math.min(Math.round(d(0.7) * 1000), MAX_LINE_DURATION_MS);

  const sideColor = curve.onTrack === null ? null : curve.onTrack ? OXYGEN : EMBER;
  const horizonYear = Number(curve.deadline.slice(0, 4));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * curve.goal);
  const anchorEnd = (x: number) => (x - curve.axis.from) / Math.max(1, curve.axis.to - curve.axis.from) > 0.62;
  const { lifetime, recent } = curve;
  const eraMonth = goal.recentSince ? eraMonthLabel(goal.recentSince) : null;
  const lifetimeLabel = lifetime ? crossingText(lifetime, t, curve.axis.toIso) : null;
  const recentLabel = recent ? crossingText(recent, t, curve.axis.toIso) : null;
  const endOf = (p: CurveProjection) => p.line[p.line.length - 1] as CurvePoint;
  const status = curve.met ? t.met : goal.lotsStillNeeded === null ? t.noHistory : curve.lifetime === null ? t.noPace : null;

  return (
    <section
      className="parchment-card min-w-0 overflow-hidden p-4 sm:p-5"
      aria-label={t.aria}
      data-testid="goal-curve"
      data-revealed={inView}
      data-animating={reveal.animate}
      data-side={curve.onTrack === null ? "" : curve.onTrack ? "ahead" : "behind"}
      data-deadline={curve.deadline}
      data-required-start={curve.required[0].value}
      data-required-start-date={curve.required[0].iso}
      data-required-end={curve.required[1].value}
      data-required-end-date={curve.required[1].iso}
      data-crossing={curve.lifetime?.crossing.iso ?? ""}
      data-crossing-months={curve.lifetime?.crossing.monthsVsDeadline ?? ""}
      data-crossing-recent={curve.recent?.crossing.iso ?? ""}
      data-axis-to={curve.axis.toIso}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.title}</h2>
        {sideColor && (
          <span className={cn("font-heading text-sm", curve.onTrack ? "text-oxygen" : "text-ember")} data-testid="goal-curve-side">
            {curve.onTrack ? t.ahead : t.behind}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{t.legend(eraMonth)}</p>

      <div ref={ref} className="mt-3 h-72 w-full sm:h-96">
        {inView && (
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: wide ? 26 : 12, right: wide ? 16 : 8, left: 0, bottom: 0 }}>
              {wide && <CartesianGrid stroke={BORDER} vertical={false} />}
              <XAxis
                type="number"
                dataKey="t"
                domain={[curve.axis.from, curve.axis.to]}
                ticks={ticks}
                tickFormatter={(v: number) => historyMonthLabel(isoOf(v))}
                tick={{ fill: MUTED, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={8}
              />
              <YAxis
                type="number"
                domain={[0, curve.goal]}
                ticks={yTicks}
                tickFormatter={(v: number) => moneyCompact(v)}
                tick={{ fill: MUTED, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={wide ? 48 : 40}
                allowDataOverflow
              />
              <ChartTooltip content={<CurveTooltip t={t} />} cursor={{ stroke: FOREGROUND, strokeOpacity: 0.25 }} isAnimationActive={false} />

              {sideColor && (
                <Area
                  type="linear"
                  dataKey="shade"
                  stroke="none"
                  fill={sideColor}
                  fillOpacity={0.18}
                  connectNulls
                  isAnimationActive={reveal.animate}
                  animationDuration={duration}
                  activeDot={false}
                  legendType="none"
                />
              )}
              {wide && curve.recent && (
                <Area
                  type="linear"
                  dataKey="band"
                  stroke="none"
                  fill={FOREGROUND}
                  fillOpacity={0.08}
                  connectNulls
                  isAnimationActive={reveal.animate}
                  animationDuration={duration}
                  activeDot={false}
                  legendType="none"
                />
              )}

              <ReferenceLine x={curve.required[0].t} stroke={MUTED} strokeDasharray="3 3" label={{ value: t.today, fill: MUTED, fontSize: 10, position: "insideTopLeft" }} />
              <ReferenceLine
                x={curve.required[1].t}
                stroke={GOLD}
                strokeOpacity={0.7}
                label={{ value: t.deadline(horizonYear), fill: GOLD, fontSize: 10, position: anchorEnd(curve.required[1].t) ? "insideTopRight" : "insideTopLeft" }}
              />

              <Line
                type="linear"
                dataKey="required"
                stroke={GOLD}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={reveal.animate}
                animationDuration={duration}
                onAnimationEnd={reveal.settle}
              />
              <Line type="linear" dataKey="actual" stroke={GREEN} strokeWidth={2.5} dot={false} activeDot={{ r: 3 }} connectNulls isAnimationActive={reveal.animate} animationDuration={duration} />
              {curve.lifetime && (
                <Line type="linear" dataKey="lifetime" stroke={FOREGROUND} strokeWidth={1.75} dot={false} activeDot={false} connectNulls isAnimationActive={reveal.animate} animationDuration={duration} />
              )}
              {curve.recent && (
                <Line
                  type="linear"
                  dataKey="recent"
                  stroke={FOREGROUND}
                  strokeOpacity={0.7}
                  strokeWidth={1.25}
                  strokeDasharray="2 4"
                  dot={false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={reveal.animate}
                  animationDuration={duration}
                />
              )}

              {recent && recentLabel && (
                <ReferenceDot
                  x={endOf(recent).t}
                  y={endOf(recent).value}
                  r={3.5}
                  fill={POPOVER}
                  stroke={FOREGROUND}
                  strokeOpacity={0.7}
                  label={
                    wide
                      ? (props: DotLabelProps) => (
                          <DotLabel {...props} text={recentLabel} fill={MUTED} anchorEnd={anchorEnd(endOf(recent).t)} strong={false} side="below" />
                        )
                      : undefined
                  }
                />
              )}
              {lifetime && lifetimeLabel && sideColor && (
                <ReferenceDot
                  x={endOf(lifetime).t}
                  y={endOf(lifetime).value}
                  r={5}
                  fill={sideColor}
                  stroke={FOREGROUND}
                  strokeWidth={1}
                  label={wide ? (props: DotLabelProps) => <DotLabel {...props} text={lifetimeLabel} fill={sideColor} anchorEnd={anchorEnd(endOf(lifetime).t)} strong side="above" /> : undefined}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground" aria-label="legend">
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: GREEN }} /> {t.actual}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t border-dashed" style={{ borderColor: GOLD }} /> {t.required}
        </li>
        {curve.lifetime && (
          <li className="inline-flex items-center gap-1.5" data-testid="goal-curve-legend-lifetime">
            <span className="inline-block h-0.5 w-4" style={{ background: FOREGROUND }} /> {t.projectedLifetime(money(curve.lifetime.avgNetProfitPerClosedLot), curve.lifetime.closedLots)}
          </li>
        )}
        {recent && eraMonth && (
          <li className="inline-flex items-center gap-1.5" data-testid="goal-curve-legend-recent">
            <span className="inline-block h-0 w-4 border-t border-dotted" style={{ borderColor: FOREGROUND }} /> {t.projectedRecent(money(recent.avgNetProfitPerClosedLot), recent.closedLots, eraMonth)}
          </li>
        )}
      </ul>
      {lifetimeLabel && (
        <p className={cn("mt-2 text-sm", curve.onTrack ? "text-oxygen" : "text-ember")} data-testid="goal-curve-marker">
          {lifetimeLabel}
          {recentLabel && eraMonth && (
            <span className="text-muted-foreground">
              {" "}
              · {recentLabel} {t.atRecentAverage(eraMonth)}
            </span>
          )}
        </p>
      )}
      {status && (
        <p className="mt-2 text-sm text-muted-foreground" data-testid="goal-curve-status">
          {status}
        </p>
      )}
    </section>
  );
}
