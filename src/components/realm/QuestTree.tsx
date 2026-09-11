import { motion } from "framer-motion";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { moneyCompact } from "@/lib/format";

export interface QuestNode {
  id: string;
  label: string;
  target: number;
  reached: boolean;
  reachedAt: string | null;
}

interface QuestTreeProps {
  nodes: QuestNode[];
  current: number;
  className?: string;
}

/**
 * The chain of $1M quests to $10M. Reached nodes glow gold; the next one shows
 * progress; the rest wait locked. Horizontal scroll on narrow/landscape so the
 * chain never overflows the viewport.
 */
export function QuestTree({ nodes, current, className }: QuestTreeProps) {
  const nextIndex = nodes.findIndex((n) => !n.reached);
  return (
    <ol
      className={cn(
        "flex max-w-full gap-1 overflow-x-auto overscroll-x-contain pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      aria-label="Quest chain"
    >
      {nodes.map((n, i) => {
        const prevTarget = i === 0 ? 0 : (nodes[i - 1]?.target ?? 0);
        const within = n.reached
          ? 100
          : i === nextIndex
            ? Math.max(0, Math.min(100, ((current - prevTarget) / (n.target - prevTarget)) * 100))
            : 0;
        return (
          <li key={n.id} className="flex w-14 shrink-0 flex-col items-center gap-1 text-center sm:min-w-[56px] sm:flex-1">
            <div className="flex w-full items-center">
              <div className={cn("h-px flex-1", i === 0 ? "bg-transparent" : n.reached || i === nextIndex ? "bg-gold/60" : "bg-border")} />
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  n.reached
                    ? "border-gold bg-gold/20 text-gold shadow-[0_0_18px_-2px_hsl(var(--gold)/0.8)]"
                    : i === nextIndex
                      ? "border-gold/60 bg-card text-foreground"
                      : "border-border bg-card text-muted-foreground",
                )}
                title={n.reachedAt ? `Reached ${n.reachedAt}` : `${within.toFixed(0)}% toward ${moneyCompact(n.target)}`}
              >
                {n.reached ? <Check className="h-4 w-4" /> : i === nextIndex ? `${Math.round(within)}%` : <Lock className="h-3.5 w-3.5" />}
                {i === nextIndex && (
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36" aria-hidden>
                    <circle
                      cx="18"
                      cy="18"
                      r="16.5"
                      fill="none"
                      stroke="hsl(var(--gold))"
                      strokeWidth="2"
                      strokeDasharray={`${(within / 100) * 103.7} 103.7`}
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </motion.div>
              <div className={cn("h-px flex-1", i === nodes.length - 1 ? "bg-transparent" : n.reached ? "bg-gold/60" : "bg-border")} />
            </div>
            <div className={cn("stat-label", n.reached ? "text-gold" : "text-muted-foreground")}>{n.label}</div>
          </li>
        );
      })}
    </ol>
  );
}
