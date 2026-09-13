import type { ReactNode } from "react";
import type { LotStage } from "@/domain";
import { Badge } from "@/components/ui/badge";
import { useRealmStrings } from "@/i18n/realm";

export function StageBadge({ stage, className, children }: { stage: LotStage; className?: string; children?: ReactNode }) {
  const t = useRealmStrings().stage;
  return (
    <Badge variant={stage} className={className}>
      {t[stage] ?? stage}
      {children !== undefined && <span className="ml-1 tabular">{children}</span>}
    </Badge>
  );
}
