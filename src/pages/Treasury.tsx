import { Bar, BarChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis, ComposedChart } from "recharts";
import { useRealm } from "@/data/useRealm";
import { Stat } from "@/components/realm/Stat";
import { NoteStrategiesSection } from "@/components/realm/NoteStrategiesSection";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { useTreasuryStrings } from "@/i18n/treasury";
import { money, moneyCompact, moneyExact, monthLabel } from "@/lib/format";
import {
  DATA_AXIS,
  DATA_CAT,
  DATA_GOAL,
  DATA_OWED,
  DATA_PROFIT_FRESH,
  DATA_PROFIT_INVENTORY,
  DATA_PROFIT_RECYCLED,
  GRID_STROKE_OPACITY,
  SERIES_STROKE_WIDTH,
  TOOLTIP_STYLE,
} from "@/components/realm/chartTokens";

export default function Treasury() {
  const { data, isLoading, error, refetch } = useRealm();
  const tUi = useTreasuryStrings();
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const t = data.realm.treasury;
  const rows = t.months.map((m) => ({ ...m, label: monthLabel(m.month), cashOutNeg: -m.cashOut }));
  const s = tUi.series;

  return (
    <div>
      <PageHeader title={tUi.title} subtitle={tUi.subtitle} />
      <TableErrorsBanner errors={data.tableErrors} />

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={tUi.cashIn}
          value={money(t.totalCashIn)}
          hint={
            t.totalOtherNoteSales > 0 ? (
              <span data-testid="treasury-cash-reconcile">
                {tUi.cashInHintReconcile(money(data.realm.goal.cashRealized), money(t.totalOtherNoteSales), money(t.totalCashIn), moneyCompact(t.totalOtherNoteSales))}
              </span>
            ) : (
              tUi.cashInHintFarm(moneyCompact(t.totalDownPayments), moneyCompact(t.totalNoteSales))
            )
          }
          valueClassName="text-stage-closed"
          data-testid="treasury-cash-in"
        />
        <Stat label={tUi.cashOut} value={money(t.totalCashOut)} hint={tUi.cashOutHint(moneyCompact(t.totalCapitalReturns), moneyCompact(t.totalProfitShares))} valueClassName="text-sponsor" data-testid="treasury-cash-out" />
        <Stat label={tUi.netCash} value={money(t.net)} valueClassName={t.net >= 0 ? "text-gold" : "text-ember"} />
        <Stat
          label={tUi.noteSalesAll}
          value={money(t.totalAllNoteSales)}
          hint={
            t.totalOtherNoteSales > 0
              ? tUi.noteSalesHintOther(moneyCompact(t.totalNoteSales), moneyCompact(t.totalOtherNoteSales))
              : tUi.noteSalesHintAllFarm
          }
        />
      </section>

      <NoteStrategiesSection strategies={data.realm.noteStrategies} />

      {rows.length === 0 ? (
        <EmptyState title={tUi.empty} />
      ) : (
        <>
          <div className="parchment-card mb-6 p-4">
            <h2 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-gold">{tUi.monthlyChart}</h2>
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} stackOffset="sign">
                  <CartesianGrid stroke={DATA_AXIS} strokeOpacity={GRID_STROKE_OPACITY} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: DATA_AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v: number) => moneyCompact(v)} tick={{ fill: DATA_AXIS, fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                  <ChartTooltip
                    contentStyle={{ ...TOOLTIP_STYLE, borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [moneyExact(Math.abs(v)), name]}
                    labelStyle={{ color: DATA_GOAL }}
                  />
                  <Legend wrapperStyle={{ fontSize: 15 }} />
                  <Bar dataKey="downPayments" name={s.downPayments} stackId="in" fill={DATA_PROFIT_INVENTORY} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="noteSales" name={s.noteSales} stackId="in" fill={DATA_PROFIT_RECYCLED} />
                  <Bar dataKey="otherNoteSales" name={s.otherNotes} stackId="in" fill={DATA_CAT[3]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cashOutNeg" name={s.toSponsors} stackId="out" fill={DATA_OWED} radius={[0, 0, 4, 4]} />
                  <Line type="monotone" dataKey="cumulativeNet" name={s.cumulativeNet} stroke={DATA_PROFIT_FRESH} strokeWidth={SERIES_STROKE_WIDTH} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="parchment-card mb-6 p-4">
            <h2 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-gold">{tUi.cumulativeChart}</h2>
            <div className="h-56 w-full">
              <ResponsiveContainer>
                <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={DATA_AXIS} strokeOpacity={GRID_STROKE_OPACITY} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: DATA_AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v: number) => moneyCompact(v)} tick={{ fill: DATA_AXIS, fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                  <ChartTooltip
                    contentStyle={{ ...TOOLTIP_STYLE, borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [moneyExact(v), name]}
                    labelStyle={{ color: DATA_GOAL }}
                  />
                  <Legend wrapperStyle={{ fontSize: 15 }} />
                  <Bar dataKey="cumulativeCashIn" name={s.cumulativeIn} fill={DATA_PROFIT_INVENTORY} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cumulativeCashOut" name={s.cumulativeOut} fill={DATA_OWED} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="parchment-card overflow-hidden">
            <Table className="min-w-[760px] max-sm:min-w-0" data-mobile="cards" data-testid="treasury-table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{tUi.col.month}</TableHead>
                  <TableHead className="text-right">{tUi.col.downPayments}</TableHead>
                  <TableHead className="text-right">{tUi.col.noteSales}</TableHead>
                  <TableHead className="text-right">{tUi.col.otherNotes}</TableHead>
                  <TableHead className="text-right">{tUi.col.cashIn}</TableHead>
                  <TableHead className="text-right">{tUi.col.capitalReturned}</TableHead>
                  <TableHead className="text-right">{tUi.col.profitShared}</TableHead>
                  <TableHead className="text-right">{tUi.col.cashOut}</TableHead>
                  <TableHead className="text-right">{tUi.col.net}</TableHead>
                  <TableHead className="text-right">{tUi.col.cumulative}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...rows].reverse().map((m) => (
                  <TableRow key={m.month}>
                    <TableCell data-label={tUi.col.month} className="font-medium">{m.label}</TableCell>
                    <TableCell data-label={tUi.col.downPayments} className="text-right tabular">{moneyExact(m.downPayments)}</TableCell>
                    <TableCell data-label={tUi.col.noteSales} className="text-right tabular">{moneyExact(m.noteSales)}</TableCell>
                    <TableCell data-label={tUi.col.otherNotes} className="text-right tabular text-muted-foreground">{m.otherNoteSales ? moneyExact(m.otherNoteSales) : "—"}</TableCell>
                    <TableCell data-label={tUi.col.cashIn} className="text-right tabular text-stage-closed">{moneyExact(m.cashIn)}</TableCell>
                    <TableCell data-label={tUi.col.capitalReturned} className="text-right tabular">{moneyExact(m.capitalReturns)}</TableCell>
                    <TableCell data-label={tUi.col.profitShared} className="text-right tabular">{moneyExact(m.profitShares)}</TableCell>
                    <TableCell data-label={tUi.col.cashOut} className="text-right tabular text-sponsor">{moneyExact(m.cashOut)}</TableCell>
                    <TableCell data-label={tUi.col.net} className={`text-right tabular ${m.net < 0 ? "text-ember" : ""}`}>{moneyExact(m.net)}</TableCell>
                    <TableCell data-label={tUi.col.cumulative} className="text-right tabular">{moneyExact(m.cumulativeNet)}</TableCell>
                  </TableRow>
                ))}
                {t.undatedCashIn > 0 && (
                  <TableRow className="text-muted-foreground">
                    <TableCell className="italic">{tUi.undated}</TableCell>
                    <TableCell className="text-right tabular">{moneyExact(t.undatedCashIn)}</TableCell>
                    <TableCell colSpan={8} className="text-sm">
                      {tUi.undatedHint}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-heading">{tUi.totals}</TableCell>
                  <TableCell className="text-right tabular">{moneyExact(t.totalDownPayments)}</TableCell>
                  <TableCell className="text-right tabular">{moneyExact(t.totalNoteSales)}</TableCell>
                  <TableCell className="text-right tabular">{moneyExact(t.totalOtherNoteSales)}</TableCell>
                  <TableCell className="text-right tabular text-stage-closed">{moneyExact(t.totalCashIn)}</TableCell>
                  <TableCell className="text-right tabular">{moneyExact(t.totalCapitalReturns)}</TableCell>
                  <TableCell className="text-right tabular">{moneyExact(t.totalProfitShares)}</TableCell>
                  <TableCell className="text-right tabular text-sponsor">{moneyExact(t.totalCashOut)}</TableCell>
                  <TableCell className="text-right tabular">{moneyExact(t.net)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
