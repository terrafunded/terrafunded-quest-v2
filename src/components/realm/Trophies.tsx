import { motion } from "framer-motion";
import { Award, Crown, Gem, Lock, Medal } from "lucide-react";
import type { Trophy } from "@/domain";
import { cn } from "@/lib/utils";
import { date } from "@/lib/format";

const TIER_STYLE: Record<Trophy["tier"], { ring: string; icon: typeof Award; label: string }> = {
  bronze: { ring: "from-siege/30 to-siege/10 text-siege", icon: Medal, label: "Bronze" },
  silver: { ring: "from-steel/40 to-steel/20 text-steel", icon: Award, label: "Silver" },
  gold: { ring: "from-gold/50 to-gold-dim/30 text-gold", icon: Crown, label: "Gold" },
  legendary: { ring: "from-sponsor/40 to-accent/40 text-sponsor", icon: Gem, label: "Legendary" },
};

/** Rarity tiers (Phase 2 §5): how hard a trophy is to earn. */
const RARITY_STYLE: Record<Trophy["rarity"], { label: string; className: string }> = {
  common: { label: "Common", className: "border-steel/40 text-steel" },
  rare: { label: "Rare", className: "border-oxygen/40 text-oxygen" },
  epic: { label: "Epic", className: "border-sponsor/50 text-sponsor" },
  legendary: { label: "Legendary", className: "border-gold/60 text-gold" },
};

export function TrophyCard({ trophy, index = 0 }: { trophy: Trophy; index?: number }) {
  const style = TIER_STYLE[trophy.tier];
  const Icon = style.icon;
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.6), duration: 0.5 }}
      className={cn(
        "parchment-card relative flex gap-4 p-4",
        trophy.earned ? "border-gold/40 shadow-[0_0_40px_-18px_hsl(var(--gold)/0.7)]" : "opacity-80 saturate-50",
      )}
      data-testid="trophy-card"
      data-earned={trophy.earned}
    >
      <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br", style.ring, !trophy.earned && "grayscale")}>
        {trophy.earned ? <Icon className="h-7 w-7" /> : <Lock className="h-5 w-5 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className={cn("font-heading text-base", trophy.earned ? "text-gold" : "text-foreground")}>{trophy.title}</h3>
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest", RARITY_STYLE[trophy.rarity].className)} data-rarity={trophy.rarity}>
            {RARITY_STYLE[trophy.rarity].label}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{trophy.description}</p>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className={cn("h-full rounded-full", trophy.earned ? "bg-gold" : "bg-muted-foreground/60")}
            initial={{ width: 0 }}
            animate={{ width: `${trophy.progress}%` }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
          <span className="tabular">{trophy.detail}</span>
          {trophy.earned && trophy.earnedAt && <span>Earned {date(trophy.earnedAt)}</span>}
        </div>
      </div>
    </motion.article>
  );
}

export function Trophies({ trophies }: { trophies: Trophy[] }) {
  const earned = trophies.filter((t) => t.earned);
  const locked = trophies.filter((t) => !t.earned);
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-gold">Earned · {earned.length}</h2>
        {earned.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trophies yet. The first closing earns First Blood.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {earned.map((t, i) => (
              <TrophyCard key={t.id} trophy={t} index={i} />
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-muted-foreground">Still to earn · {locked.length}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {locked.map((t, i) => (
            <TrophyCard key={t.id} trophy={t} index={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
