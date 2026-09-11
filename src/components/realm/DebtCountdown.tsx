import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Hourglass, Skull, Swords } from "lucide-react";
import type { Debt } from "@/domain";
import { AnimatedCounter } from "./AnimatedCounter";
import { date, money, number } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * THE DEBT — capital still owed to sponsors, days left, and the net profit the realm must earn
 * every single day from today. All three come from `realm.debt`; the per-day figure changes
 * daily because it is remaining ÷ daysLeft as of `asOf`.
 */
export function DebtCountdown({ debt, className }: { debt: Debt; className?: string }) {
  const behind = debt.actualNetProfitPerDay !== null && debt.requiredNetProfitPerDay !== null && debt.actualNetProfitPerDay < debt.requiredNetProfitPerDay;
  return (
    <section
      className={cn("relative overflow-hidden rounded-2xl border border-red-900/50 bg-gradient-to-br from-red-950/40 via-card to-card p-5 sm:p-6", className)}
      aria-label="The Debt"
      data-testid="debt"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-red-200">
          <Skull className="mr-2 inline h-4 w-4" />
          The Debt
        </h2>
        <span className="text-xs text-muted-foreground">as of {date(debt.asOf)} · deadline {date(debt.deadline)}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Cell label="Capital still owed to sponsors" hint={`${debt.openPositions} open position${debt.openPositions === 1 ? "" : "s"} · ${money(debt.interestPerDay)} of interest accrues per day`}>
          <AnimatedCounter value={debt.capitalOwed} className="text-red-200" data-testid="debt-capital-owed" />
        </Cell>
        <Cell label="Days left" hint={debt.daysLeft > 0 ? `to ${date(debt.deadline)}` : "the deadline has passed"}>
          <span className="inline-flex items-baseline gap-2">
            <Hourglass className="h-5 w-5 self-center text-gold" />
            <span className="tabular" data-testid="debt-days-left" data-value={debt.daysLeft}>
              {number(debt.daysLeft)}
            </span>
          </span>
        </Cell>
        <Cell
          label="Net profit required per day"
          hint={
            debt.actualNetProfitPerDay !== null
              ? `you have averaged ${money(debt.actualNetProfitPerDay)} / day since the first closing`
              : "no closings yet"
          }
        >
          {debt.requiredNetProfitPerDay === null ? (
            <span className="text-muted-foreground" data-testid="debt-per-day" data-value={0}>
              —
            </span>
          ) : (
            <span className="inline-flex items-baseline gap-2">
              <Swords className={cn("h-5 w-5 self-center", behind ? "text-red-300" : "text-stage-closed")} />
              <AnimatedCounter value={debt.requiredNetProfitPerDay} className={behind ? "text-red-200" : "text-stage-closed"} data-testid="debt-per-day" />
            </span>
          )}
        </Cell>
      </div>

      {debt.requiredNetProfitPerDay !== null && debt.actualNetProfitPerDay !== null && (
        <div className="mt-4">
          <div className="flex justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>actual pace per day</span>
            <span>required</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <motion.div
              className={cn("h-full rounded-full", behind ? "bg-red-400/80" : "bg-stage-closed")}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (debt.actualNetProfitPerDay / debt.requiredNetProfitPerDay) * 100)}%` }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function Cell({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-background/40 p-4">
      <div className="stat-label">{label}</div>
      <div className="mt-1 font-display text-2xl leading-none sm:text-3xl">{children}</div>
      {hint && <div className="mt-2 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
