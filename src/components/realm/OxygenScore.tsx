import { motion } from "framer-motion";
import { Wind } from "lucide-react";
import { Link } from "react-router-dom";
import type { Oxygen } from "@/domain";
import { AnimatedCounter } from "./AnimatedCounter";
import { date, money } from "@/lib/format";
import { cn } from "@/lib/utils";

const daysFormat = (n: number) => `${Math.round(n).toLocaleString("en-US")}`;

/**
 * OXYGEN — the primary score of the game: days gained toward the exit date, summed over every
 * closed lot. Each lot's share is fixed on its closing day (see src/domain/oxygen.ts).
 */
export function OxygenScore({ oxygen, className }: { oxygen: Oxygen; className?: string }) {
  return (
    <section
      className={cn("relative overflow-hidden rounded-2xl border border-oxygen/30 bg-gradient-to-br from-oxygen/14 via-card to-card p-5 sm:p-6", className)}
      aria-label="Oxygen"
      data-testid="oxygen"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-oxygen">
          <Wind className="mr-2 inline h-4 w-4" />
          Oxygen · days gained
        </h2>
        <Link to="/quests" className="touch-link text-xs text-muted-foreground hover:text-foreground">
          per lot in the ledger →
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="font-display text-5xl leading-none text-oxygen sm:text-6xl">
          <AnimatedCounter value={oxygen.totalDaysGained} format={daysFormat} data-testid="oxygen-score" />
          <span className="ml-2 font-heading text-lg text-muted-foreground">days</span>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="font-display text-3xl font-light leading-none text-oxygen/60 sm:text-4xl"
          title={`Provisional: ${oxygen.provisional.size} live reservations at ${oxygen.conversionPct}% conversion, measured at the pace of their reservation day. Confirmed at closing, forfeited at cancellation.`}
        >
          <span className="tabular" data-testid="oxygen-provisional" data-value={oxygen.provisionalDaysGained}>
            +{daysFormat(oxygen.provisionalDaysGained)}
          </span>
          <span className="ml-1.5 font-heading text-sm text-muted-foreground/80">provisional</span>
        </motion.div>
        <div className="text-xs text-muted-foreground">
          <div>
            {oxygen.perLot.size} closings confirmed · {oxygen.trailingDaysGained} days in the trailing window
          </div>
          <div>
            {oxygen.provisional.size} {oxygen.provisional.size === 1 ? "reservation" : "reservations"} provisional at {oxygen.conversionPct}% conversion
          </div>
          {oxygen.netProfitPerDayAtPace !== null && <div>today one day costs {money(oxygen.netProfitPerDayAtPace)} of net profit</div>}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {oxygen.latest && (
          <div className="rounded-md bg-background/40 p-3">
            <div className="stat-label">Latest breath</div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="truncate">{oxygen.latest.lotName}</span>
              <span className="shrink-0 font-heading tabular text-oxygen">+{oxygen.latest.daysGained}d</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {date(oxygen.latest.closeDate)} · net {money(oxygen.latest.netProfit)}
            </div>
          </div>
        )}
        {oxygen.best && (
          <div className="rounded-md bg-background/40 p-3">
            <div className="stat-label">Deepest breath</div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="truncate">{oxygen.best.lotName}</span>
              <span className="shrink-0 font-heading tabular text-oxygen">+{oxygen.best.daysGained}d</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {date(oxygen.best.closeDate)} · when the realm earned {money(oxygen.best.paceThatDay)} a day
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
