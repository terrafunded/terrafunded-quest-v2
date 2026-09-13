import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Insight, InsightSeverity } from "@/domain/council";
import { COUNCIL_UI } from "@/i18n/council";
import type { QualityLang } from "@/domain/quality_human";
import { cn } from "@/lib/utils";

const SEVERITY_VARIANT: Record<InsightSeverity, "error" | "warning" | "closed"> = {
  critical: "error",
  warning: "warning",
  ok: "closed",
};

interface CouncilInsightsProps {
  insights: Insight[];
  lang: QualityLang;
}

export function CouncilInsights({ insights, lang }: CouncilInsightsProps) {
  const t = COUNCIL_UI[lang];
  const severityLabel: Record<InsightSeverity, string> = {
    critical: t.critical,
    warning: t.warning,
    ok: t.ok,
  };

  return (
    <section aria-label={t.ledgerLabel} data-testid="council-insights" data-source="ledger">
      <div className="mb-3">
        <p className="stat-label" data-testid="council-insights-label">
          {t.ledgerLabel}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t.ledgerHint}</p>
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {insights.map((insight) => (
          <li key={insight.id}>
            <article
              className="parchment-card flex h-full flex-col p-4"
              data-testid="council-insight"
              data-rule={insight.rule}
              data-severity={insight.severity}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={SEVERITY_VARIANT[insight.severity]}>{severityLabel[insight.severity]}</Badge>
                <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{insight.rule}</span>
              </div>
              <h3 className="mt-2 font-heading text-lg leading-snug">{insight.title}</h3>
              <p className="mt-1.5 flex-1 text-sm text-muted-foreground">{insight.body}</p>
              {(insight.impact.dollars || insight.impact.days) && (
                <p className="mt-2 text-xs text-gold/90">
                  {t.worth}: {[insight.impact.dollars, insight.impact.days].filter(Boolean).join(" · ")}
                </p>
              )}
              {insight.href && (
                <Link
                  to={insight.href}
                  className={cn("touch-link mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground")}
                >
                  {t.open} <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
