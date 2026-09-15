import { useMemo, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import type { MonthlyPoint } from "@/domain";
import { DAYS_PER_MONTH } from "@/config/goal";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useWideViewport } from "@/hooks/useWideViewport";
import { useTheme } from "@/theme/ThemeProvider";
import { money, moneyCompact, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useLang } from "@/i18n/lang";
import { useRealmStrings, type RealmUiStrings } from "@/i18n/realm";
import { ChartLegend } from "./ChartLegend";
import {
  BORDER,
  CURSOR,
  DATA_AXIS,
  DATA_CAT,
  DATA_GOAL,
  DATA_INVENTORY,
  DATA_PROFIT_INVENTORY,
  GRID_STROKE_OPACITY,
  POPOVER,
  SERIES_STROKE_WIDTH,
  useChartReveal,
  type ChartReveal,
} from "./chartTokens";

const RESERVATIONS = DATA_CAT[2];
const CLOSINGS = DATA_INVENTORY;

/**
 * Every bar gets its own tick. With `minTickGap` recharts dropped alternate months, so a bar in an
 * unlabelled month sat next to another month's label and was read as that month (an Apr 26 bar
 * beside the "Mar 26" tick looked like Mar 26 having profit while its tooltip said $0). Rotated
 * labels fit the narrowest band (12 months at 390px ≈ 23px) without overlapping.
 */
const X_TICK = { fill: DATA_AXIS, fontSize: 10 };
const X_AXIS_HEIGHT = 34;

/**
 * Reveal timing. Bars grow once, when the chart first scrolls into view. The second series of the
 * pace chart starts a beat after the first so the two do not rise in unison; duration is capped so
 * begin + duration stays under ~800ms on every skin (Iron Crown's 1.5× motion scale would push it
 * past that).
 */
const MAX_BAR_DURATION_MS = 600;
const SECOND_SERIES_BEGIN_MS = 150;

function fillOpacity(p: MonthlyPoint): number {
  if (p.beforeEra) return 0.35;
  if (p.partial) return 0.55;
  return 1;
}

type TooltipProps = { active?: boolean; payload?: { payload: MonthlyPoint }[]; t: RealmUiStrings["pulseCharts"] };

/**
 * Tooltip header: the month exactly as the X axis tick prints it (`MonthlyPoint.label`, the axis
 * dataKey). Inline `textTransform` because Neon Kingdom uppercases `.font-heading`, which would
 * make the tooltip say "MAR 26" under a "Mar 26" tick.
 */
function TooltipMonth({ p, t }: { p: MonthlyPoint; t: RealmUiStrings["pulseCharts"] }) {
  return (
    <div className="font-heading text-gold">
      <span data-testid="pulse-tooltip-month" style={{ textTransform: "none" }}>
        {p.label}
      </span>
      {p.partial && <span className="text-muted-foreground"> · {t.monthInProgress}</span>}
    </div>
  );
}

function PaceTooltip({ active, payload, t }: TooltipProps) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border px-3 py-2 text-xs shadow-md" style={{ background: POPOVER, borderColor: BORDER }}>
      <TooltipMonth p={p} t={t} />
      <div className="mt-1 tabular" data-testid="pulse-tooltip-reservations">
        {t.tooltipReservations(p.reservations)}
      </div>
      <div className="tabular" data-testid="pulse-tooltip-closings">
        {t.tooltipClosings(p.closings)}
      </div>
    </div>
  );
}

function ProfitTooltip({ active, payload, t }: TooltipProps) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border px-3 py-2 text-xs shadow-md" style={{ background: POPOVER, borderColor: BORDER }}>
      <TooltipMonth p={p} t={t} />
      <div className="mt-1 tabular" data-testid="pulse-tooltip-profit" data-value={p.netProfit}>
        {money(p.netProfit)}
      </div>
    </div>
  );
}

/**
 * THE PULSE CHARTS — reservations vs closings, and net profit per month, against the
 * horizon's required pace. Data is `realm.history`; the dashed lines are the only
 * figures that move when the exit year changes.
 */
export function PulseCharts({
  history,
  requiredClosings,
  requiredReservations,
  requiredProfitPerDay,
  eraLabel,
}: {
  history: MonthlyPoint[];
  requiredClosings: number | null;
  requiredReservations: number | null;
  requiredProfitPerDay: number | null;
  eraLabel: string | null;
}) {
  const { d, reducedMotion } = useTheme();
  const [lang] = useLang();
  const t = useRealmStrings().pulseCharts;
  const wide = useWideViewport();
  const points = useMemo(() => {
    const slice = wide ? history : history.slice(-12);
    return slice.map((p) => ({ ...p, label: monthLabel(p.month, lang) }));
  }, [history, wide, lang]);
  const duration = Math.min(Math.round(d(0.5) * 1000), MAX_BAR_DURATION_MS);
  const requiredProfit = requiredProfitPerDay === null ? null : requiredProfitPerDay * DAYS_PER_MONTH;
  const hasBeforeEra = points.some((p) => p.beforeEra);

  if (points.length === 0) return null;

  return (
    <section className="space-y-3" aria-label={t.aria} data-testid="pulse-charts">
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <ChartCard
          title={t.paceTitle}
          legend={t.paceLegend}
          testId="pulse-chart-pace"
          requiredClosings={requiredClosings}
          requiredReservations={requiredReservations}
          reducedMotion={reducedMotion}
          swatches={[
            { color: RESERVATIONS, label: t.reservations },
            { color: CLOSINGS, label: t.closings },
            { color: DATA_GOAL, label: t.required, dashed: true },
          ]}
        >
          {(reveal) => (
            <ResponsiveContainer>
              <BarChart data={points} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={DATA_AXIS} strokeOpacity={GRID_STROKE_OPACITY} vertical={false} />
                <XAxis dataKey="label" interval={0} angle={-45} textAnchor="end" height={X_AXIS_HEIGHT} tick={X_TICK} tickLine={false} axisLine={false} />
                <YAxis
                  allowDecimals={false}
                  domain={[0, (max: number) => Math.max(max, requiredClosings ?? 0, requiredReservations ?? 0, 1)]}
                  tick={{ fill: DATA_AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <ChartTooltip content={<PaceTooltip t={t} />} cursor={CURSOR} />
                {requiredReservations !== null && (
                  <ReferenceLine
                    y={requiredReservations}
                    stroke={DATA_GOAL}
                    strokeWidth={SERIES_STROKE_WIDTH}
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                    label={{ value: t.required, fill: DATA_GOAL, fontSize: 11, position: "insideTopLeft" }}
                  />
              )}
              {requiredClosings !== null && (
                <ReferenceLine
                  y={requiredClosings}
                    stroke={DATA_GOAL}
                    strokeWidth={SERIES_STROKE_WIDTH}
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                    label={{ value: t.required, fill: DATA_GOAL, fontSize: 11, position: "insideTopRight" }}
                />
              )}
              <Bar
                dataKey="reservations"
                name={t.reservations}
                fill={RESERVATIONS}
                radius={[3, 3, 0, 0]}
                isAnimationActive={reveal.animate}
                animationBegin={0}
                animationDuration={duration}
              >
                {points.map((p) => (
                  <Cell key={`r-${p.month}`} fill={RESERVATIONS} fillOpacity={fillOpacity(p)} />
                ))}
              </Bar>
              <Bar
                dataKey="closings"
                name={t.closings}
                fill={CLOSINGS}
                radius={[3, 3, 0, 0]}
                isAnimationActive={reveal.animate}
                animationBegin={SECOND_SERIES_BEGIN_MS}
                animationDuration={duration}
                onAnimationEnd={reveal.settle}
              >
                {points.map((p) => (
                  <Cell key={`c-${p.month}`} fill={CLOSINGS} fillOpacity={fillOpacity(p)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title={t.profitTitle}
          legend={t.profitLegend}
          testId="pulse-chart-profit"
          requiredProfit={requiredProfit}
          reducedMotion={reducedMotion}
          swatches={[
            { color: DATA_PROFIT_INVENTORY, label: t.netProfit },
            { color: DATA_GOAL, label: t.required, dashed: true },
          ]}
        >
          {(reveal) => (
            <ResponsiveContainer>
              <BarChart data={points} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={DATA_AXIS} strokeOpacity={GRID_STROKE_OPACITY} vertical={false} />
                <XAxis dataKey="label" interval={0} angle={-45} textAnchor="end" height={X_AXIS_HEIGHT} tick={X_TICK} tickLine={false} axisLine={false} />
                <YAxis
                  domain={[0, (max: number) => Math.max(max, requiredProfit ?? 0, 1)]}
                  tickFormatter={(v: number) => moneyCompact(v)}
                  tick={{ fill: DATA_AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <ChartTooltip content={<ProfitTooltip t={t} />} cursor={CURSOR} />
                {requiredProfit !== null && (
                  <ReferenceLine
                    y={requiredProfit}
                    stroke={DATA_GOAL}
                    strokeWidth={SERIES_STROKE_WIDTH}
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                    label={{ value: t.required, fill: DATA_GOAL, fontSize: 11, position: "insideTopRight" }}
                  />
              )}
              <Bar
                dataKey="netProfit"
                name={t.netProfit}
                fill={DATA_PROFIT_INVENTORY}
                radius={[3, 3, 0, 0]}
                isAnimationActive={reveal.animate}
                animationBegin={0}
                animationDuration={duration}
                onAnimationEnd={reveal.settle}
              >
                {points.map((p) => (
                  <Cell key={`p-${p.month}`} fill={DATA_PROFIT_INVENTORY} fillOpacity={fillOpacity(p)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
      {hasBeforeEra && eraLabel && (
        <p className="text-sm text-muted-foreground" data-testid="pulse-charts-era-note">
          {t.eraNote(eraLabel)}
        </p>
      )}
    </section>
  );
}

/**
 * The chart mounts only once its box first scrolls into view (the box keeps its fixed height in
 * the meantime, so nothing shifts) and animates only on that mount. Once the reveal ends, series
 * animation is switched off so a new exit horizon or language re-renders the bars in place; without
 * this, recharts replays the grow on every `data` identity change.
 */
function ChartCard({
  title,
  legend,
  testId,
  requiredClosings,
  requiredReservations,
  requiredProfit,
  reducedMotion,
  swatches,
  children,
}: {
  title: string;
  legend: string;
  testId: string;
  requiredClosings?: number | null;
  requiredReservations?: number | null;
  requiredProfit?: number | null;
  reducedMotion: boolean;
  swatches: { color: string; label: string; dashed?: boolean }[];
  children: (reveal: ChartReveal) => ReactNode;
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  const reveal = useChartReveal(reducedMotion);
  return (
    <div
      className="parchment-card min-w-0 overflow-hidden p-4"
      data-testid={testId}
      data-revealed={inView}
      data-animating={reveal.animate}
      data-required-closings={requiredClosings ?? ""}
      data-required-reservations={requiredReservations ?? ""}
      data-required-profit={requiredProfit ?? ""}
    >
      <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{title}</h2>
      <p className={cn("mt-1 text-[11px] text-muted-foreground")}>{legend}</p>
      <div ref={ref} className="mt-2 h-56 w-full sm:h-72">
        {inView && children(reveal)}
      </div>
      <ChartLegend aria={title} items={swatches} />
    </div>
  );
}

export default PulseCharts;
