import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardCheck, Copy, Download, Eye, EyeOff } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import { useFarmGeometries } from "@/data/useFarmGeometry";
import { useHorizon } from "@/horizon/HorizonProvider";
import { buildPlatformExport, downloadPlatformExport } from "@/lib/platformExport";
import {
  groupIssuesByLot,
  humanDate,
  humanMoney,
  parcelGeometryIssues,
  reconcileParcels,
  severityLabel,
  summarizeQuality,
  valuesLine,
  whatsappForAll,
  whatsappForCard,
  type HumanIssue,
  type LotCard,
  type QualityLang,
  type QualitySeverity,
} from "@/domain";
import { useLang } from "@/i18n/lang";
import { QUALITY_UI, type QualityUiStrings } from "@/i18n/quality";
import { useReviewState } from "@/lib/qualityReview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { cn } from "@/lib/utils";

const SEVERITIES: QualitySeverity[] = ["error", "warning", "info"];
const SEVERITY_DOT: Record<QualitySeverity, string> = { error: "bg-ember", warning: "bg-stage-reserved", info: "bg-muted-foreground" };

/** Copies plain text; falls back to a hidden textarea when the async clipboard is unavailable. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

type CopyStatus = "idle" | "copied" | "failed";

function useCopy(): [CopyStatus, (text: string) => void] {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  const copy = useCallback((text: string) => {
    void copyText(text).then((ok) => {
      setStatus(ok ? "copied" : "failed");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setStatus("idle"), 2200);
    });
  }, []);
  return [status, copy];
}

export default function Quality() {
  const { data, isLoading, error, refetch } = useRealm();
  const [lang] = useLang();
  const { horizon } = useHorizon();
  const t = QUALITY_UI[lang];
  const [severity, setSeverity] = useState<QualitySeverity | "all">("all");
  const [showReviewed, setShowReviewed] = useState(true);
  const { state, update, reviewed } = useReviewState();
  const [allStatus, copyAll] = useCopy();

  const exportEverything = useCallback(() => {
    if (!data) return;
    const commitSha =
      (import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA as string | undefined) ??
      (import.meta.env.VITE_GIT_COMMIT_SHA as string | undefined) ??
      "local";
    const doc = buildPlatformExport(data.realm, {
      lang,
      exitHorizon: horizon,
      commitSha,
      appVersion: "2.0.0",
    });
    downloadPlatformExport(doc);
  }, [data, lang, horizon]);

  const asOf = data?.realm.goal.asOf ?? new Date().toISOString().slice(0, 10);
  // The Realm's parcel maps are asserted against the ledger per farm; a drawing that disagrees is
  // reported here from the same reconcile function the Realm uses to decide on its fallback.
  const farms = useMemo(() => data?.realm.farms ?? [], [data]);
  const farmNames = useMemo(() => farms.map((f) => f.name), [farms]);
  const geometries = useFarmGeometries(farmNames);
  const parcelIssues = useMemo(() => parcelGeometryIssues(farms.map((farm, i) => reconcileParcels(farm, geometries[i]?.status === "ready" ? geometries[i].geometry : null))), [farms, geometries]);
  const cards = useMemo(() => groupIssuesByLot([...(data?.realm.quality ?? []), ...parcelIssues], lang), [data, parcelIssues, lang]);
  const summary = useMemo(() => summarizeQuality(cards, asOf, reviewed), [cards, asOf, reviewed]);
  const counts = useMemo(() => {
    const c: Record<QualitySeverity, number> = { error: 0, warning: 0, info: 0 };
    for (const card of cards) for (const i of card.issues) c[i.severity] += 1;
    return c;
  }, [cards]);

  const visible = useMemo(() => {
    return cards
      .map((card) => {
        const issues = card.issues.filter((i) => (severity === "all" || i.severity === severity) && (showReviewed || !reviewed.has(i.reviewKey)));
        return issues.length === 0 ? null : { ...card, issues };
      })
      .filter((c): c is LotCard => c !== null);
  }, [cards, severity, showReviewed, reviewed]);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const hiddenByReview = !showReviewed && visible.length === 0 && cards.some((c) => c.issues.some((i) => severity === "all" || i.severity === severity));
  const visibleIssues = visible.reduce((a, c) => a + c.issues.length, 0);

  return (
    <div lang={lang} data-testid="quality-page" data-lang={lang}>
      <PageHeader title={t.title} subtitle={t.subtitle}>
        <Button
          variant="outline"
          size="sm"
          onClick={exportEverything}
          data-testid="quality-export-all"
        >
          <Download /> {t.exportAll}
        </Button>
        <Button variant="outline" size="sm" onClick={() => copyAll(whatsappForAll(visible, summary, asOf, { reviewed, includeReviewed: showReviewed }))} data-testid="quality-copy-all" data-status={allStatus}>
          {allStatus === "copied" ? <ClipboardCheck /> : <Copy />} {allStatus === "copied" ? t.copied : allStatus === "failed" ? t.copyFailed : t.copyAll}
        </Button>
      </PageHeader>
      <TableErrorsBanner errors={data.tableErrors} />

      <section aria-label={t.title} className="mb-6 grid gap-3 sm:grid-cols-3" data-testid="quality-summary">
        <div className="parchment-card p-4">
          <div className="stat-label">{t.lotsWithIssues}</div>
          <div className="mt-1.5 font-heading text-2xl tabular" data-testid="quality-summary-lots" data-value={summary.lotsWithIssues}>
            {summary.lotsWithIssues}
            {summary.farmsWithIssues > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">{t.andFarms(summary.farmsWithIssues)}</span>}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{t.totals(cards.length, summary.issues)}</div>
        </div>
        <div className="parchment-card p-4">
          <div className="stat-label">{t.profitAffected}</div>
          <div className="mt-1.5 font-heading text-2xl tabular text-ember" data-testid="quality-summary-dollars" data-value={summary.priceMismatchDollars}>
            {humanMoney(summary.priceMismatchDollars, lang)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{t.profitAffectedHint(summary.priceMismatches)}</div>
        </div>
        <div className="parchment-card p-4">
          <div className="stat-label">{t.oldest}</div>
          <div className="mt-1.5 truncate font-heading text-2xl" data-testid="quality-summary-oldest">
            {summary.oldest ? summary.oldest.card.title : summary.unresolved === 0 ? t.oldestNone : "—"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {summary.oldest ? `${summary.oldest.issue.title} · ${t.oldestHint(summary.oldest.days, humanDate(summary.oldest.since, lang))}` : summary.unresolved === 0 ? "" : t.oldestUndated}
          </div>
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label={t.all} data-testid="quality-filters">
        <Button size="sm" variant={severity === "all" ? "default" : "outline"} aria-pressed={severity === "all"} onClick={() => setSeverity("all")}>
          {t.all} {summary.issues}
        </Button>
        {SEVERITIES.map((s) => (
          <Button key={s} size="sm" variant={severity === s ? "default" : "outline"} aria-pressed={severity === s} onClick={() => setSeverity(s)} data-testid={`quality-filter-${s}`}>
            {severityLabel(s, lang)} {counts[s]}
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setShowReviewed((v) => !v)} aria-pressed={!showReviewed} data-testid="quality-toggle-reviewed">
          {showReviewed ? <EyeOff /> : <Eye />} {showReviewed ? t.hideReviewed : t.showReviewed}
          {reviewed.size > 0 && <span className="text-muted-foreground"> · {reviewed.size}</span>}
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState title={hiddenByReview ? t.reviewed : t.empty} body={hiddenByReview ? t.allReviewedBody : t.emptyBody} />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground" data-testid="quality-visible-count">
            {t.totals(visible.length, visibleIssues)} · {t.whatsappHint}
          </p>
          <ul className="space-y-3" data-testid="quality-list">
            {visible.map((card) => (
              <LotCardView key={card.key} card={card} lang={lang} t={t} reviewed={reviewed} notes={state} onUpdate={update} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

interface CardProps {
  card: LotCard;
  lang: QualityLang;
  t: QualityUiStrings;
  reviewed: ReadonlySet<string>;
  notes: Record<string, { note: string }>;
  onUpdate: (key: string, patch: { reviewed?: boolean; note?: string }) => void;
}

function LotCardView({ card, lang, t, reviewed, notes, onUpdate }: CardProps) {
  const [status, copy] = useCopy();
  const done = card.issues.filter((i) => reviewed.has(i.reviewKey)).length;
  const allDone = done === card.issues.length;
  return (
    <li
      className={cn("parchment-card overflow-hidden", card.severity === "error" && !allDone && "border-destructive/40", allDone && "opacity-80")}
      data-testid="quality-card"
      data-lot={card.title}
      data-farm={card.farmName ?? ""}
      data-severity={card.severity}
      data-reviewed={allDone}
    >
      <div className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={card.severity}>{severityLabel(card.severity, lang)}</Badge>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{card.isFarm ? t.farm : t.lot}</span>
            {!card.isFarm && card.farmName && <span className="text-xs text-muted-foreground">· {card.farmName}</span>}
          </div>
          <h2 className="mt-1.5 break-words font-heading text-lg leading-snug" data-testid="quality-card-title">
            {card.title}
          </h2>
          <div className="mt-0.5 text-xs text-muted-foreground tabular">
            {t.issues(card.issues.length)} · <span className={cn(allDone && "text-stage-closed")}>{t.reviewedOf(done, card.issues.length)}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 self-start" onClick={() => copy(whatsappForCard(card))} data-testid="quality-copy-card" data-status={status}>
          {status === "copied" ? <ClipboardCheck /> : <Copy />} {status === "copied" ? t.copied : status === "failed" ? t.copyFailed : t.copyCard}
        </Button>
      </div>
      <ol className="divide-y divide-border/60">
        {card.issues.map((issue) => (
          <IssueView key={issue.id} issue={issue} lang={lang} t={t} isReviewed={reviewed.has(issue.reviewKey)} note={notes[issue.reviewKey]?.note ?? ""} onUpdate={onUpdate} />
        ))}
      </ol>
    </li>
  );
}

interface IssueProps {
  issue: HumanIssue;
  lang: QualityLang;
  t: QualityUiStrings;
  isReviewed: boolean;
  note: string;
  onUpdate: (key: string, patch: { reviewed?: boolean; note?: string }) => void;
}

function IssueView({ issue, lang, t, isReviewed, note, onUpdate }: IssueProps) {
  const [draft, setDraft] = useState(note);
  useEffect(() => setDraft(note), [note]);
  const commit = () => {
    if (draft !== note) onUpdate(issue.reviewKey, { note: draft });
  };
  const noteId = `note-${issue.id}`;
  return (
    <li className={cn("p-4", isReviewed && "bg-stage-closed/5")} data-testid="quality-issue" data-kind={issue.kind} data-severity={issue.severity} data-reviewed={isReviewed}>
      <div className="flex items-start gap-2">
        <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[issue.severity])} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <h3 className={cn("font-medium leading-snug", isReviewed && "line-through decoration-muted-foreground/60")} data-testid="quality-issue-title">
              {issue.title}
            </h3>
            {issue.since && <span className="text-xs text-muted-foreground tabular">{t.since(humanDate(issue.since, lang))}</span>}
          </div>
          <p className="mt-1 text-sm text-foreground/85">{issue.explanation}</p>

          {issue.values && (
            <div className="mt-3 grid grid-cols-2 gap-2" data-testid="quality-values" data-line={valuesLine(issue.values) ?? ""}>
              <ValueBox label={issue.values.left.label} value={issue.values.left.value} />
              <ValueBox label={issue.values.right.label} value={issue.values.right.value} />
            </div>
          )}

          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground sm:pt-0.5">{t.check}</dt>
            <dd>{issue.check}</dd>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground sm:pt-0.5">{t.fix}</dt>
            <dd className="break-words font-medium" data-testid="quality-fix">
              {issue.fix}
            </dd>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground sm:pt-0.5">{t.quest}</dt>
            <dd className="text-muted-foreground" data-testid="quality-using">
              {issue.using}
            </dd>
          </dl>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              role="checkbox"
              aria-checked={isReviewed}
              aria-label={`${t.markReviewed}: ${issue.title}`}
              onClick={() => onUpdate(issue.reviewKey, { reviewed: !isReviewed })}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm transition-colors",
                isReviewed ? "border-stage-closed/50 bg-stage-closed/10 text-stage-closed" : "border-border/70 text-foreground hover:border-gold/40 hover:bg-secondary/40",
              )}
              data-testid="quality-reviewed"
            >
              <span className={cn("flex h-5 w-5 items-center justify-center rounded border", isReviewed ? "border-stage-closed bg-stage-closed text-background" : "border-muted-foreground/60")} aria-hidden>
                {isReviewed && <Check className="h-3.5 w-3.5" />}
              </span>
              {t.reviewed}
            </button>
            <div className="min-w-0 flex-1">
              <label htmlFor={noteId} className="sr-only">
                {t.note}
              </label>
              <Input
                id={noteId}
                value={draft}
                placeholder={`${t.note}: ${t.notePlaceholder}`}
                maxLength={280}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                data-testid="quality-note"
              />
            </div>
          </div>

          <details className="mt-2 text-xs" data-testid="quality-technical">
            <summary className="flex min-h-11 cursor-pointer select-none items-center gap-1 text-muted-foreground hover:text-foreground">{t.technical}</summary>
            <div className="rounded-md bg-background/50 p-3 font-mono text-[12px] leading-relaxed">
              <div className="break-words">{issue.technical.message}</div>
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
                <dt className="text-muted-foreground">kind</dt>
                <dd>{issue.technical.kind}</dd>
                <dt className="text-muted-foreground">id</dt>
                <dd className="break-all">{issue.technical.id}</dd>
                {issue.technical.details.map(([k, v]) => (
                  <Fragment key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="break-all">{v}</dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          </details>
        </div>
      </div>
    </li>
  );
}

function ValueBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-background/50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="break-words font-heading text-base tabular sm:text-lg">{value}</div>
    </div>
  );
}
