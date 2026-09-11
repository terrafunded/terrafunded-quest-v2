import { useMemo, useState } from "react";
import { useRealm } from "@/data/useRealm";
import type { QualityIssue, QualitySeverity } from "@/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";

const SEVERITIES: (QualitySeverity | "all")[] = ["all", "error", "warning", "info"];

export default function Quality() {
  const { data, isLoading, error, refetch } = useRealm();
  const [severity, setSeverity] = useState<QualitySeverity | "all">("all");

  const issues = useMemo(() => {
    const all = data?.realm.quality ?? [];
    return severity === "all" ? all : all.filter((i) => i.severity === severity);
  }, [data, severity]);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const counts = data.realm.quality.reduce(
    (acc, i) => {
      acc[i.severity] += 1;
      return acc;
    },
    { error: 0, warning: 0, info: 0 } as Record<QualitySeverity, number>,
  );

  return (
    <div>
      <PageHeader
        title="Data Quality"
        subtitle="Every place Payments disagrees with itself. Nothing here is hidden or corrected; Quest applies the GOAL.md price rule (note wins) and shows the disagreement."
      >
        <div className="flex flex-wrap gap-1">
          {SEVERITIES.map((s) => (
            <Button key={s} size="sm" variant={severity === s ? "default" : "outline"} onClick={() => setSeverity(s)}>
              {s === "all" ? `All ${data.realm.quality.length}` : `${s} ${counts[s]}`}
            </Button>
          ))}
        </div>
      </PageHeader>
      <TableErrorsBanner errors={data.tableErrors} />

      {issues.length === 0 ? (
        <EmptyState title="Clean" body="No disagreements at this severity." />
      ) : (
        <ul className="space-y-2" data-testid="quality-list">
          {issues.map((i) => (
            <IssueRow key={i.id} issue={i} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: QualityIssue }) {
  const details = Object.entries(issue.details).filter(([, v]) => v !== null && v !== undefined && v !== "");
  return (
    <li className="parchment-card p-4" data-testid="quality-issue" data-kind={issue.kind}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={issue.severity}>{issue.severity}</Badge>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{issue.kind.replace(/_/g, " ")}</span>
        {issue.farmName && <span className="text-xs text-muted-foreground">· {issue.farmName}</span>}
      </div>
      <div className="mt-1.5 font-medium">{issue.lotName ?? issue.farmName ?? "Realm"}</div>
      <p className="mt-0.5 text-sm text-muted-foreground">{issue.message}</p>
      {details.length > 0 && (
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {details.map(([k, v]) => (
            <div key={k} className="flex gap-1">
              <dt className="text-muted-foreground">{k}:</dt>
              <dd className="tabular">{typeof v === "number" ? v.toLocaleString("en-US") : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
