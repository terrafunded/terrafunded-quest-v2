import type { ReactNode } from "react";
import type { LotStage } from "@/domain";
import { Badge } from "@/components/ui/badge";
import { STAGE_LABEL } from "@/lib/format";

export function StageBadge({ stage, className, children }: { stage: LotStage; className?: string; children?: ReactNode }) {
  return (
    <Badge variant={stage} className={className}>
      {STAGE_LABEL[stage] ?? stage}
      {children !== undefined && <span className="ml-1 tabular">{children}</span>}
    </Badge>
  );
}
