import { motion } from "framer-motion";
import { Crown, Percent, Scale } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import type { InvestorSummary } from "@/domain";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { DEAL_LABEL, date, money, moneyExact, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Sponsors() {
  const { data, isLoading, error, refetch } = useRealm();
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const funded = data.realm.investors.filter((i) => i.farms.length > 0);
  const others = data.realm.investors.filter((i) => i.farms.length === 0);

  return (
    <div>
      <PageHeader title="Sponsors" subtitle="Who funded which farm, on what terms, and what they have been paid. Profit-share and fixed-interest are never blended." />
      <TableErrorsBanner errors={data.tableErrors} />
      {funded.length === 0 ? (
        <EmptyState title="No sponsors" body="No investor is attached to a subdivided farm." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {funded.map((inv, i) => (
            <SponsorCard key={inv.investorId} inv={inv} index={i} />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <p className="mt-6 text-xs text-muted-foreground">
          Also in the investors table with no farm capital: {others.map((o) => o.name).join(", ")}.
        </p>
      )}
    </div>
  );
}

function SponsorCard({ inv, index }: { inv: InvestorSummary; index: number }) {
  const isProfitShare = inv.dealType === "profit_share";
  const isFixed = inv.dealType === "fixed_interest";
  const Icon = isProfitShare ? Crown : isFixed ? Percent : Scale;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className={cn(
        "parchment-card p-5",
        isProfitShare && "border-gold/50 bg-gradient-to-br from-gold/10 via-card to-card shadow-[0_0_60px_-25px_hsl(var(--gold)/0.8)]",
      )}
      data-testid="sponsor-card"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", isProfitShare ? "bg-gold/20 text-gold" : "bg-secondary text-foreground")}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className={cn("font-heading text-lg", isProfitShare && "text-gold")}>{inv.name}</h2>
            <div className="text-xs text-muted-foreground">
              {inv.farms.map((f) => f.farmName).join(" · ")}
            </div>
          </div>
        </div>
        <Badge variant={isProfitShare ? "default" : "secondary"}>{DEAL_LABEL[inv.dealType] ?? inv.dealType}</Badge>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Figure label="Capital deployed" value={money(inv.capitalDeployed)} />
        <Figure label="Capital returned" value={money(inv.capitalReturned)} className="text-stage-closed" />
        <Figure label="Capital outstanding" value={money(inv.capitalOutstanding)} className={inv.capitalOutstanding > 0 ? "text-fuchsia-200" : "text-stage-closed"} />
        {isProfitShare ? (
          <>
            <Figure label="Profit share earned" value={money(inv.profitShareEarned)} hint="Share of realized gross on closed lots" className="text-gold" />
            <Figure label="Profit share paid" value={money(inv.profitSharePaid)} hint="kind = profit_share rows" />
            <Figure label="Unpaid share" value={money(inv.profitShareEarned - inv.profitSharePaid)} hint="Earned − paid" />
          </>
        ) : (
          <>
            <Figure label="Interest accrued" value={money(inv.interestAccrued)} hint="Daily on outstanding capital" className="text-stage-reserved" />
            <Figure label="Interest paid" value={money(inv.interestPaid)} hint="Non-capital distributions" />
            <Figure label="Unpaid interest" value={money(inv.interestAccrued - inv.interestPaid)} />
          </>
        )}
      </div>

      <table className="mt-4 w-full text-xs">
        <thead className="text-muted-foreground">
          <tr className="text-left">
            <th className="py-1 font-medium">Farm</th>
            <th className="py-1 text-right font-medium">Capital</th>
            <th className="py-1 text-right font-medium">Terms</th>
            <th className="py-1 text-right font-medium">Lots</th>
            <th className="py-1 text-right font-medium">{isProfitShare ? "Share earned" : "Accrued"}</th>
            <th className="py-1 text-right font-medium">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {inv.farms.map((f) => (
            <tr key={f.farmId} className="border-t border-border/50">
              <td className="py-1.5">
                {f.farmName}
                <span className="ml-1 text-muted-foreground">· {date(f.fundingDate)}</span>
              </td>
              <td className="py-1.5 text-right tabular">{money(f.capitalDeployed)}</td>
              <td className="py-1.5 text-right tabular">{f.dealType === "profit_share" ? pct(f.profitSharePct, 0) + " share" : f.dealType === "fixed_interest" ? pct(f.annualRatePct, 0) + " / yr" : "own"}</td>
              <td className="py-1.5 text-right tabular">
                {f.lotsSold}/{f.totalLots}
              </td>
              <td className="py-1.5 text-right tabular">{money(f.dealType === "profit_share" ? f.investorTakeEarned : f.interestAccrued)}</td>
              <td className="py-1.5 text-right tabular">{money(f.capitalOutstanding)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <details className="mt-4 text-sm" open={inv.distributions.length > 0 && inv.distributions.length <= 8}>
        <summary className="cursor-pointer text-xs uppercase tracking-wider text-muted-foreground">
          Distributions · {inv.distributions.length} · {money(inv.totalPaidOut)}
        </summary>
        {inv.distributions.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Nothing paid out yet.</p>
        ) : (
          <ol className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
            {[...inv.distributions].reverse().map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-3 border-t border-border/40 py-1.5 text-xs">
                <div className="min-w-0">
                  <span className="text-muted-foreground">{date(d.distribution_date)}</span>{" "}
                  <span className={cn("uppercase tracking-wider", d.kind === "capital_return" ? "text-stage-closed" : "text-gold")}>{d.kind?.replace("_", " ")}</span>
                  {d.notes && <div className="truncate text-muted-foreground">{d.notes}</div>}
                </div>
                <span className="tabular">{moneyExact(d.amount)}</span>
              </li>
            ))}
          </ol>
        )}
      </details>
    </motion.article>
  );
}

function Figure({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="stat-label">{label}</div>
      <div className={cn("mt-1 font-heading tabular", className)}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
