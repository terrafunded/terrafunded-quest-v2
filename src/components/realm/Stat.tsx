import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
  valueClassName?: string;
  "data-testid"?: string;
}

export function Stat({ label, value, hint, className, valueClassName, ...rest }: StatProps) {
  return (
    <div className={cn("parchment-card p-4", className)} {...rest}>
      <div className="stat-label">{label}</div>
      <div className={cn("mt-1.5 font-heading text-xl tabular sm:text-2xl", valueClassName)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
