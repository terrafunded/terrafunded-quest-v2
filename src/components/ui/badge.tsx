import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide transition-colors", {
  variants: {
    variant: {
      default: "border-transparent bg-primary text-primary-foreground",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      outline: "text-foreground",
      available: "border-stage-available/40 bg-stage-available/15 text-stage-available",
      reserved: "border-stage-reserved/40 bg-stage-reserved/15 text-stage-reserved",
      closed: "border-stage-closed/40 bg-stage-closed/15 text-stage-closed",
      note_sold: "border-stage-note_sold/40 bg-stage-note_sold/15 text-stage-note_sold",
      error: "border-destructive/40 bg-destructive/15 text-ember",
      warning: "border-stage-reserved/40 bg-stage-reserved/15 text-stage-reserved",
      info: "border-border bg-muted text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
