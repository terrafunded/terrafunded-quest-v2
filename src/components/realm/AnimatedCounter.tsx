import { useEffect, useRef, useState } from "react";
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
 * Tweens from the previous value to the new one with an exponential ease so
 * the last dollars tick in slowly, like coins settling. rAF-based, no canvas.
 */
export function AnimatedCounter({ value, format = defaultFormat, durationMs: baseDurationMs = 2200, className, ...rest }: AnimatedCounterProps) {
  const { theme } = useTheme();
  const durationMs = Math.round(baseDurationMs * theme.motion.scale);
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    const to = value;
    if (reduce || durationMs <= 0) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const v = from + (to - from) * easeOutExpo(t);
      setDisplay(v);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value, durationMs]);

  // `.counter` paints the final value invisibly (::before, from data-final) in the same grid cell,
  // so the box already has its finished width while the digits tick up: no layout shift from a
  // centred number growing.
  return (
    <span
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
