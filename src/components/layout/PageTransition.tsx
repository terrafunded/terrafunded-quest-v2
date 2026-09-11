import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { useTheme } from "@/theme/ThemeProvider";
import type { MotionLanguage } from "@/theme/themes";

/**
 * Three ways to enter a page. Iron Crown rises slowly out of the stone; Gilded Realm turns like a
 * leaf of a manuscript; Neon Kingdom snaps in from the side with a HUD wipe.
 */
const PRESETS: Record<MotionLanguage["page"], Variants> = {
  rise: {
    initial: { opacity: 0, y: 18, filter: "blur(2px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  },
  turn: {
    initial: { opacity: 0, x: 12, rotateY: -4, transformPerspective: 1200, transformOrigin: "left center" },
    animate: { opacity: 1, x: 0, rotateY: 0, transformPerspective: 1200 },
  },
  hud: {
    initial: { opacity: 0, x: -14, clipPath: "inset(0 0 0 10%)" },
    animate: { opacity: 1, x: 0, clipPath: "inset(0 0 0 0%)" },
  },
};

export function PageTransition({ children, routeKey }: { children: ReactNode; routeKey: string }) {
  const { theme, d } = useTheme();
  const preset = PRESETS[theme.motion.page];
  return (
    <motion.div key={routeKey} variants={preset} initial="initial" animate="animate" transition={{ duration: d(0.45), ease: theme.motion.ease }} data-testid="page-transition" data-preset={theme.motion.page}>
      {children}
    </motion.div>
  );
}
