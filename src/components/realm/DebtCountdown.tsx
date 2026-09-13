import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Hourglass, Skull, Swords } from "lucide-react";
import type { Debt } from "@/domain";
import { AnimatedCounter } from "./AnimatedCounter";
import { date, money, number } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRealmStrings } from "@/i18n/realm";

/**
 * THE DEBT — capital still owed to sponsors, days left, and the net profit the realm must earn
 * every single day from today. All three come from `realm.debt`; the per-day figure changes
 * daily because it is remaining ÷ daysLeft as of `asOf`.
 */
export function DebtCountdown({ debt, className }: { debt: Debt; className?: string }) {
  const t = useRealmStrings().debt;
  const behind = debt.actualNetProfitPerDay !== null && debt.requiredNetProfitPerDay !== null && debt.actualNetProfitPerDay < debt.requiredNetProfitPerDay;
  // The pace is measured from the era start (config ERA_START) when closings predate it; the all-time figure stays for the record.
  const paceHint =
    debt.actualNetProfitPerDay === null
      ? t.noClosings
      : debt.actualEraClipped
        ? t.averagedSince(money(debt.actualNetProfitPerDay), debt.actualSinceLabel ?? "", number(debt.actualDays)) +
          (debt.actualNetProfitPerDayAllTime !== null ? t.averagedAllTime(money(debt.actualNetProfitPerDayAllTime), date(debt.firstCloseDate ?? debt.asOf)) : "")
        : t.averagedFirstClosing(money(debt.actualNetProfitPerDay));
  return (
    <section
      className={cn("relative overflow-hidden rounded-2xl border border-ember/18 bg-gradient-to-br from-ember/14 via-card to-card p-5 sm:p-6", className)}
      aria-label={t.aria}
      data-testid="debt"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-ember">
          <Skull className="mr-2 inline h-4 w-4" />
          {t.title}
        </h2>
        <span className="text-xs text-muted-foreground">{t.asOf(date(debt.asOf), date(debt.deadline))}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1.35fr_0.75fr_1.15fr]">
        <Cell label={t.capitalOwed} hint={t.capitalOwedHint(debt.openPositions, money(debt.interestPerDay))}>
          <AnimatedCounter value={debt.capitalOwed} className="text-ember" data-testid="debt-capital-owed" />
        </Cell>
        <Cell label={t.daysLeft} hint={debt.daysLeft > 0 ? t.daysLeftTo(date(debt.deadline)) : t.deadlinePassed}>
          <span className="inline-flex items-baseline gap-2">
            <Hourglass className="h-5 w-5 self-center text-gold" />
            <span className="tabular" data-testid="debt-days-left" data-value={debt.daysLeft}>
              {number(debt.daysLeft)}
            </span>
          </span>
        </Cell>
        <Cell label={t.requiredPerDay} hint={paceHint} hintTestId="debt-actual-pace-hint">
          {debt.requiredNetProfitPerDay === null ? (
            <span className="text-muted-foreground" data-testid="debt-per-day" data-value={0}>
              —
            </span>
          ) : (
            <span className="inline-flex items-baseline gap-2">
              <Swords className={cn("h-5 w-5 self-center", behind ? "text-ember" : "text-stage-closed")} />
              <AnimatedCounter value={debt.requiredNetProfitPerDay} className={behind ? "text-ember" : "text-stage-closed"} data-testid="debt-per-day" />
            </span>
          )}
        </Cell>
      </div>

      {debt.requiredNetProfitPerDay !== null && debt.actualNetProfitPerDay !== null && (
        <div className="mt-4">
          <div className="flex justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
            <span data-testid="debt-actual-pace-label">
              {t.actualPace}
              {debt.actualSinceLabel ? ` · ${debt.actualSinceLabel}` : ""}
            </span>
            <span>{t.required}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <motion.div
              className={cn("h-full rounded-full", behind ? "bg-ember/80" : "bg-stage-closed")}
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

function Cell({ label, hint, hintTestId, children }: { label: string; hint?: string; hintTestId?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-background/40 p-4">
      <div className="stat-label">{label}</div>
      <div className="mt-1 font-display text-2xl leading-none xl:text-3xl">{children}</div>
      {hint && (
        <div className="mt-2 text-[11px] text-muted-foreground" data-testid={hintTestId}>
          {hint}
        </div>
      )}
    </div>
  );
}
