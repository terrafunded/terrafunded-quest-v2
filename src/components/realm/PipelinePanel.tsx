import { motion } from "framer-motion";
import { Hourglass, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import type { Pipeline } from "@/domain";
import { AnimatedCounter } from "./AnimatedCounter";
import { money, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The reservations layer next to the closings-based numbers. Reservations lead, closings pay:
 * nothing here feeds net profit, pace, oxygen or the goal date (see src/domain/pipeline.ts).
 */
export function PipelinePanel({ pipeline, className }: { pipeline: Pipeline; className?: string }) {
  const p = pipeline;
  const ahead = p.reservationsPerMonth >= p.closedLotsPerMonth;
  return (
    <section
      className={cn("relative overflow-hidden rounded-2xl border border-siege/30 bg-gradient-to-br from-siege/10 via-card to-card p-5 sm:p-6", className)}
      aria-label="Pipeline"
      data-testid="pipeline"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-siege">
          <Hourglass className="mr-2 inline h-4 w-4" />
          Pipeline · reservations lead, closings pay
        </h2>
        <Link to="/pipeline" className="touch-link text-xs text-muted-foreground hover:text-foreground">
          the stuck list →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="stat-label">Profit trapped in reservations</div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="mt-1 font-display text-4xl leading-none text-siege sm:text-5xl">
            <AnimatedCounter value={p.netProfitTrapped} data-testid="pipeline-trapped" />
          </motion.div>
          <div className="mt-1.5 text-xs text-muted-foreground">
            <Lock className="mr-1 inline h-3 w-3" />
            <span data-testid="pipeline-stuck-count" data-value={p.stuckCount}>
              {p.stuckCount}
            </span>{" "}
            reservations waiting {p.stuckAfterDays}+ days · {money(p.salePriceTrapped)} of sales
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-background/40 p-3">
            <div className="stat-label">Reservations / mo</div>
            <div className={cn("mt-1 font-heading text-2xl tabular", ahead ? "text-siege" : "text-ember")} data-testid="pipeline-reservations-per-month">
              {p.reservationsPerMonth}
            </div>
            <div className="text-[11px] text-muted-foreground">{p.newReservationsTrailing} in {p.trailingWindowDays} days, still waiting</div>
          </div>
          <div className="rounded-md bg-background/40 p-3">
            <div className="stat-label">Closings / mo</div>
            <div className="mt-1 font-heading text-2xl tabular text-stage-closed">{p.closedLotsPerMonth}</div>
            <div className="text-[11px] text-muted-foreground">the only pace that counts</div>
          </div>
          <div className="rounded-md bg-background/40 p-3">
            <div className="stat-label">Conversion</div>
            <div className="mt-1 font-heading text-2xl tabular" data-testid="pipeline-conversion">
              {p.conversion.pct === null ? "—" : pct(p.conversion.pct)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {p.conversion.closed} of {p.conversion.cohort} reserved {p.conversion.maturityDays}+ days ago closed
              {p.conversion.cancellationRatePct !== null && (
                <>
                  {" · "}
                  <span data-testid="pipeline-cancellation-rate" data-value={p.conversion.cancellationRatePct}>
                    {pct(p.conversion.cancellationRatePct)} cancelled
                  </span>
                  , {p.conversion.pctWithCancellations === null ? "—" : pct(p.conversion.pctWithCancellations)} incl. cancellations
                </>
              )}
            </div>
          </div>
          <div className="rounded-md bg-background/40 p-3">
            <div className="stat-label">Median to close</div>
            <div className="mt-1 font-heading text-2xl tabular">{p.medianDaysToClose === null ? "—" : `${p.medianDaysToClose}d`}</div>
            <div className="text-[11px] text-muted-foreground">reservation → closing, {p.closedWithBothDates} lots</div>
          </div>
        </div>
      </div>
    </section>
  );
}
