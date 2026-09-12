import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw, ScrollText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { PaymentsQueryError } from "@/data/queries";
import { useRealmStrings } from "@/i18n/realm";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="page-title font-display text-2xl text-gold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function LoadingState({ rows = 6 }: { rows?: number }) {
  const t = useRealmStrings().pageStates;
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label={t.loading}>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: ReactNode }) {
  return (
    <div className="parchment-card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <ScrollText className="h-8 w-8 text-muted-foreground" />
      <h2 className="font-heading text-lg">{title}</h2>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const t = useRealmStrings().pageStates;
  return (
    <div className="parchment-card flex flex-col items-center gap-3 border-destructive/40 px-6 py-12 text-center" role="alert">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <h2 className="font-heading text-lg">{t.errorTitle}</h2>
      <p className="max-w-lg break-words text-sm text-muted-foreground">{error.message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> {t.retry}
        </Button>
      )}
    </div>
  );
}

export function TableErrorsBanner({ errors }: { errors: PaymentsQueryError[] }) {
  const t = useRealmStrings().pageStates;
  if (errors.length === 0) return null;
  return (
    <div className="mb-4 rounded-md border border-stage-reserved/40 bg-stage-reserved/10 px-4 py-3 text-sm" role="alert">
      <div className="flex items-center gap-2 font-medium text-stage-reserved">
        <AlertTriangle className="h-4 w-4" /> {t.partialTables}
      </div>
      <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
        {errors.map((e) => (
          <li key={e.table}>
            <code>{e.table}</code>: {e.code ?? t.error} — {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
