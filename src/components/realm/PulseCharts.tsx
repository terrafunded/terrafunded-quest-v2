import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import type { MonthlyPoint } from "@/domain";
import { DAYS_PER_MONTH } from "@/config/goal";
import { useTheme } from "@/theme/ThemeProvider";
import { money, moneyCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

const EMBER = "hsl(var(--ember))";
const GREEN = "hsl(var(--stage-closed))";
const GOLD = "hsl(var(--gold))";
const MUTED = "hsl(var(--muted-foreground))";
const BORDER = "hsl(var(--border))";
const POPOVER = "hsl(var(--popover))";

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

function PaceTooltip({ active, payload }: { active?: boolean; payload?: { payload: MonthlyPoint }[] }) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border px-3 py-2 text-xs shadow-md" style={{ background: POPOVER, borderColor: BORDER }}>
      <div className="font-heading text-gold">
        {p.label}
        {p.partial ? " · month in progress" : ""}
      </div>
      <div className="mt-1 tabular">Reservations {p.reservations}</div>
      <div className="tabular">Closings {p.closings}</div>
    </div>
  );
}

function ProfitTooltip({ active, payload }: { active?: boolean; payload?: { payload: MonthlyPoint }[] }) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border px-3 py-2 text-xs shadow-md" style={{ background: POPOVER, borderColor: BORDER }}>
      <div className="font-heading text-gold">
        {p.label}
        {p.partial ? " · month in progress" : ""}
      </div>
      <div className="mt-1 tabular">{money(p.netProfit)}</div>
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
  const wide = useWideViewport();
  const points = useMemo(() => (wide ? history : history.slice(-12)), [history, wide]);
  const duration = Math.round(d(0.5) * 1000);
  const requiredProfit = requiredProfitPerDay === null ? null : requiredProfitPerDay * DAYS_PER_MONTH;
  const hasBeforeEra = points.some((p) => p.beforeEra);

  if (points.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="The Pulse charts" data-testid="pulse-charts">
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <ChartCard
          title="Reservations lead, closings pay"
          legend="Reservations · Closings · required"
          testId="pulse-chart-pace"
          requiredClosings={requiredClosings}
          requiredReservations={requiredReservations}
        >
          <ResponsiveContainer>
            <BarChart data={points} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={BORDER} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={12} />
              <YAxis
                allowDecimals={false}
                domain={[0, (max: number) => Math.max(max, requiredClosings ?? 0, requiredReservations ?? 0, 1)]}
                tick={{ fill: MUTED, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <ChartTooltip content={<PaceTooltip />} />
              {requiredReservations !== null && (
                <ReferenceLine
                  y={requiredReservations}
                  stroke={EMBER}
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                  label={{ value: "required", fill: EMBER, fontSize: 11, position: "insideTopLeft" }}
                />
              )}
              {requiredClosings !== null && (
                <ReferenceLine
                  y={requiredClosings}
                  stroke={GREEN}
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                  label={{ value: "required", fill: GREEN, fontSize: 11, position: "insideTopRight" }}
                />
              )}
              <Bar dataKey="reservations" name="Reservations" fill={EMBER} radius={[3, 3, 0, 0]} isAnimationActive={!reducedMotion} animationDuration={duration}>
                {points.map((p) => (
                  <Cell key={`r-${p.month}`} fill={EMBER} fillOpacity={fillOpacity(p)} />
                ))}
              </Bar>
              <Bar dataKey="closings" name="Closings" fill={GREEN} radius={[3, 3, 0, 0]} isAnimationActive={!reducedMotion} animationDuration={duration}>
                {points.map((p) => (
                  <Cell key={`c-${p.month}`} fill={GREEN} fillOpacity={fillOpacity(p)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Net profit per month"
          legend="Net profit · required"
          testId="pulse-chart-profit"
          requiredProfit={requiredProfit}
        >
          <ResponsiveContainer>
            <BarChart data={points} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={BORDER} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={12} />
              <YAxis
                domain={[0, (max: number) => Math.max(max, requiredProfit ?? 0, 1)]}
                tickFormatter={(v: number) => moneyCompact(v)}
                tick={{ fill: MUTED, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <ChartTooltip content={<ProfitTooltip />} />
              {requiredProfit !== null && (
                <ReferenceLine
                  y={requiredProfit}
                  stroke={GOLD}
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                  label={{ value: "required", fill: GOLD, fontSize: 11, position: "insideTopRight" }}
                />
              )}
              <Bar dataKey="netProfit" name="Net profit" fill={GOLD} radius={[3, 3, 0, 0]} isAnimationActive={!reducedMotion} animationDuration={duration}>
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
          Fainter bars are months that ended before sales operations started in earnest in {eraLabel}.
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
