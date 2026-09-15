import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import type { EngineResult, EngineSensitivityCell, EngineTurnRow } from "@/domain/engine";
import type { EngineUiStrings } from "@/i18n/engine";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useTheme } from "@/theme/ThemeProvider";
import { date, money, moneyCompact, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartLegend } from "./ChartLegend";
import {
  AREA_FILL_OPACITY,
  CURSOR,
  DATA_AXIS,
  DATA_GOAL,
  DATA_INTEREST,
  DATA_INVENTORY,
  DATA_OWED,
  DATA_PROFIT_FRESH,
  DATA_PROFIT_INVENTORY,
  DATA_PROFIT_RECYCLED,
  DATA_STATUS_FAR,
  GRID_STROKE_OPACITY,
  SERIES_STROKE_WIDTH,
  TOOLTIP_CLASS,
  TOOLTIP_STYLE,
  useChartReveal,
} from "./chartTokens";

type Props = {
  result: EngineResult;
  t: EngineUiStrings;
  nextFarmFundByDate: string | null;
  onLoadSensitivity: (cell: EngineSensitivityCell) => void;
};

function ChartCard({
  testId,
  title,
  hint,
  children,
  className,
}: {
  testId: string;
  title: string;
  hint: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>(0.05);
  return (
    <div ref={ref} className={cn("parchment-card p-3 sm:p-4", className)} data-testid={testId}>
      <h3 className="font-heading text-lg text-foreground">{title}</h3>
      <p className="mb-3 text-sm text-muted-foreground">{hint}</p>
      {inView ? children : <div className="min-h-[14rem]" />}
    </div>
  );
}

export default function EngineChartsLoaded({ result, t, nextFarmFundByDate, onLoadSensitivity }: Props) {
  const reduceMotion = useReducedMotion() ?? false;
  const { d } = useTheme();
  const reveal = useChartReveal(reduceMotion);
  const duration = Math.min(900, d(700));

  return (
    <section className="space-y-4" aria-label={t.chartAria} data-testid="engine-charts">
      <TurnsTable result={result} t={t} nextFarmFundByDate={nextFarmFundByDate} />
      <ProfitStack result={result} t={t} reveal={reveal} duration={duration} />
      <InventoryChart result={result} t={t} reveal={reveal} duration={duration} />
      <CapitalChart result={result} t={t} reveal={reveal} duration={duration} />
      <SensitivityGrid result={result} t={t} onLoad={onLoadSensitivity} />
    </section>
  );
}

function farmDisplayName(row: EngineTurnRow, t: EngineUiStrings): string {
  return row.projectedIndex !== null ? t.projectedFarm(row.projectedIndex) : row.farmName;
}

function nextLabel(row: EngineTurnRow, t: EngineUiStrings): string {
  return row.next.type === "projected" ? t.projectedFarm(row.next.index) : t.returnsToSponsor;
}

function sourceLabel(row: EngineTurnRow, t: EngineUiStrings): string {
  if (row.isExisting) return t.sourceRecycled;
  if (row.fresh > 0.5 && row.recycled > 0.5) return t.sourceMixed;
  return row.fresh > row.recycled ? t.sourceFresh : t.sourceRecycled;
}

function lastExistingReturnIso(rows: EngineTurnRow[]): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    if (!row.isExisting || !row.returnIso) continue;
    if (!latest || row.returnIso > latest) latest = row.returnIso;
  }
  return latest;
}

function TurnsTable({
  result,
  t,
  nextFarmFundByDate,
}: {
  result: EngineResult;
  t: EngineUiStrings;
  nextFarmFundByDate: string | null;
}) {
  const rows = result.turnRows;
  const capitalBackBy = lastExistingReturnIso(rows);
  const fundBy = nextFarmFundByDate ? date(nextFarmFundByDate) : t.never;

  return (
    <ChartCard testId="engine-chart-turns" title={t.turnsChart} hint={t.turnsChartHint}>
      <p className="mb-3 text-sm text-foreground" data-testid="engine-turns-verdict">
        {t.turnsVerdict(capitalBackBy ? monthLabel(capitalBackBy) : t.never, fundBy)}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.turnsEmpty}</p>
      ) : (
        <div data-testid="engine-turns-table">
          <ul className="space-y-2 sm:hidden">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-md border border-border/60 p-3"
                data-existing={row.isExisting ? "true" : "false"}
              >
                <div className="font-heading text-foreground">{farmDisplayName(row, t)}</div>
                <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">{t.turnsColCapital}</dt>
                  <dd className="text-right font-numeric">{money(row.capital)}</dd>
                  <dt className="text-muted-foreground">{t.turnsColLots}</dt>
                  <dd className="text-right font-numeric">{row.lotsLeft}</dd>
                  <dt className="text-muted-foreground">{t.turnsColReturn}</dt>
                  <dd className="text-right">{row.returnIso ? monthLabel(row.returnIso) : t.never}</dd>
                  <dt className="text-muted-foreground">{t.turnsColNext}</dt>
                  <dd className="text-right">{nextLabel(row, t)}</dd>
                  <dt className="text-muted-foreground">{t.turnsColSource}</dt>
                  <dd className="text-right">{sourceLabel(row, t)}</dd>
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.turnsColFarm}</TableHead>
                  <TableHead>{t.turnsColCapital}</TableHead>
                  <TableHead>{t.turnsColLots}</TableHead>
                  <TableHead>{t.turnsColReturn}</TableHead>
                  <TableHead>{t.turnsColNext}</TableHead>
                  <TableHead>{t.turnsColSource}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} data-existing={row.isExisting ? "true" : "false"}>
                    <TableCell className="font-heading text-foreground">{farmDisplayName(row, t)}</TableCell>
                    <TableCell className="font-numeric">{money(row.capital)}</TableCell>
                    <TableCell className="font-numeric">{row.lotsLeft}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.returnIso ? monthLabel(row.returnIso) : t.never}</TableCell>
                    <TableCell>{nextLabel(row, t)}</TableCell>
                    <TableCell>{sourceLabel(row, t)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function ProfitStack({
  result,
  t,
  reveal,
  duration,
}: {
  result: EngineResult;
  t: EngineUiStrings;
  reveal: ReturnType<typeof useChartReveal>;
  duration: number;
}) {
  const data = useMemo(
    () =>
      result.series.map((s) => ({
        t: s.monthIndex,
        label: monthLabel(s.date),
        inventory: s.profitFromInventory,
        recycled: s.profitFromInventory + s.profitFromRecycled,
        fresh: s.cumulativeProfit,
        goal: result.goalLine.start + ((result.goalLine.goal - result.goalLine.start) * (s.monthIndex - 1)) / Math.max(1, result.series.length - 1),
      })),
    [result],
  );

  return (
    <ChartCard testId="engine-chart-profit" title={t.profitChart} hint={t.profitChartHint}>
      <div className="h-64 min-w-0 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={DATA_AXIS} strokeOpacity={GRID_STROKE_OPACITY} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: DATA_AXIS, fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tickFormatter={(v) => moneyCompact(Number(v))} tick={{ fill: DATA_AXIS, fontSize: 11 }} width={56} />
            <ChartTooltip
              cursor={CURSOR}
              contentStyle={TOOLTIP_STYLE}
              wrapperClassName={TOOLTIP_CLASS}
              formatter={(value: number, name: string) => [money(value), name]}
            />
            <Area
              type="monotone"
              dataKey="inventory"
              name={t.legendProfitInventory}
              stackId="1"
              stroke={DATA_PROFIT_INVENTORY}
              strokeWidth={SERIES_STROKE_WIDTH}
              fill={DATA_PROFIT_INVENTORY}
              fillOpacity={AREA_FILL_OPACITY}
              isAnimationActive={reveal.animate}
              animationDuration={duration}
            />
            <Area
              type="monotone"
              dataKey="recycled"
              name={t.legendProfitRecycled}
              stroke={DATA_PROFIT_RECYCLED}
              strokeWidth={SERIES_STROKE_WIDTH}
              fill={DATA_PROFIT_RECYCLED}
              fillOpacity={AREA_FILL_OPACITY}
              isAnimationActive={reveal.animate}
              animationDuration={duration}
            />
            <Area
              type="monotone"
              dataKey="fresh"
              name={t.legendProfitFresh}
              stroke={DATA_PROFIT_FRESH}
              strokeWidth={SERIES_STROKE_WIDTH}
              fill={DATA_PROFIT_FRESH}
              fillOpacity={AREA_FILL_OPACITY}
              isAnimationActive={reveal.animate}
              animationDuration={duration}
              onAnimationEnd={reveal.settle}
            />
            <Line type="monotone" dataKey="goal" name={t.legendGoal} stroke={DATA_GOAL} strokeWidth={SERIES_STROKE_WIDTH} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <ReferenceLine y={result.goal} stroke={DATA_GOAL} strokeWidth={SERIES_STROKE_WIDTH} strokeDasharray="4 4" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        aria={t.chartLegendAria}
        items={[
          { color: DATA_PROFIT_INVENTORY, label: t.legendProfitInventory },
          { color: DATA_PROFIT_RECYCLED, label: t.legendProfitRecycled },
          { color: DATA_PROFIT_FRESH, label: t.legendProfitFresh },
          { color: DATA_GOAL, label: t.legendGoal, dashed: true },
        ]}
      />
    </ChartCard>
  );
}

function InventoryChart({
  result,
  t,
  reveal,
  duration,
}: {
  result: EngineResult;
  t: EngineUiStrings;
  reveal: ReturnType<typeof useChartReveal>;
  duration: number;
}) {
  const data = result.series.map((s) => ({
    label: monthLabel(s.date),
    inventory: s.inventory,
    dry: s.inventoryDry ? s.inventory : null,
  }));

  return (
    <ChartCard testId="engine-chart-inventory" title={t.inventoryChart} hint={t.inventoryChartHint}>
      <div className="h-56 min-w-0 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={DATA_AXIS} strokeOpacity={GRID_STROKE_OPACITY} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: DATA_AXIS, fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fill: DATA_AXIS, fontSize: 11 }} width={40} />
            <ChartTooltip cursor={CURSOR} contentStyle={TOOLTIP_STYLE} wrapperClassName={TOOLTIP_CLASS} />
            <Area
              type="stepAfter"
              dataKey="inventory"
              name={t.legendLots}
              stroke={DATA_INVENTORY}
              strokeWidth={SERIES_STROKE_WIDTH}
              fill={DATA_INVENTORY}
              fillOpacity={AREA_FILL_OPACITY}
              isAnimationActive={reveal.animate}
              animationDuration={duration}
            />
            <Area
              type="stepAfter"
              dataKey="dry"
              name={t.legendDry}
              stroke={DATA_STATUS_FAR}
              strokeWidth={SERIES_STROKE_WIDTH}
              fill={DATA_STATUS_FAR}
              fillOpacity={AREA_FILL_OPACITY}
              isAnimationActive={false}
            />
            {result.inventoryDryMonths[0] !== undefined && (
              <ReferenceLine
                x={monthLabel(result.series.find((s) => s.monthIndex === result.inventoryDryMonths[0])?.date ?? "")}
                stroke={DATA_STATUS_FAR}
                strokeWidth={SERIES_STROKE_WIDTH}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        aria={t.chartLegendAria}
        items={[
          { color: DATA_INVENTORY, label: t.legendLots },
          { color: DATA_STATUS_FAR, label: t.legendDry },
        ]}
      />
    </ChartCard>
  );
}

function CapitalChart({
  result,
  t,
  reveal,
  duration,
}: {
  result: EngineResult;
  t: EngineUiStrings;
  reveal: ReturnType<typeof useChartReveal>;
  duration: number;
}) {
  const peak = result.figures.peakOutstanding;
  const data = result.series.map((s) => ({
    label: monthLabel(s.date),
    owed: s.capitalOwed,
    interest: s.cumulativeInterest,
    peak: s.capitalOwed >= peak - 0.5 && peak > 0 ? s.capitalOwed : null,
  }));

  return (
    <ChartCard testId="engine-chart-capital" title={t.capitalChart} hint={t.capitalChartHint}>
      <div className="h-56 min-w-0 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={DATA_AXIS} strokeOpacity={GRID_STROKE_OPACITY} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: DATA_AXIS, fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis yAxisId="l" tickFormatter={(v) => moneyCompact(Number(v))} tick={{ fill: DATA_AXIS, fontSize: 11 }} width={56} />
            <YAxis yAxisId="r" orientation="right" tickFormatter={(v) => moneyCompact(Number(v))} tick={{ fill: DATA_AXIS, fontSize: 11 }} width={48} />
            <ChartTooltip cursor={CURSOR} contentStyle={TOOLTIP_STYLE} wrapperClassName={TOOLTIP_CLASS} formatter={(v: number) => money(v)} />
            <Area
              yAxisId="l"
              type="monotone"
              dataKey="owed"
              name={t.legendOwed}
              stroke={DATA_OWED}
              strokeWidth={SERIES_STROKE_WIDTH}
              fill={DATA_OWED}
              fillOpacity={AREA_FILL_OPACITY}
              isAnimationActive={reveal.animate}
              animationDuration={duration}
            />
            <Line
              yAxisId="r"
              type="monotone"
              dataKey="interest"
              name={t.legendInterest}
              stroke={DATA_INTEREST}
              strokeWidth={SERIES_STROKE_WIDTH}
              dot={false}
              isAnimationActive={reveal.animate}
              animationDuration={duration}
              onAnimationEnd={reveal.settle}
            />
            {peak > 0 && (
              <ReferenceLine
                yAxisId="l"
                y={peak}
                stroke={DATA_GOAL}
                strokeWidth={SERIES_STROKE_WIDTH}
                strokeDasharray="4 4"
                label={{ value: `${t.legendPeak} ${moneyCompact(peak)}`, fill: DATA_GOAL, fontSize: 11 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        aria={t.chartLegendAria}
        items={[
          { color: DATA_OWED, label: t.legendOwed },
          { color: DATA_INTEREST, label: t.legendInterest },
          { color: DATA_GOAL, label: t.legendPeak, dashed: true },
        ]}
      />
    </ChartCard>
  );
}

function SensitivityGrid({
  result,
  t,
  onLoad,
}: {
  result: EngineResult;
  t: EngineUiStrings;
  onLoad: (cell: EngineSensitivityCell) => void;
}) {
  const [hover, setHover] = useState<EngineSensitivityCell | null>(null);
  const cells = result.sensitivity;
  const paces = [1, 1.5, 2];
  const cycles = [-60, 0, 60];
  const cellAt = (mult: number, offset: number) => cells.find((c) => c.paceMultiplier === mult && c.cycleOffsetDays === offset);

  const statusToken = (band: string) => {
    if (band === "met") return "var(--data-status-hit)";
    if (band === "close") return "var(--data-status-near)";
    return "var(--data-status-far)";
  };

  return (
    <ChartCard testId="engine-chart-sensitivity" title={t.sensitivity} hint={t.sensitivityHint}>
      <div className="overflow-x-auto">
        <div className="min-w-[22rem]">
          <div className="mb-1 grid grid-cols-[5rem_1fr_1fr_1fr] gap-1 text-center text-xs text-muted-foreground">
            <span />
            {paces.map((p) => (
              <span key={p}>
                {t.sensitivityPace} ×{p}
              </span>
            ))}
          </div>
          {cycles.map((offset) => (
            <div key={offset} className="mb-1 grid grid-cols-[5rem_1fr_1fr_1fr] gap-1">
              <div className="flex items-center text-xs text-muted-foreground">
                {t.sensitivityCycle} {offset > 0 ? `+${offset}d` : offset === 0 ? "base" : `${offset}d`}
              </div>
              {paces.map((mult) => {
                const cell = cellAt(mult, offset);
                if (!cell) return <div key={mult} className="min-h-11 rounded-md bg-muted/30" />;
                const token = statusToken(cell.band);
                return (
                  <button
                    key={mult}
                    type="button"
                    className="min-h-11 rounded-md px-1 py-2 text-center text-xs font-numeric transition-colors hover:ring-2 hover:ring-[hsl(var(--data-goal)/0.5)]"
                    style={{
                      background: `hsl(${token} / 0.22)`,
                      border: `1px solid hsl(${token})`,
                      color: `color-mix(in srgb, hsl(${token}) 58%, white)`,
                    }}
                    onMouseEnter={() => setHover(cell)}
                    onFocus={() => setHover(cell)}
                    onClick={() => onLoad(cell)}
                    data-testid={`engine-sensitivity-${mult}-${offset}`}
                    aria-label={cell.verdict}
                  >
                    {moneyCompact(cell.netProfitAtDeadline)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {hover && (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="engine-sensitivity-preview">
          {hover.verdict}
        </p>
      )}
    </ChartCard>
  );
}
