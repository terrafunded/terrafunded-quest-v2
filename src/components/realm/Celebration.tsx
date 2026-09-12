import { AnimatePresence, motion } from "framer-motion";
import { Crown, Unlock, X } from "lucide-react";
import { useEffect } from "react";
import type { RealmEvent } from "@/domain";
import { GrowthBurst } from "./GrowthBurst";
import { Button } from "@/components/ui/button";
import { date, money } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CelebrationProps {
  events: RealmEvent[];
  /** One line of chronicle prose per event id. */
  narrative: Map<string, string>;
  onDone: () => void;
}

const KIND_LABEL: Record<string, string> = { closing: "A lot was claimed", note_sale: "A note was sold", liberation: "A sponsor walks free" };

/**
 * Full-screen fanfare for the real closings, note sales and liberations that happened since the
 * last visit (Phase 2 §9), or for a liberation the first time it is seen. Dismissible; never
 * rendered under `prefers-reduced-motion`-hostile conditions because it is a plain dialog.
 */
export function Celebration({ events, narrative, onDone }: CelebrationProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  if (events.length === 0) return null;
  const liberation = events.some((e) => e.kind === "liberation");
  const headline = events.length === 1 ? KIND_LABEL[events[0]?.kind ?? ""] ?? "Since your last visit" : `${events.length} things happened since your last visit`;

  return (
    <AnimatePresence>
      <motion.div
        key="celebration"
        role="dialog"
        aria-modal="true"
        aria-label="Celebration"
        className="fixed inset-0 z-[70] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onDone}
        data-testid="celebration"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "relative w-full max-w-lg overflow-hidden rounded-2xl border p-6 text-center shadow-2xl",
            liberation ? "border-liberty/50 bg-gradient-to-br from-liberty/21 via-card to-card" : "border-gold/50 bg-gradient-to-br from-gold/15 via-card to-card",
          )}
        >
          <GrowthBurst trigger={events[0]?.id ?? "x"} particles={20} className="pointer-events-none absolute inset-0 left-1/2 top-1/3" />
          <Button variant="ghost" size="icon" className="absolute right-2 top-2" onClick={onDone} aria-label="Close celebration">
            <X />
          </Button>
          <motion.div
            animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.1, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5 }}
            className={cn("mx-auto mb-3 inline-flex h-16 w-16 items-center justify-center rounded-full", liberation ? "bg-liberty/20 text-liberty" : "bg-gold/20 text-gold")}
          >
            {liberation ? <Unlock className="h-8 w-8" /> : <Crown className="h-8 w-8" />}
          </motion.div>
          <div className="stat-label">{headline}</div>
          <ol className="mt-4 max-h-[50vh] space-y-3 overflow-y-auto text-left">
            {events.map((e, i) => (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.12 }}
                className="rounded-md bg-background/50 p-3"
              >
                <div className="flex items-baseline justify-between gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>{KIND_LABEL[e.kind] ?? e.kind}</span>
                  <span>
                    {date(e.date)}
                    {e.amount !== null ? ` · ${money(e.amount)}` : ""}
                  </span>
                </div>
                <p className="mt-1 font-heading text-sm leading-snug sm:text-base">{narrative.get(e.id) ?? e.title}</p>
              </motion.li>
            ))}
          </ol>
          <Button className="mt-5" onClick={onDone}>
            Onward
          </Button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
