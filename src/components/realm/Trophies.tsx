import { motion } from "framer-motion";
import { Award, Crown, Gem, Lock, Medal } from "lucide-react";
import type { Trophy } from "@/domain";
import { cn } from "@/lib/utils";
import { date } from "@/lib/format";
import { useRealmStrings } from "@/i18n/realm";

const TIER_STYLE: Record<Trophy["tier"], { ring: string; icon: typeof Award }> = {
  bronze: { ring: "from-siege/30 to-siege/10 text-siege", icon: Medal },
  silver: { ring: "from-steel/40 to-steel/20 text-steel", icon: Award },
  gold: { ring: "from-gold/50 to-gold-dim/30 text-gold", icon: Crown },
  legendary: { ring: "from-sponsor/40 to-accent/40 text-sponsor", icon: Gem },
};

/** Rarity tiers (Phase 2 §5): how hard a trophy is to earn. Labels live in the realm strings. */
const RARITY_STYLE: Record<Trophy["rarity"], string> = {
  common: "border-steel/40 text-steel",
  rare: "border-oxygen/40 text-oxygen",
  epic: "border-sponsor/50 text-sponsor",
  legendary: "border-gold/60 text-gold",
};

export function TrophyCard({ trophy, index = 0 }: { trophy: Trophy; index?: number }) {
  const t = useRealmStrings().trophies;
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
        <div className="flex items-start justify-between gap-x-3">
          <h3 className={cn("min-w-0 font-heading text-base leading-tight", trophy.earned ? "text-gold" : "text-foreground")}>{trophy.title}</h3>
          <span
            className={cn("mt-0.5 shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest", RARITY_STYLE[trophy.rarity])}
            data-rarity={trophy.rarity}
          >
            {t.rarity[trophy.rarity]}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{trophy.description}</p>
        {trophy.id === "pace_keeper" && (
          <p className="mt-1 text-[11px] uppercase tracking-wide text-sponsor" data-testid="pace-keeper-horizon-note">
            {t.horizonDependent}
          </p>
        )}
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
          {trophy.earned && trophy.earnedAt && <span>{t.earnedOn(date(trophy.earnedAt))}</span>}
        </div>
      </div>
    </motion.article>
  );
}

export function Trophies({ trophies }: { trophies: Trophy[] }) {
  const t = useRealmStrings().trophies;
  const earned = trophies.filter((t) => t.earned);
  const locked = trophies.filter((t) => !t.earned);
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.earned(earned.length)}</h2>
        {earned.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noneYet}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {earned.map((t, i) => (
              <TrophyCard key={t.id} trophy={t} index={i} />
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-muted-foreground">{t.stillToEarn(locked.length)}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {locked.map((t, i) => (
            <TrophyCard key={t.id} trophy={t} index={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
