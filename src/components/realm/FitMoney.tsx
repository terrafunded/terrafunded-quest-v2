import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { money, moneyCompact } from "@/lib/format";
import { AnimatedCounter } from "./AnimatedCounter";

/**
 * Hero money that stays on one line. Tries the full `$2,272,304` form first; if that overflows
 * the container (phones at 360px), falls back to compact `$2.27M`. The full value is always
 * available via title/aria-label.
 */
export function FitMoney({
  value,
  className,
  "data-testid": testId,
}: {
  value: number;
  className?: string;
  "data-testid"?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    if (!wrap || !measure) return;

    const check = () => {
      // Measure the full formatted string in the same typeface at the computed size.
      measure.textContent = money(value);
      measure.style.fontSize = getComputedStyle(wrap).fontSize;
      const overflows = measure.scrollWidth > wrap.clientWidth - 4;
      setCompact(overflows);
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [value]);

  const full = money(value);
  return (
    <div ref={wrapRef} className={cn("relative w-full overflow-hidden whitespace-nowrap", className)} title={full} aria-label={full}>
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 font-display opacity-0"
        style={{ whiteSpace: "nowrap" }}
      />
      <AnimatedCounter value={value} format={compact ? moneyCompact : money} data-testid={testId} />
    </div>
  );
}

/** Ellipsized name that reveals the full value on tap/focus. */
export function Ellipsize({ children, className }: { children: ReactNode; className?: string }) {
  const text = typeof children === "string" ? children : undefined;
  const [open, setOpen] = useState(false);
  if (!text) {
    return <span className={cn("block truncate", className)}>{children}</span>;
  }
  return (
    <span
      role="button"
      tabIndex={0}
      className={cn("ellipsize-tap", open ? "whitespace-normal break-words" : "truncate", className)}
      title={text}
      aria-expanded={open}
      aria-label={open ? text : `Show full name: ${text}`}
      onClick={() => setOpen((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
      onBlur={() => setOpen(false)}
    >
      {text}
    </span>
  );
}
