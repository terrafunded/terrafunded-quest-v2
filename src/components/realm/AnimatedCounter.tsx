import { useEffect, useRef, useState } from "react";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme/ThemeProvider";

interface AnimatedCounterProps {
  value: number;
  /** Formats the in-flight number. Defaults to whole-dollar USD. */
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
  "data-testid"?: string;
}

const defaultFormat = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Counts up from zero with an exponential ease so the last dollars tick in slowly, like coins
 * settling. rAF-based, no canvas.
 *
 * The count starts the first time the element is on screen, not on mount, so a counter below the
 * fold still performs when the user scrolls to it. It runs once: later value changes (a new exit
 * horizon, a language switch) snap to the new figure instead of replaying the reveal.
 */
export function AnimatedCounter({ value, format = defaultFormat, durationMs: baseDurationMs = 2200, className, ...rest }: AnimatedCounterProps) {
  const { theme } = useTheme();
  const durationMs = Math.round(baseDurationMs * theme.motion.scale);
  const [ref, inView] = useInViewOnce<HTMLSpanElement>();
  const [display, setDisplay] = useState(0);
  const revealed = useRef(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!inView) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const to = value;
    if (reduce || durationMs <= 0 || revealed.current) {
      revealed.current = true;
      setDisplay(to);
      return;
    }
    revealed.current = true;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setDisplay(to * easeOutExpo(t));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value, durationMs, inView]);

  // `.counter` paints the final value invisibly (::before, from data-final) in the same grid cell,
  // so the box already has its finished width while the digits tick up: no layout shift from a
  // centred number growing.
  return (
    <span
      ref={ref}
      className={cn("counter tabular counter-glow", className)}
      data-value={Math.round(display)}
      data-target={Math.round(value)}
      data-final={format(value)}
      {...rest}
    >
      <span className="counter-live">{format(display)}</span>
    </span>
  );
}
