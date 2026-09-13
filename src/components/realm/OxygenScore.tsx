import { motion } from "framer-motion";
import { Wind } from "lucide-react";
import { Link } from "react-router-dom";
import { oxygenPace, type Oxygen, type OxygenBand } from "@/domain";
import { AnimatedCounter } from "./AnimatedCounter";
import { date, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRealmStrings } from "@/i18n/realm";

const daysFormat = (n: number) => `${Math.round(n).toLocaleString("en-US")}`;

/** Behind = losing ground (ember, like the Debt); ahead or holding = oxygen blue. */
const BAND_TONE: Record<OxygenBand, string> = {
  behind: "text-ember",
  even: "text-oxygen",
  ahead: "text-oxygen",
};

/**
 * OXYGEN — the scoreboard of the game, read the only way it can be read honestly.
 *
 * Headline: days gained by the closings inside the trailing window against the days that window
 * spans. Gaining fewer days than pass means the exit date drifts away by the difference every
 * window; gaining more pulls it closer. Both figures live on the same clock, so the comparison
 * means something a user can say in one sentence.
 *
 * The cumulative total (every closed lot's days gained, each measured against a different day's
 * pace — see src/domain/oxygen.ts) is a running tally with no single reference point, so it is
 * kept, but demoted to a labelled small line. Provisional days from live reservations are shown
 * beside the headline and never summed into anything.
 */
export function OxygenScore({ oxygen, className }: { oxygen: Oxygen; className?: string }) {
  const t = useRealmStrings().oxygen;
  const pace = oxygenPace(oxygen);
  const tone = BAND_TONE[pace.band];
  const verdict = t.verdict[pace.band](oxygen.trailingDaysGained, oxygen.trailingWindowDays, pace.diff);
  return (
    <section
      className={cn("relative overflow-hidden rounded-2xl border border-oxygen/30 bg-gradient-to-br from-oxygen/14 via-card to-card p-5 sm:p-6", className)}
      aria-label={t.aria}
      data-testid="oxygen"
      data-band={pace.band}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-oxygen">
          <Wind className="mr-2 inline h-4 w-4" />
          {t.title}
        </h2>
        <Link to="/quests" className="touch-link text-xs text-muted-foreground hover:text-foreground">
          {t.perLot}
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className={cn("font-display text-5xl leading-none sm:text-6xl", tone)}
          data-testid="oxygen-trailing"
          data-value={oxygen.trailingDaysGained}
          data-window={oxygen.trailingWindowDays}
        >
          <AnimatedCounter value={oxygen.trailingDaysGained} format={daysFormat} data-testid="oxygen-trailing-counter" />
          <span className="ml-2 font-heading text-lg text-muted-foreground">{t.gainedInLast(oxygen.trailingWindowDays)}</span>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="font-display text-3xl font-light leading-none text-oxygen/60 sm:text-4xl"
          title={t.provisionalTitle(oxygen.provisional.size, oxygen.conversionPct)}
        >
          <span className="tabular" data-testid="oxygen-provisional" data-value={oxygen.provisionalDaysGained}>
            +{daysFormat(oxygen.provisionalDaysGained)}
          </span>
          <span className="ml-1.5 font-heading text-sm text-muted-foreground/80">{t.provisional}</span>
        </motion.div>
      </div>
      <p className={cn("mt-2 text-sm", tone)} data-testid="oxygen-verdict" data-diff={pace.diff}>
        {verdict}
      </p>

      <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
        <div data-testid="oxygen-cumulative" title={t.cumulativeTitle}>
          {t.cumulative} ·{" "}
          <span className="tabular text-foreground" data-testid="oxygen-score" data-value={oxygen.totalDaysGained} data-target={oxygen.totalDaysGained}>
            {daysFormat(oxygen.totalDaysGained)}
          </span>{" "}
          {t.days}
        </div>
        <div data-testid="oxygen-confirmed">{t.confirmed(oxygen.perLot.size)}</div>
        <div data-testid="oxygen-reservations-provisional">{t.reservationsProvisional(oxygen.provisional.size, oxygen.conversionPct)}</div>
        {oxygen.netProfitPerDayAtPace !== null && <div data-testid="oxygen-produces">{t.produces(money(oxygen.netProfitPerDayAtPace))}</div>}
      </div>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {oxygen.latest && (
          <div className="rounded-md bg-background/40 p-3">
            <div className="stat-label">{t.latest}</div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="truncate">{oxygen.latest.lotName}</span>
              <span className="shrink-0 font-heading tabular text-oxygen">+{oxygen.latest.daysGained}d</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {date(oxygen.latest.closeDate)} · {t.net(money(oxygen.latest.netProfit))}
            </div>
          </div>
        )}
        {oxygen.best && (
          <div
            className="rounded-md bg-background/40 p-3"
            title={`${t.paceThatDay(date(oxygen.best.closeDate), money(oxygen.best.paceThatDay))}\n${t.deepestWhy}`}
            data-testid="oxygen-deepest"
          >
            <div className="stat-label">{t.deepest}</div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="truncate">{oxygen.best.lotName}</span>
              <span className="shrink-0 font-heading tabular text-oxygen">+{oxygen.best.daysGained}d</span>
            </div>
            <div className="text-[11px] text-muted-foreground">{t.paceThatDay(date(oxygen.best.closeDate), money(oxygen.best.paceThatDay))}</div>
          </div>
        )}
      </div>
    </section>
  );
}
