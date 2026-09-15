import { motion } from "framer-motion";
import { Hourglass, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import type { Pipeline } from "@/domain";
import { AnimatedCounter } from "./AnimatedCounter";
import { money, monthLabel, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRealmStrings } from "@/i18n/realm";

/**
 * The reservations layer next to the closings-based numbers. Reservations lead, closings pay:
 * nothing here feeds net profit, pace, oxygen or the goal date (see src/domain/pipeline.ts).
 */
export function PipelinePanel({ pipeline, className }: { pipeline: Pipeline; className?: string }) {
  const t = useRealmStrings().pipeline;
  const p = pipeline;
  const ahead = p.reservationsPerMonth >= p.closedLotsPerMonth;
  const c = p.conversion;
  return (
    <section
      className={cn("relative overflow-hidden rounded-2xl border border-siege/30 bg-gradient-to-br from-siege/10 via-card to-card p-5 sm:p-6", className)}
      aria-label={t.aria}
      data-testid="pipeline"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-siege">
          <Hourglass className="mr-2 inline h-4 w-4" />
          {t.title}
        </h2>
        <Link to="/pipeline" className="touch-link text-xs text-muted-foreground hover:text-foreground">
          {t.stuckList}
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="stat-label">{t.trapped}</div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="mt-1 font-display text-4xl leading-none text-siege sm:text-5xl">
            <AnimatedCounter value={p.netProfitTrapped} data-testid="pipeline-trapped" />
          </motion.div>
          <div className="mt-1.5 text-xs text-muted-foreground">
            <Lock className="mr-1 inline h-3 w-3" />
            <span data-testid="pipeline-stuck-count" data-value={p.stuckCount}>
              {p.stuckCount}
            </span>{" "}
            {t.waiting(p.stuckAfterDays, money(p.salePriceTrapped))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-background/40 p-3">
            <div className="stat-label">{t.reservationsPerMonth}</div>
            <div className={cn("mt-1 font-heading text-2xl tabular", ahead ? "text-siege" : "text-ember")} data-testid="pipeline-reservations-per-month">
              {p.reservationsPerMonth}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {p.trailingEraClipped
                ? t.sinceWaiting(p.newReservationsTrailing, monthLabel(p.trailingSince.slice(0, 7)), p.trailingDays)
                : t.inDaysWaiting(p.newReservationsTrailing, p.trailingWindowDays)}
            </div>
          </div>
          <div className="rounded-md bg-background/40 p-3">
            <div className="stat-label">{t.closingsPerMonth}</div>
            <div className="mt-1 font-heading text-2xl tabular text-stage-closed">{p.closedLotsPerMonth}</div>
            <div className="text-[11px] text-muted-foreground">{t.onlyPace}</div>
          </div>
          <div className="col-span-2 rounded-md bg-background/40 p-3" data-testid="pipeline-conversion-block">
            <div className="stat-label">{t.conversion}</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div>
                <div className="text-[11px] text-muted-foreground">{t.resolvedConversion}</div>
                <div className="font-heading text-xl tabular text-stage-closed" data-testid="pipeline-conversion-resolved">
                  {c.resolvedPct === null ? "—" : pct(c.resolvedPct)}
                </div>
                <div className="text-[11px] text-muted-foreground">{t.resolvedHint}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">{t.stillOpen}</div>
                <div className="font-heading text-xl tabular text-stage-reserved" data-testid="pipeline-conversion-open">
                  {c.stillReserved}
                </div>
                <div className="text-[11px] text-muted-foreground">{t.stillOpenHint}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">{t.blendedConversion}</div>
                <div className="font-heading text-xl tabular" data-testid="pipeline-conversion">
                  {c.pct === null ? "—" : pct(c.pct)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t.blendedHint}
                  {c.cancellationRatePct !== null && (
                    <>
                      {" · "}
                      <span data-testid="pipeline-cancellation-rate" data-value={c.cancellationRatePct}>
                        {t.cancelled(pct(c.cancellationRatePct))}
                      </span>
                      {t.inclCancellations(c.pctWithCancellations === null ? "—" : pct(c.pctWithCancellations))}
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{t.conversionHint(c.closed, c.cohort, c.maturityDays)}</div>
          </div>
          <div className="col-span-2 rounded-md bg-background/40 p-3 sm:col-span-1">
            <div className="stat-label">{t.medianToClose}</div>
            <div className="mt-1 font-heading text-2xl tabular">{p.medianDaysToClose === null ? "—" : `${p.medianDaysToClose}d`}</div>
            <div className="text-[11px] text-muted-foreground">{t.medianHint(p.closedWithBothDates)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
