import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { useTheme } from "@/theme/ThemeProvider";
import type { MotionLanguage } from "@/theme/themes";

/**
 * After the enter animation, drop filter/transform so this wrapper is not a containing block for
 * `position: fixed` descendants. `filter: blur(0px)` still traps fixed children the same way a
 * real blur does — the overlay then centres on the page height instead of the viewport.
 */
export const PAGE_TRANSITION_CLEAR = { filter: "none", transform: "none" } as const;

/**
 * Three ways to enter a page. Iron Crown rises slowly out of the stone; Gilded Realm turns like a
 * leaf of a manuscript; Neon Kingdom snaps in from the side with a HUD wipe.
 */
export const PAGE_PRESETS: Record<MotionLanguage["page"], Variants> = {
  rise: {
    initial: { opacity: 0, y: 18, filter: "blur(2px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: PAGE_TRANSITION_CLEAR },
  },
  turn: {
    initial: { opacity: 0, x: 12, rotateY: -4, transformPerspective: 1200, transformOrigin: "left center" },
    animate: { opacity: 1, x: 0, rotateY: 0, transformPerspective: 1200, transitionEnd: PAGE_TRANSITION_CLEAR },
  },
  hud: {
    initial: { opacity: 0, x: -14, clipPath: "inset(0 0 0 10%)" },
    animate: { opacity: 1, x: 0, clipPath: "inset(0 0 0 0%)", transitionEnd: PAGE_TRANSITION_CLEAR },
  },
};

export function PageTransition({ children, routeKey }: { children: ReactNode; routeKey: string }) {
  const { theme, d } = useTheme();
  const preset = PAGE_PRESETS[theme.motion.page];
  return (
    <motion.div key={routeKey} variants={preset} initial="initial" animate="animate" transition={{ duration: d(0.45), ease: theme.motion.ease }} data-testid="page-transition" data-preset={theme.motion.page}>
      {children}
    </motion.div>
  );
}
