import { motion } from "framer-motion";
import { Lock, Unlock } from "lucide-react";
import type { Hostage, Liberation as LiberationModel } from "@/domain";
import { money, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRealmStrings } from "@/i18n/realm";

/**
 * INVESTOR LIBERATION — every sponsor position is a hostage with a capital-returned bar built
 * from `investor_distributions`; at 100 % it moves to the Liberated gallery.
 */
export function HostageBar({ h, index = 0 }: { h: Hostage; index?: number }) {
  const strings = useRealmStrings();
  const t = strings.liberation;
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn("rounded-lg border p-3", h.freed ? "border-liberty/40 bg-liberty/10" : "border-border/60 bg-muted/30")}
      data-testid="hostage"
      data-freed={h.freed}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {h.freed ? <Unlock className="h-4 w-4 text-liberty" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
            <span className="truncate font-heading">{h.investorName}</span>
            <span className="truncate text-xs text-muted-foreground">· {h.farmName}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {t.returnedOf(money(h.capitalReturned), money(h.capital))}
            {h.freed && h.freedAt ? `${t.freed(strings.date(h.freedAt))}${h.daysHeld !== null ? t.afterDays(h.daysHeld) : ""}` : t.toGo(money(h.capitalOutstanding))}
            {h.paidOnTop > 0 ? t.paidOnTop(money(h.paidOnTop)) : ""}
          </div>
        </div>
        <span className={cn("shrink-0 font-heading tabular", h.freed ? "text-liberty" : "text-foreground")}>{pct(h.pctReturned, h.pctReturned === 100 ? 0 : 1)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-background/70">
        <motion.div
          className={cn("h-full rounded-full", h.freed ? "bg-liberty" : "bg-gradient-to-r from-sponsor/70 to-gold")}
          initial={{ width: 0 }}
          animate={{ width: `${h.pctReturned}%` }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: index * 0.05 }}
        />
      </div>
    </motion.li>
  );
}

export function LiberationBoard({ liberation }: { liberation: LiberationModel }) {
  const t = useRealmStrings().liberation;
  // Side by side only from xl: the two lists differ wildly in length, and each panel keeps its own height.
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[1.4fr_1fr]" data-testid="liberation-board">
      <section className="parchment-card p-5" aria-label={t.hostagesAria}>
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <h2 className="whitespace-nowrap font-heading text-sm uppercase tracking-[0.2em] text-sponsor sm:shrink-0">
            <Lock className="mr-2 inline h-4 w-4" />
            {t.hostages(liberation.captiveHostages.length)}
          </h2>
          <span className="text-xs text-muted-foreground tabular sm:text-right">
            {t.totalReturned(money(liberation.totalReturned), money(liberation.totalCapital), pct(liberation.pctReturned, 1))}
          </span>
        </div>
        {liberation.captiveHostages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.nobodyOwed}</p>
        ) : (
          <ul className="space-y-2">
            {liberation.captiveHostages.map((h, i) => (
              <HostageBar key={h.farmId} h={h} index={i} />
            ))}
          </ul>
        )}
      </section>

      <section className="parchment-card border-liberty/30 p-5" aria-label={t.liberatedAria} data-testid="liberated-gallery">
        <h2 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-liberty">
          <Unlock className="mr-2 inline h-4 w-4" />
          {t.liberated(liberation.freedHostages.length)}
        </h2>
        {liberation.freedHostages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.nobodyFreed}</p>
        ) : (
          <ul className="space-y-2">
            {liberation.freedHostages.map((h, i) => (
              <HostageBar key={h.farmId} h={h} index={i} />
            ))}
          </ul>
        )}
        {liberation.freedSponsors.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">{t.freeSponsors(liberation.freedSponsors.map((s) => s.name).join(", "))}</p>
        )}
      </section>
    </div>
  );
}
