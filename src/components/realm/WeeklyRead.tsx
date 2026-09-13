import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COUNCIL_UI, formatWeeklyGeneratedAt, type CouncilUiStrings } from "@/i18n/council";
import type { QualityLang } from "@/domain/quality_human";
import type { WeeklyCouncilResponse } from "@/data/useWeeklyCouncil";

interface WeeklyReadProps {
  lang: QualityLang;
  response: WeeklyCouncilResponse | undefined;
  limit?: Extract<WeeklyCouncilResponse, { ok: false }>;
  loading: boolean;
  regenerating: boolean;
  onRegenerate: () => void;
}

export function WeeklyRead({ lang, response, limit, loading, regenerating, onRegenerate }: WeeklyReadProps) {
  const t = COUNCIL_UI[lang];
  const ok = response?.ok === true ? response : null;
  const limitHit = limit?.reason === "regenerate_limit";
  const unavailable = !loading && !ok && !limitHit;

  return (
    <section
      aria-label={t.weeklyLabel}
      data-testid="weekly-read"
      data-source="written"
      className="mb-8 rounded-lg border-2 border-gold/55 bg-gold/5 p-5 sm:p-6"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="stat-label text-gold" data-testid="weekly-read-label">
            {t.weeklyLabel} · {t.weeklyWritten}
          </p>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="weekly-read-disclaimer">
            {t.disclaimer}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          disabled={regenerating || loading}
          data-testid="weekly-read-regenerate"
          aria-busy={regenerating}
        >
          {regenerating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {regenerating ? t.regenerating : t.regenerate}
        </Button>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground" data-testid="weekly-read-loading" role="status">
          {t.regenerating}
        </p>
      )}

      {limitHit && (
        <p className="mb-3 text-sm text-stage-reserved" data-testid="weekly-read-limit" role="status">
          {t.limit(limit?.limit ?? 10)}
        </p>
      )}

      {unavailable && (
        <p className="text-sm text-muted-foreground" data-testid="weekly-read-unavailable">
          {t.unavailable}
        </p>
      )}

      {ok && <WeeklyReadBody t={t} lang={lang} response={ok} />}
    </section>
  );
}

function WeeklyReadBody({
  t,
  lang,
  response,
}: {
  t: CouncilUiStrings;
  lang: QualityLang;
  response: Extract<WeeklyCouncilResponse, { ok: true }>;
}) {
  const { read } = response;
  return (
    <div data-testid="weekly-read-body">
      <h2 className="font-display text-2xl leading-tight text-gold sm:text-3xl" data-testid="weekly-read-headline">
        {read.headline}
      </h2>
      <ol className="mt-5 list-decimal space-y-4 pl-5" data-testid="weekly-read-actions">
        {read.actions.map((a, i) => (
          <li key={`${i}-${a.action}`} className="pl-1" data-testid="weekly-read-action">
            <p className="font-heading text-base leading-snug">{a.action}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="text-[11px] uppercase tracking-[0.14em]">{t.why}.</span> {a.why}
            </p>
            <p className="mt-0.5 text-sm text-gold/90">
              <span className="text-[11px] uppercase tracking-[0.14em]">{t.worth}.</span> {a.worth}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-5 border-t border-gold/25 pt-4 text-sm" data-testid="weekly-read-watch">
        <span className="stat-label mr-2 text-gold">{t.watchOut}</span>
        {read.watch_out}
      </p>
      <p className="mt-3 text-xs text-muted-foreground" data-testid="weekly-read-generated">
        {t.generated(formatWeeklyGeneratedAt(response.generatedAt, lang))}
      </p>
    </div>
  );
}
