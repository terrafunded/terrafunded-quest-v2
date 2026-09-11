import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { RotateCcw } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import { runOracle, type Future, type OracleParams } from "@/domain";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/realm/Stat";
import { ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { date, money, moneyCompact, number } from "@/lib/format";
import { cn } from "@/lib/utils";

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
      <PageHeader title="Oracle" subtitle="Three futures from the real 90-day averages, then your own: every slider starts at the trailing average and the exit date recomputes from today's net profit and inventory.">
        <Button variant="outline" size="sm" onClick={() => setParams(defaults)}>
          <RotateCcw /> Reset to real averages
        </Button>
      </PageHeader>
      <TableErrorsBanner errors={data.tableErrors} />

      <section className="mb-8 grid gap-3 lg:grid-cols-3" aria-label="Three futures" data-testid="futures">
        {data.realm.futures.all.map((f, i) => (
          <FutureCard key={f.id} f={f} index={i} onAdopt={() => setParams(f.params)} />
        ))}
      </section>

      <h2 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-gold">Your own future</h2>
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Goal reached"
          value={result.goalDate ? date(result.goalDate) : "Not within 10 years"}
          hint={result.goalDate ? (result.hitsDeadline ? `Before the ${deadlineLabel} deadline` : `After the ${deadlineLabel} deadline`) : "Raise pace or margin"}
          valueClassName={result.hitsDeadline ? "text-stage-closed" : "text-ember"}
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
                    <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(0, 7)} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickFormatter={(v: number) => moneyCompact(v)} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={56} domain={[0, (max: number) => Math.max(max, g.goal * 1.05)]} />
                <ChartTooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name: string) => [money(v), name]}
                  labelFormatter={(d) => date(String(d))}
                />
                <ReferenceLine y={g.goal} stroke="hsl(var(--gold))" strokeDasharray="4 4" label={{ value: "$10M", fill: "hsl(var(--gold))", fontSize: 11, position: "insideTopRight" }} />
                {series.some((p) => p.date >= g.deadline) && (
                  <ReferenceLine x={series.find((p) => p.date >= g.deadline)?.date} stroke="hsl(var(--sponsor))" strokeDasharray="4 4" label={{ value: "Deadline", fill: "hsl(var(--sponsor))", fontSize: 11, position: "insideTopLeft" }} />
                )}
                <Area type="monotone" dataKey="cumulativeNetProfit" name="Net profit" stroke="hsl(var(--gold))" fill="url(#oracle-fill)" strokeWidth={2} />
                <Area type="monotone" dataKey="cumulativeCash" name="Cash realized" stroke="hsl(var(--stage-closed))" fill="transparent" strokeWidth={1.5} strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Starts at {money(g.netProfitToDate)} net and {number(g.availableLots + g.reservedLots)} lots of inventory (available + reserved). Each closed lot books (price − land) × (1 − take); cash lands as{" "}
            {defaults.downPaymentPct}% down now and {defaults.noteSalePct}% of the balance {params.avgMonthsToSellNote} months later.
          </p>
        </div>
      </div>
    </div>
  );
}

function FutureCard({ f, index, onAdopt }: { f: Future; index: number; onAdopt: () => void }) {
  const tone = f.hitsDeadline ? "text-stage-closed" : f.exitDate ? "text-ember" : "text-muted-foreground";
  return (
    <article
      className={cn("parchment-card flex flex-col p-5", f.hitsDeadline && "border-stage-closed/40", index === 0 && "border-gold/30")}
      data-testid="future"
      data-future={f.id}
    >
      <div className="stat-label">{f.title}</div>
      <div className={cn("mt-2 font-display text-2xl leading-none sm:text-3xl", tone)} data-testid="future-exit">
        {f.exitDate ? date(f.exitDate) : "beyond 10 years"}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {f.exitDate ? (f.hitsDeadline ? `before the ${date(f.result.deadline)} deadline` : `after the ${date(f.result.deadline)} deadline`) : "the goal is not reached within the horizon"}
        {f.daysEarlierThanCurrent !== null && f.id !== "current_pace" && (
          <>
            {" · "}
            <span className={f.daysEarlierThanCurrent > 0 ? "text-stage-closed" : f.daysEarlierThanCurrent < 0 ? "text-ember" : ""}>
              {f.daysEarlierThanCurrent > 0 ? `${number(f.daysEarlierThanCurrent)} days earlier` : f.daysEarlierThanCurrent < 0 ? `${number(-f.daysEarlierThanCurrent)} days later` : "same day"}
            </span>
          </>
        )}
      </div>
      <p className="mt-3 flex-1 text-sm text-foreground/85">{f.premise}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Lots / month</dt>
        <dd className="text-right tabular">{f.params.lotsPerMonth}</dd>
        <dt className="text-muted-foreground">Farm every</dt>
        <dd className="text-right tabular">{f.params.newFarmEveryMonths} mo</dd>
        <dt className="text-muted-foreground">Inventory today</dt>
        <dd className="text-right tabular">{number(f.startInventory)} lots</dd>
        <dt className="text-muted-foreground">Net at deadline</dt>
        <dd className="text-right tabular">{moneyCompact(f.result.netProfitAtDeadline)}</dd>
      </dl>
      <Button variant="outline" size="sm" className="mt-4 self-start" onClick={onAdopt}>
        Load into the sliders
      </Button>
    </article>
  );
}
