import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useTheme } from "@/theme/ThemeProvider";
import { PAGE_PRESETS } from "./pagePresets";

export function PageTransition({ children, routeKey }: { children: ReactNode; routeKey: string }) {
  const { theme, d } = useTheme();
  const preset = PAGE_PRESETS[theme.motion.page];
  return (
    <motion.div key={routeKey} variants={preset} initial="initial" animate="animate" transition={{ duration: d(0.45), ease: theme.motion.ease }} data-testid="page-transition" data-preset={theme.motion.page}>
      {children}
    </motion.div>
  );
}
