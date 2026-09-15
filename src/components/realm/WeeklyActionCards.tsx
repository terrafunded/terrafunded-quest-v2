import { useState } from "react";
import { Link } from "react-router-dom";
import { WEEKLY_ACTION_OWNERS } from "@/config/weeklyActionOwners";
import type { FrozenWeeklyAction, WeeklyActionStatus } from "@/domain/weeklyActions";
import { actionTitle, actionWhy, scoreClipboardPayload, useWeeklyActionsStrings } from "@/i18n/weeklyActions";
import { useLang } from "@/i18n/lang";
import { number } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface WeeklyActionCardsProps {
  actions: FrozenWeeklyAction[];
  compact?: boolean;
  onStatus: (actionId: string, status: WeeklyActionStatus, reason?: string) => void;
  showDismissed?: boolean;
}

export function WeeklyActionCards({ actions, compact, onStatus, showDismissed }: WeeklyActionCardsProps) {
  const t = useWeeklyActionsStrings();
  const [lang] = useLang();
  const visible = showDismissed ? actions : actions.filter((a) => a.status !== "dismissed");

  return (
    <ul
      className={cn("grid gap-3", compact ? "md:grid-cols-3" : "lg:grid-cols-2")}
      data-testid="weekly-actions"
      data-compact={compact ? "true" : "false"}
    >
      {visible.map((action) => (
        <li key={action.id}>
          <WeeklyActionCard action={action} compact={compact} onStatus={onStatus} lang={lang} t={t} />
        </li>
      ))}
    </ul>
  );
}

function WeeklyActionCard({
  action,
  compact,
  onStatus,
  lang,
  t,
}: {
  action: FrozenWeeklyAction;
  compact?: boolean;
  onStatus: (actionId: string, status: WeeklyActionStatus, reason?: string) => void;
  lang: "en" | "es";
  t: ReturnType<typeof useWeeklyActionsStrings>;
}) {
  const [openFormula, setOpenFormula] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  const [copied, setCopied] = useState(false);
  const owner = WEEKLY_ACTION_OWNERS[action.detector] ?? "";
  const title = actionTitle(lang, action.titleKey, action.titleParams);
  const why = actionWhy(lang, action.whyKey, action.whyParams);
  const daysWord = action.daysLabel === "parked" ? t.daysParked : t.days;

  async function copyScore() {
    if (!owner) return;
    const payload = scoreClipboardPayload(owner, action.scoreDescription);
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article
      className={cn(
        "parchment-card flex h-full flex-col border border-border/70 bg-card/80",
        compact ? "p-3" : "p-4",
        action.status === "done" && "opacity-70",
        action.status === "dismissed" && "opacity-60",
      )}
      data-testid="weekly-action-card"
      data-detector={action.detector}
      data-status={action.status}
      data-id={action.id}
    >
      <button
        type="button"
        className="text-left"
        onClick={() => setOpenFormula((v) => !v)}
        aria-expanded={openFormula}
        data-testid="weekly-action-days"
      >
        <div className={cn("font-display leading-none text-gold", compact ? "text-3xl" : "text-4xl")}>
          {number(action.daysTowardGoal)}
        </div>
        <div className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{daysWord}</div>
      </button>
      <h3 className={cn("mt-2 font-heading leading-snug", compact ? "text-base" : "text-lg")}>{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{why}</p>
      {openFormula && (
        <dl className="mt-2 grid gap-1 text-xs text-muted-foreground" data-testid="weekly-action-formula">
          <div>
            <dt className="stat-label">{t.formula}</dt>
            <dd className="tabular">{action.formula.expression}</dd>
          </div>
          <dd className="tabular">
            {action.formula.dollars} ÷ {action.formula.requiredNetProfitPerDay}
            {action.formula.conversionPct !== null ? ` × ${action.formula.conversionPct}%` : ""}
          </dd>
        </dl>
      )}
      {action.status === "dismissed" && action.dismissReason && (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="weekly-action-dismiss-reason">
          {action.dismissReason}
        </p>
      )}
      <div className={cn("mt-3 flex flex-wrap gap-2", compact && "gap-1.5")}>
        <Button asChild variant="outline" size="sm">
          <Link to={action.href} data-testid="weekly-action-view">
            {t.viewRecords}
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!owner}
          onClick={() => void copyScore()}
          data-testid="weekly-action-score"
        >
          {owner ? (copied ? t.copied : t.sendToScore) : t.assignOwner}
        </Button>
        {action.status === "pending" && (
          <>
            <Button type="button" size="sm" onClick={() => onStatus(action.id, "done")} data-testid="weekly-action-done">
              {t.done}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDismissing(true)} data-testid="weekly-action-dismiss">
              {t.dismiss}
            </Button>
          </>
        )}
      </div>
      {dismissing && (
        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return;
            onStatus(action.id, "dismissed", reason.trim());
            setDismissing(false);
          }}
        >
          <label className="text-xs text-muted-foreground">
            {t.dismissReason}
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="weekly-action-dismiss-reason-input"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!reason.trim()} data-testid="weekly-action-dismiss-save">
              {t.dismissConfirm}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDismissing(false)}>
              {t.cancel}
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}
