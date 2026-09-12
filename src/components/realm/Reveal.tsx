import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Fades and lifts its children into place the first time they scroll into view, so a block below
 * the fold arrives as the user reaches it instead of having animated unseen at load. Runs once:
 * re-renders (a new exit horizon, a language switch) and later scrolling never replay it. Under
 * reduced motion the content is simply there.
 */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const { d, reducedMotion } = useTheme();
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  return (
    <motion.div
      ref={ref}
      className={className}
      data-revealed={inView}
      initial={reducedMotion ? false : { opacity: 0, y: 14 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: d(0.6), delay: d(delay), ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
