import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import type { MonthlyPoint } from "@/domain";
import { DAYS_PER_MONTH } from "@/config/goal";
import { useTheme } from "@/theme/ThemeProvider";
import { money, moneyCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRealmStrings, type RealmUiStrings } from "@/i18n/realm";

const EMBER = "hsl(var(--ember))";
const GREEN = "hsl(var(--stage-closed))";
const GOLD = "hsl(var(--gold))";
const MUTED = "hsl(var(--muted-foreground))";
const BORDER = "hsl(var(--border))";
const POPOVER = "hsl(var(--popover))";

/**
 * Hover cursor: recharts' default is an opaque #ccc rectangle over the hovered band, which reads
 * as a white slab on the dark skins. A 6% wash of the skin's own foreground marks the band on
 * all three (light on Iron Crown / Neon Kingdom, dark on Gilded Realm's parchment).
 */
const CURSOR = { fill: "hsl(var(--foreground))", opacity: 0.06 };

/**
 * Every bar gets its own tick. With `minTickGap` recharts dropped alternate months, so a bar in an
 * unlabelled month sat next to another month's label and was read as that month (an Apr 26 bar
 * beside the "Mar 26" tick looked like Mar 26 having profit while its tooltip said $0). Rotated
 * labels fit the narrowest band (12 months at 390px ≈ 23px) without overlapping.
 */
const X_TICK = { fill: MUTED, fontSize: 10 };
const X_AXIS_HEIGHT = 34;

const SM = "(min-width: 640px)";

function useWideViewport(): boolean {
  const [wide, setWide] = useState(() => (typeof window !== "undefined" ? window.matchMedia(SM).matches : true));
  useEffect(() => {
    const mq = window.matchMedia(SM);
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}

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
  const t = useRealmStrings().pulseCharts;
  const wide = useWideViewport();
  const points = useMemo(() => (wide ? history : history.slice(-12)), [history, wide]);
  const duration = Math.round(d(0.5) * 1000);
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
        >
          <ResponsiveContainer>
            <BarChart data={points} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={BORDER} vertical={false} />
              <XAxis dataKey="label" interval={0} angle={-45} textAnchor="end" height={X_AXIS_HEIGHT} tick={X_TICK} tickLine={false} axisLine={false} />
              <YAxis
                allowDecimals={false}
                domain={[0, (max: number) => Math.max(max, requiredClosings ?? 0, requiredReservations ?? 0, 1)]}
                tick={{ fill: MUTED, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <ChartTooltip content={<PaceTooltip t={t} />} cursor={CURSOR} />
              {requiredReservations !== null && (
                <ReferenceLine
                  y={requiredReservations}
                  stroke={EMBER}
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                  label={{ value: t.required, fill: EMBER, fontSize: 11, position: "insideTopLeft" }}
                />
              )}
              {requiredClosings !== null && (
                <ReferenceLine
                  y={requiredClosings}
                  stroke={GREEN}
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                  label={{ value: t.required, fill: GREEN, fontSize: 11, position: "insideTopRight" }}
                />
              )}
              <Bar dataKey="reservations" name={t.reservations} fill={EMBER} radius={[3, 3, 0, 0]} isAnimationActive={!reducedMotion} animationDuration={duration}>
                {points.map((p) => (
                  <Cell key={`r-${p.month}`} fill={EMBER} fillOpacity={fillOpacity(p)} />
                ))}
              </Bar>
              <Bar dataKey="closings" name={t.closings} fill={GREEN} radius={[3, 3, 0, 0]} isAnimationActive={!reducedMotion} animationDuration={duration}>
                {points.map((p) => (
                  <Cell key={`c-${p.month}`} fill={GREEN} fillOpacity={fillOpacity(p)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={t.profitTitle}
          legend={t.profitLegend}
          testId="pulse-chart-profit"
          requiredProfit={requiredProfit}
        >
          <ResponsiveContainer>
            <BarChart data={points} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={BORDER} vertical={false} />
              <XAxis dataKey="label" interval={0} angle={-45} textAnchor="end" height={X_AXIS_HEIGHT} tick={X_TICK} tickLine={false} axisLine={false} />
              <YAxis
                domain={[0, (max: number) => Math.max(max, requiredProfit ?? 0, 1)]}
                tickFormatter={(v: number) => moneyCompact(v)}
                tick={{ fill: MUTED, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <ChartTooltip content={<ProfitTooltip t={t} />} cursor={CURSOR} />
              {requiredProfit !== null && (
                <ReferenceLine
                  y={requiredProfit}
                  stroke={GOLD}
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                  label={{ value: t.required, fill: GOLD, fontSize: 11, position: "insideTopRight" }}
                />
              )}
              <Bar dataKey="netProfit" name={t.netProfit} fill={GOLD} radius={[3, 3, 0, 0]} isAnimationActive={!reducedMotion} animationDuration={duration}>
                {points.map((p) => (
                  <Cell key={`p-${p.month}`} fill={GOLD} fillOpacity={fillOpacity(p)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
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

function ChartCard({
  title,
  legend,
  testId,
  requiredClosings,
  requiredReservations,
  requiredProfit,
  children,
}: {
  title: string;
  legend: string;
  testId: string;
  requiredClosings?: number | null;
  requiredReservations?: number | null;
  requiredProfit?: number | null;
  children: ReactNode;
}) {
  return (
    <div
      className="parchment-card min-w-0 overflow-hidden p-4"
      data-testid={testId}
      data-required-closings={requiredClosings ?? ""}
      data-required-reservations={requiredReservations ?? ""}
      data-required-profit={requiredProfit ?? ""}
    >
      <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{title}</h2>
      <p className={cn("mt-1 text-[11px] text-muted-foreground")}>{legend}</p>
      <div className="mt-2 h-56 w-full sm:h-72">{children}</div>
    </div>
  );
}
