import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const KEY = "quest.intro.seen";

/**
 * A 1.6-second title card shown once per session over the Throne Room.
 * It never blocks rendering underneath, is skippable with any click/key,
 * and respects reduced-motion (it simply does not show).
 */
export function CinematicIntro() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let seen = true;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
    } catch {
      seen = true;
    }
    if (reduce || seen) return;
    setShow(true);
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      // ignore
    }
    const t = setTimeout(() => setShow(false), 1600);
    const dismiss = () => setShow(false);
    window.addEventListener("keydown", dismiss);
    window.addEventListener("pointerdown", dismiss);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("pointerdown", dismiss);
    };
  }, []);

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
        >
          <div className="text-center">
            <motion.div
              initial={{ letterSpacing: "0.6em", opacity: 0 }}
              animate={{ letterSpacing: "0.25em", opacity: 1 }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-3xl uppercase text-gold sm:text-5xl"
            >
              Exodus
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mt-3 font-heading text-xs uppercase tracking-[0.35em] text-muted-foreground"
            >
              Ten million by the last day of 2027
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
