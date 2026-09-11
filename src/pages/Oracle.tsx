import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { RotateCcw } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import { runOracle, type OracleParams } from "@/domain";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/realm/Stat";
import { ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { date, money, moneyCompact, number } from "@/lib/format";

interface SliderDef {
  key: keyof OracleParams;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  hint: string;
}

const SLIDERS: SliderDef[] = [
  { key: "lotsPerMonth", label: "Lots closed per month", min: 0, max: 20, step: 0.5, format: (v) => `${v}`, hint: "Trailing 90-day pace" },
  { key: "avgSalePrice", label: "Average sale price", min: 60_000, max: 250_000, step: 1_000, format: money, hint: "Mean price of closed lots" },
  { key: "avgLandCost", label: "Average land cost per lot", min: 10_000, max: 120_000, step: 500, format: money, hint: "Capital ÷ lots on closed lots" },
  { key: "avgMonthsToSellNote", label: "Months to sell a note", min: 0, max: 12, step: 0.5, format: (v) => `${v} mo`, hint: "Closing → note sale" },
  { key: "newFarmEveryMonths", label: "New farm every N months", min: 0, max: 12, step: 0.25, format: (v) => (v === 0 ? "never" : `${v} mo`), hint: "Mean gap between fundings" },
  { key: "avgLotsPerFarm", label: "Lots per new farm", min: 4, max: 40, step: 1, format: (v) => `${v}`, hint: "Mean total_lots" },
  { key: "investorTakePct", label: "Investor take (% of gross)", min: 0, max: 60, step: 1, format: (v) => `${v}%`, hint: "Blended, from closed lots" },
];

export default function Oracle() {
  const { data, isLoading, error, refetch } = useRealm();
  const defaults = data?.realm.oracleDefaults;
  const [params, setParams] = useState<OracleParams | null>(null);

  useEffect(() => {
    if (defaults && !params) setParams(defaults);
  }, [defaults, params]);

  const result = useMemo(() => {
    if (!data || !params) return null;
    const g = data.realm.goal;
    return runOracle(params, g, g.availableLots + g.reservedLots, data.realm.asOf);
  }, [data, params]);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || !params || !result || !defaults) return null;

  const g = data.realm.goal;
  const series = result.series.filter((p) => p.monthIndex <= Math.max(24, (result.monthsToGoal ?? 0) + 3));
  const deadlineLabel = date(g.deadline);

  return (
    <div>
      <PageHeader title="Oracle" subtitle="What if? Every slider starts at the real trailing average. Drag, and the goal date recomputes from today's net profit and inventory.">
        <Button variant="outline" size="sm" onClick={() => setParams(defaults)}>
          <RotateCcw /> Reset to real averages
        </Button>
      </PageHeader>
      <TableErrorsBanner errors={data.tableErrors} />

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Goal reached"
          value={result.goalDate ? date(result.goalDate) : "Not within 10 years"}
          hint={result.goalDate ? (result.hitsDeadline ? `Before the ${deadlineLabel} deadline` : `After the ${deadlineLabel} deadline`) : "Raise pace or margin"}
          valueClassName={result.hitsDeadline ? "text-stage-closed" : "text-red-300"}
          data-testid="oracle-goal-date"
        />
        <Stat label="Months to goal" value={result.monthsToGoal === null ? "—" : `${result.monthsToGoal}`} hint={`${number(g.monthsToDeadline)} months left`} />
        <Stat label="Net profit per lot" value={money(result.netProfitPerLot)} hint={`${result.lotsNeeded ?? "—"} lots still needed`} />
        <Stat label="Net at deadline" value={money(result.netProfitAtDeadline)} hint={`${result.farmsBought} farms bought along the way`} valueClassName="text-gold" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="parchment-card space-y-5 p-5">
          {SLIDERS.map((s) => (
            <div key={s.key}>
              <div className="flex items-baseline justify-between gap-3">
                <label className="text-sm" htmlFor={`slider-${s.key}`}>
                  {s.label}
                </label>
                <span className="font-heading tabular text-gold">{s.format(params[s.key])}</span>
              </div>
              <Slider
                id={`slider-${s.key}`}
                min={s.min}
                max={s.max}
                step={s.step}
                value={[params[s.key]]}
                onValueChange={([v]) => v !== undefined && setParams({ ...params, [s.key]: v })}
                aria-label={s.label}
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{s.hint}</span>
                <span>real: {s.format(defaults[s.key])}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="parchment-card p-4">
          <h2 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-gold">Projected net profit</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="oracle-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(43 70% 55%)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(43 70% 55%)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(250 16% 18%)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(0, 7)} tick={{ fill: "hsl(40 12% 62%)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickFormatter={(v: number) => moneyCompact(v)} tick={{ fill: "hsl(40 12% 62%)", fontSize: 11 }} tickLine={false} axisLine={false} width={56} domain={[0, (max: number) => Math.max(max, g.goal * 1.05)]} />
                <ChartTooltip
                  contentStyle={{ background: "hsl(250 22% 9%)", border: "1px solid hsl(250 16% 18%)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name: string) => [money(v), name]}
                  labelFormatter={(d) => date(String(d))}
                />
                <ReferenceLine y={g.goal} stroke="hsl(43 70% 55%)" strokeDasharray="4 4" label={{ value: "$10M", fill: "hsl(43 70% 55%)", fontSize: 11, position: "insideTopRight" }} />
                {series.some((p) => p.date >= g.deadline) && (
                  <ReferenceLine x={series.find((p) => p.date >= g.deadline)?.date} stroke="hsl(320 60% 62%)" strokeDasharray="4 4" label={{ value: "Deadline", fill: "hsl(320 60% 62%)", fontSize: 11, position: "insideTopLeft" }} />
                )}
                <Area type="monotone" dataKey="cumulativeNetProfit" name="Net profit" stroke="hsl(43 70% 55%)" fill="url(#oracle-fill)" strokeWidth={2} />
                <Area type="monotone" dataKey="cumulativeCash" name="Cash realized" stroke="hsl(152 55% 45%)" fill="transparent" strokeWidth={1.5} strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Starts at {money(g.netProfitToDate)} net and {number(g.availableLots + g.reservedLots)} lots of inventory (available + reserved). Each closed lot books (price − land) × (1 − take); cash lands as{" "}
            {defaults.downPaymentPct}% down now and {defaults.noteSalePct}% of the balance {params.avgMonthsToSellNote} months later.
          </p>
        </div>
      </div>
    </div>
  );
}
