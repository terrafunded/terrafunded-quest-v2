import { motion } from "framer-motion";
import { Lock, Unlock } from "lucide-react";
import type { Hostage, Liberation as LiberationModel } from "@/domain";
import { date, money, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * INVESTOR LIBERATION — every sponsor position is a hostage with a capital-returned bar built
 * from `investor_distributions`; at 100 % it moves to the Liberated gallery.
 */
export function HostageBar({ h, index = 0 }: { h: Hostage; index?: number }) {
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
            {money(h.capitalReturned)} of {money(h.capital)} returned
            {h.freed && h.freedAt ? ` · freed ${date(h.freedAt)}${h.daysHeld !== null ? ` after ${h.daysHeld} days` : ""}` : ` · ${money(h.capitalOutstanding)} to go`}
            {h.paidOnTop > 0 ? ` · ${money(h.paidOnTop)} paid on top` : ""}
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
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <section className="parchment-card p-5" aria-label="Hostages of the realm">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <h2 className="whitespace-nowrap font-heading text-sm uppercase tracking-[0.2em] text-sponsor sm:shrink-0">
            <Lock className="mr-2 inline h-4 w-4" />
            Hostages of the realm · {liberation.captiveHostages.length}
          </h2>
          <span className="text-xs text-muted-foreground tabular sm:text-right">
            {money(liberation.totalReturned)} of {money(liberation.totalCapital)} returned · {pct(liberation.pctReturned, 1)}
          </span>
        </div>
        {liberation.captiveHostages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sponsor is owed anything. The realm is free.</p>
        ) : (
          <ul className="space-y-2">
            {liberation.captiveHostages.map((h, i) => (
              <HostageBar key={h.farmId} h={h} index={i} />
            ))}
          </ul>
        )}
      </section>

      <section className="parchment-card border-liberty/30 p-5" aria-label="Liberated" data-testid="liberated-gallery">
        <h2 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-liberty">
          <Unlock className="mr-2 inline h-4 w-4" />
          Liberated · {liberation.freedHostages.length}
        </h2>
        {liberation.freedHostages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody has been freed yet. The first farm to return 100% of its capital opens this gallery.</p>
        ) : (
          <ul className="space-y-2">
            {liberation.freedHostages.map((h, i) => (
              <HostageBar key={h.farmId} h={h} index={i} />
            ))}
          </ul>
        )}
        {liberation.freedSponsors.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">Free sponsors (every position repaid): {liberation.freedSponsors.map((s) => s.name).join(", ")}.</p>
        )}
      </section>
    </div>
  );
}
