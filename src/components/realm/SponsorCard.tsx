import { motion } from "framer-motion";
import { Crown, Percent, Scale } from "lucide-react";
import type { InvestorFarmPosition, InvestorSummary } from "@/domain";
import { Badge } from "@/components/ui/badge";
import type { SponsorsUiStrings } from "@/i18n/sponsors";
import { money, moneyExact, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

function termsOf(f: InvestorFarmPosition, t: SponsorsUiStrings): string {
  return f.dealType === "profit_share" ? t.card.termsShare(pct(f.profitSharePct, 0)) : f.dealType === "fixed_interest" ? t.card.termsPerYear(pct(f.annualRatePct, 0)) : t.card.termsOwn;
}

/** `id` is the DOM anchor the capital donut scrolls to when its arc is clicked. */
export function SponsorCard({ inv, index, t, id, highlighted = false }: { inv: InvestorSummary; index: number; t: SponsorsUiStrings; id?: string; highlighted?: boolean }) {
  const isProfitShare = inv.dealType === "profit_share";
  const isFixed = inv.dealType === "fixed_interest";
  const Icon = isProfitShare ? Crown : isFixed ? Percent : Scale;
  const earnedLabel = isProfitShare ? t.card.shareEarned : t.card.accrued;
  const earnedOf = (f: InvestorFarmPosition) => money(f.dealType === "profit_share" ? f.investorTakeEarned : f.interestAccrued);

  return (
    <motion.article
      id={id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className={cn(
        "parchment-card flex h-full flex-col p-5 scroll-mt-20 transition-shadow duration-500",
        isProfitShare && "border-gold/50 bg-gradient-to-br from-gold/10 via-card to-card shadow-[0_0_60px_-25px_hsl(var(--gold)/0.8)]",
        highlighted && "ring-2 ring-gold ring-offset-2 ring-offset-background",
      )}
      data-testid="sponsor-card"
      data-investor-id={inv.investorId}
      data-capital-deployed={inv.capitalDeployed}
      data-highlighted={highlighted}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", isProfitShare ? "bg-gold/20 text-gold" : "bg-secondary text-foreground")}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className={cn("font-heading text-lg", isProfitShare && "text-gold")}>{inv.name}</h2>
            <div className="truncate text-xs text-muted-foreground">{inv.farms.map((f) => f.farmName).join(" · ")}</div>
          </div>
        </div>
        <Badge variant={isProfitShare ? "default" : "secondary"} className="shrink-0">
          {t.deal[inv.dealType] ?? inv.dealType}
        </Badge>
      </header>

      {/* Six tiles, 3×2 from `sm` up, equal heights whatever the value length. */}
      <div className="mt-4 grid auto-rows-fr grid-cols-2 gap-2 text-sm sm:grid-cols-3" data-testid="sponsor-figures">
        <Figure label={t.card.capitalDeployed} value={money(inv.capitalDeployed)} />
        <Figure label={t.card.capitalReturned} value={money(inv.capitalReturned)} className="text-stage-closed" />
        <Figure label={t.card.capitalOutstanding} value={money(inv.capitalOutstanding)} className={inv.capitalOutstanding > 0 ? "text-sponsor" : "text-stage-closed"} />
        {isProfitShare ? (
          <>
            <Figure label={t.card.profitShareEarned} value={money(inv.profitShareEarned)} hint={t.card.profitShareEarnedHint} className="text-gold" />
            <Figure label={t.card.profitSharePaid} value={money(inv.profitSharePaid)} hint={t.card.profitSharePaidHint} />
            <Figure label={t.card.unpaidShare} value={money(inv.profitShareEarned - inv.profitSharePaid)} hint={t.card.unpaidShareHint} />
          </>
        ) : (
          <>
            <Figure label={t.card.interestAccrued} value={money(inv.interestAccrued)} hint={t.card.interestAccruedHint} className="text-stage-reserved" />
            <Figure label={t.card.interestPaid} value={money(inv.interestPaid)} hint={t.card.interestPaidHint} />
            <Figure label={t.card.unpaidInterest} value={money(inv.interestAccrued - inv.interestPaid)} />
          </>
        )}
      </div>

      {/* Anchored to the bottom so the figures above line up across the row. */}
      <div className="mt-auto">
        {/* Phone: stacked farm cards. Desktop: compact table. */}
        <ul className="mt-4 space-y-2 sm:hidden" data-testid="sponsor-farms-cards">
          {inv.farms.map((f) => (
            <li key={f.farmId} className="rounded-md border border-border/50 bg-background/40 px-3 py-2.5">
              <div className="font-medium">
                {f.farmName}
                <span className="ml-1 text-muted-foreground">· {t.date(f.fundingDate)}</span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t.card.capital}</dt>
                  <dd className="tabular">{money(f.capitalDeployed)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t.card.terms}</dt>
                  <dd className="tabular">{termsOf(f, t)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t.card.lots}</dt>
                  <dd className="tabular">
                    {f.lotsSold}/{f.totalLots}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{earnedLabel}</dt>
                  <dd className="tabular">{earnedOf(f)}</dd>
                </div>
                <div className="col-span-2 flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t.card.outstanding}</dt>
                  <dd className="tabular">{money(f.capitalOutstanding)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <table className="mt-4 hidden w-full text-sm sm:table" data-testid="sponsor-farms-table">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-1 font-medium">{t.card.farm}</th>
              <th className="py-1 text-right font-medium">{t.card.capital}</th>
              <th className="py-1 text-right font-medium">{t.card.terms}</th>
              <th className="py-1 text-right font-medium">{t.card.lots}</th>
              <th className="py-1 text-right font-medium">{earnedLabel}</th>
              <th className="py-1 text-right font-medium">{t.card.outstanding}</th>
            </tr>
          </thead>
          <tbody>
            {inv.farms.map((f) => (
              <tr key={f.farmId} className="border-t border-border/50">
                <td className="py-1.5">
                  {f.farmName}
                  <span className="ml-1 text-muted-foreground">· {t.date(f.fundingDate)}</span>
                </td>
                <td className="py-1.5 text-right tabular">{money(f.capitalDeployed)}</td>
                <td className="py-1.5 text-right tabular">{termsOf(f, t)}</td>
                <td className="py-1.5 text-right tabular">
                  {f.lotsSold}/{f.totalLots}
                </td>
                <td className="py-1.5 text-right tabular">{earnedOf(f)}</td>
                <td className="py-1.5 text-right tabular">{money(f.capitalOutstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <details className="mt-4 text-sm" open={inv.distributions.length > 0 && inv.distributions.length <= 8}>
          <summary className="cursor-pointer text-xs uppercase tracking-wider text-muted-foreground">{t.card.distributions(inv.distributions.length, money(inv.totalPaidOut))}</summary>
          {inv.distributions.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">{t.card.nothingPaid}</p>
          ) : (
            <ol className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
              {[...inv.distributions].reverse().map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-3 border-t border-border/40 py-1.5 text-xs">
                  <div className="min-w-0">
                    <span className="text-muted-foreground">{t.date(d.distribution_date)}</span>{" "}
                    <span className={cn("uppercase tracking-wider", d.kind === "capital_return" ? "text-stage-closed" : "text-gold")}>
                      {(d.kind && t.card.distributionKind[d.kind]) ?? d.kind?.replace("_", " ")}
                    </span>
                    {d.notes && <div className="truncate text-muted-foreground">{d.notes}</div>}
                  </div>
                  <span className="tabular">{moneyExact(d.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </details>
      </div>
    </motion.article>
  );
}

function Figure({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-md bg-muted/40 p-3">
      <div className="stat-label">{label}</div>
      <div className={cn("mt-1 font-heading tabular", className)}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
