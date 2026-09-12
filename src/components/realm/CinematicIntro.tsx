import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { Story } from "@/domain";
import { useHorizon } from "@/horizon/HorizonProvider";

const KEY = "quest.intro.seen";
const CARD_MS = 1600;

/**
 * The opening title cards, shown once per session over the Throne Room. Every card is a real
 * sentence from `realm.story` (Phase 2 §8) — farms, sponsor gold, lots closed, days gained,
 * liberations and the debt — computed from Payments, never typed in.
 *
 * Skippable with any click or key; never shown under `prefers-reduced-motion`; never blocks the
 * page underneath from rendering and loading.
 */
export function CinematicIntro({ story }: { story: Story }) {
  const { horizon } = useHorizon();
  const [show, setShow] = useState(false);
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    if (typeof window === "undefined" || !story.hasData) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let seen = true;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
    } catch {
      seen = true;
    }
    if (reduce || seen) return;
    setShow(true);
    setIndex(-1);
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      // ignore
    }
    const total = story.cards.length;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < total; i++) timers.push(setTimeout(() => setIndex(i), 700 + i * CARD_MS));
    timers.push(setTimeout(() => setShow(false), 700 + total * CARD_MS + 300));
    const dismiss = () => setShow(false);
    window.addEventListener("keydown", dismiss);
    window.addEventListener("pointerdown", dismiss);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("pointerdown", dismiss);
    };
    // Horizon changes rebuild `story` but must not replay the intro; sessionStorage is the gate,
    // and the dependency is hasData (not the object) so a year click does not restart the timers.
  }, [story.hasData]);

  const card = index >= 0 ? story.cards[index] : undefined;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="intro"
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          aria-hidden
          data-testid="cinematic-intro"
        >
          <div className="max-w-2xl px-6 text-center">
            <AnimatePresence mode="wait">
              {!card ? (
                <motion.div key="title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
                  <motion.div
                    initial={{ letterSpacing: "0.6em", opacity: 0 }}
                    animate={{ letterSpacing: "0.25em", opacity: 1 }}
                    transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                    className="font-display text-3xl uppercase text-gold sm:text-5xl"
                  >
                    Exodus
                  </motion.div>
                  <div className="mt-3 font-heading text-xs uppercase tracking-[0.35em] text-muted-foreground">
                    Ten million by the last day of {horizon}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="font-heading text-xs uppercase tracking-[0.35em] text-gold">{card.kicker}</div>
                  <p className="mt-4 font-heading text-xl leading-snug text-foreground sm:text-3xl">{card.line}</p>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="mt-8 flex justify-center gap-1.5">
              {story.cards.map((c, i) => (
                <span key={c.id} className={`h-1 w-6 rounded-full transition-colors ${i <= index ? "bg-gold" : "bg-muted"}`} />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
