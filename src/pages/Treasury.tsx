import { Bar, BarChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis, ComposedChart } from "recharts";
import { useRealm } from "@/data/useRealm";
import { Stat } from "@/components/realm/Stat";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { money, moneyCompact, moneyExact, monthLabel } from "@/lib/format";

const GOLD = "hsl(43 70% 55%)";
const GREEN = "hsl(152 55% 45%)";
const PINK = "hsl(320 60% 62%)";
const VIOLET = "hsl(268 55% 60%)";

export default function Treasury() {
  const { data, isLoading, error, refetch } = useRealm();
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const t = data.realm.treasury;
  const rows = t.months.map((m) => ({ ...m, label: monthLabel(m.month), cashOutNeg: -m.cashOut }));

  return (
    <div>
      <PageHeader title="Treasury" subtitle="Real cash only. In: down payments at closing (full price on cash deals) and note sales. Out: every investor distribution. Monthly buyer collections are out of scope." />
      <TableErrorsBanner errors={data.tableErrors} />

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cash in" value={money(t.totalCashIn)} hint={`Down payments ${moneyCompact(t.totalDownPayments)} · notes ${moneyCompact(t.totalAllNoteSales)}`} valueClassName="text-stage-closed" data-testid="treasury-cash-in" />
        <Stat label="Cash out to sponsors" value={money(t.totalCashOut)} hint={`Capital ${moneyCompact(t.totalCapitalReturns)} · profit share ${moneyCompact(t.totalProfitShares)}`} valueClassName="text-fuchsia-200" data-testid="treasury-cash-out" />
        <Stat label="Net cash" value={money(t.net)} valueClassName={t.net >= 0 ? "text-gold" : "text-red-300"} />
        <Stat label="Note sales, all" value={money(t.totalAllNoteSales)} hint={t.totalOtherNoteSales > 0 ? `${moneyCompact(t.totalOtherNoteSales)} on notes outside the farms` : "all on farm lots"} />
      </section>

      {rows.length === 0 ? (
        <EmptyState title="No cash movements yet" />
      ) : (
        <>
          <div className="parchment-card mb-6 p-4">
            <h2 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-gold">Monthly cash in vs. out</h2>
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} stackOffset="sign">
                  <CartesianGrid stroke="hsl(250 16% 18%)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "hsl(40 12% 62%)", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v: number) => moneyCompact(v)} tick={{ fill: "hsl(40 12% 62%)", fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                  <ChartTooltip
                    contentStyle={{ background: "hsl(250 22% 9%)", border: "1px solid hsl(250 16% 18%)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [moneyExact(Math.abs(v)), name]}
                    labelStyle={{ color: GOLD }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="downPayments" name="Down payments" stackId="in" fill={GREEN} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="noteSales" name="Note sales" stackId="in" fill={GOLD} />
                  <Bar dataKey="otherNoteSales" name="Other notes" stackId="in" fill="hsl(43 40% 40%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cashOutNeg" name="To sponsors" stackId="out" fill={PINK} radius={[0, 0, 4, 4]} />
                  <Line type="monotone" dataKey="cumulativeNet" name="Cumulative net" stroke={VIOLET} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="parchment-card mb-6 p-4">
            <h2 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-gold">Cumulative</h2>
            <div className="h-56 w-full">
              <ResponsiveContainer>
                <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(250 16% 18%)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "hsl(40 12% 62%)", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v: number) => moneyCompact(v)} tick={{ fill: "hsl(40 12% 62%)", fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                  <ChartTooltip
                    contentStyle={{ background: "hsl(250 22% 9%)", border: "1px solid hsl(250 16% 18%)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [moneyExact(v), name]}
                    labelStyle={{ color: GOLD }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="cumulativeCashIn" name="Cumulative in" fill={GREEN} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cumulativeCashOut" name="Cumulative out" fill={PINK} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="parchment-card overflow-hidden">
            <Table className="min-w-[760px]" data-testid="treasury-table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Down payments</TableHead>
                  <TableHead className="text-right">Note sales</TableHead>
                  <TableHead className="text-right">Other notes</TableHead>
                  <TableHead className="text-right">Cash in</TableHead>
                  <TableHead className="text-right">Capital returned</TableHead>
                  <TableHead className="text-right">Profit shared</TableHead>
                  <TableHead className="text-right">Cash out</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Cumulative</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...rows].reverse().map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">{m.label}</TableCell>
                    <TableCell className="text-right tabular">{moneyExact(m.downPayments)}</TableCell>
                    <TableCell className="text-right tabular">{moneyExact(m.noteSales)}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{m.otherNoteSales ? moneyExact(m.otherNoteSales) : "—"}</TableCell>
                    <TableCell className="text-right tabular text-stage-closed">{moneyExact(m.cashIn)}</TableCell>
                    <TableCell className="text-right tabular">{moneyExact(m.capitalReturns)}</TableCell>
                    <TableCell className="text-right tabular">{moneyExact(m.profitShares)}</TableCell>
                    <TableCell className="text-right tabular text-fuchsia-200">{moneyExact(m.cashOut)}</TableCell>
                    <TableCell className={`text-right tabular ${m.net < 0 ? "text-red-300" : ""}`}>{moneyExact(m.net)}</TableCell>
                    <TableCell className="text-right tabular">{moneyExact(m.cumulativeNet)}</TableCell>
                  </TableRow>
                ))}
                {t.undatedCashIn > 0 && (
                  <TableRow className="text-muted-foreground">
                    <TableCell className="italic">Undated closings</TableCell>
                    <TableCell className="text-right tabular">{moneyExact(t.undatedCashIn)}</TableCell>
                    <TableCell colSpan={8} className="text-xs">
                      Completed file cases with no closing_date (see Data Quality). Counted in totals, not in any month.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-heading">Totals</TableCell>
                  <TableCell className="text-right tabular">{moneyExact(t.totalDownPayments)}</TableCell>
                  <TableCell className="text-right tabular">{moneyExact(t.totalNoteSales)}</TableCell>
                  <TableCell className="text-right tabular">{moneyExact(t.totalOtherNoteSales)}</TableCell>
                  <TableCell className="text-right tabular text-stage-closed">{moneyExact(t.totalCashIn)}</TableCell>
                  <TableCell className="text-right tabular">{moneyExact(t.totalCapitalReturns)}</TableCell>
                  <TableCell className="text-right tabular">{moneyExact(t.totalProfitShares)}</TableCell>
                  <TableCell className="text-right tabular text-fuchsia-200">{moneyExact(t.totalCashOut)}</TableCell>
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
