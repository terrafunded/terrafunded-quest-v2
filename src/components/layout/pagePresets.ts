import type { Variants } from "framer-motion";
import type { MotionLanguage } from "@/theme/themes";

/**
 * After the enter animation, drop filter/transform so the page wrapper is not a containing block
 * for `position: fixed` descendants. `filter: blur(0px)` still traps fixed children.
 */
export const PAGE_TRANSITION_CLEAR = { filter: "none", transform: "none" } as const;

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
