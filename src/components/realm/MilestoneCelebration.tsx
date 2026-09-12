import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { GrowthBurst } from "./GrowthBurst";
import { money } from "@/lib/format";
import { useRealmStrings } from "@/i18n/realm";

interface MilestoneCelebrationProps {
  amount: number;
  date: string;
  caption?: string;
}

/** A chronicle entry that celebrates a $1M line being crossed. */
export function MilestoneCelebration({ amount, date, caption }: MilestoneCelebrationProps) {
  const t = useRealmStrings().milestone;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-xl border border-gold/40 bg-gradient-to-br from-gold/15 via-card to-accent/20 p-5 text-center shadow-[0_0_60px_-20px_hsl(var(--gold)/0.7)]"
      data-testid="milestone-celebration"
    >
      <GrowthBurst trigger={amount} className="pointer-events-none absolute inset-0" />
      <motion.div
        animate={{ rotate: [0, -6, 6, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 2 }}
        className="mx-auto mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gold/20 text-gold"
      >
        <Crown className="h-6 w-6" />
      </motion.div>
      <div className="stat-label">{t.title(date)}</div>
      <div className="mt-1 font-display text-2xl text-gold sm:text-3xl">{money(amount)}</div>
      <div className="mt-1 text-sm text-muted-foreground">{caption ?? t.caption}</div>
    </motion.div>
  );
}
