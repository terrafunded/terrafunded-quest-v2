import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useRealm } from "@/data/useRealm";
import type { EventKind, RealmEvent } from "@/domain";
import { MilestoneCelebration } from "@/components/realm/MilestoneCelebration";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { date, money, moneyCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_META: Record<EventKind, { label: string; dot: string }> = {
  farm_acquired: { label: "Farm acquired", dot: "bg-oxygen" },
  reservation: { label: "Reservation", dot: "bg-stage-reserved" },
  closing: { label: "Closing", dot: "bg-stage-closed" },
  note_sale: { label: "Note sale", dot: "bg-stage-note_sold" },
  distribution: { label: "Distribution", dot: "bg-sponsor" },
  milestone: { label: "Milestone", dot: "bg-gold" },
  liberation: { label: "Liberation", dot: "bg-liberty" },
};

const FILTERS: (EventKind | "all")[] = ["all", "closing", "reservation", "note_sale", "distribution", "liberation", "farm_acquired"];
const PAGE = 60;

export default function Chronicle() {
  const { data, isLoading, error, refetch } = useRealm();
  const [filter, setFilter] = useState<EventKind | "all">("all");
  const [limit, setLimit] = useState(PAGE);

  const events = useMemo(() => {
    const all = data?.realm.events ?? [];
    const filtered = filter === "all" ? all : all.filter((e) => e.kind === filter || e.kind === "milestone");
    return [...filtered].reverse();
  }, [data, filter]);
  const narrative = data?.realm.narrative;

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const visible = events.slice(0, limit);

  return (
    <div>
      <PageHeader title="Chronicle" subtitle="Every real event, newest first, told as the scribes would tell it — each line from the row that produced it — with the running net profit and a celebration each time it crosses another million.">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : KIND_META[f].label}
            </Button>
          ))}
        </div>
      </PageHeader>
      <TableErrorsBanner errors={data.tableErrors} />

      {events.length === 0 ? (
        <EmptyState title="Nothing chronicled yet" />
      ) : (
        <ol className="relative ml-3 border-l border-border/70 pl-6 sm:ml-4 sm:pl-8" data-testid="chronicle">
          {visible.map((e, i) => (
            <li key={e.id} className="relative pb-6">
              <span className={cn("absolute -left-[31px] top-1.5 h-3 w-3 rounded-full ring-4 ring-background sm:-left-[39px]", KIND_META[e.kind].dot, e.future && "opacity-40")} />
              {e.kind === "milestone" ? (
                <MilestoneCelebration amount={e.milestone ?? 0} date={date(e.date)} caption={e.description} />
              ) : (
                <EventRow e={e} index={i} prose={narrative?.get(e.id)} />
              )}
            </li>
          ))}
        </ol>
      )}
      {events.length > limit && (
        <div className="text-center">
          <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
            Show older ({events.length - limit} more)
          </Button>
        </div>
      )}
    </div>
  );
}

function EventRow({ e, index, prose }: { e: RealmEvent; index: number; prose?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.4) }}
      className={cn("parchment-card flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between", e.future && "border-dashed opacity-70")}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>{date(e.date)}</span>
          <span>·</span>
          <span>{KIND_META[e.kind].label}</span>
          {e.future && <span className="text-oxygen">· upcoming</span>}
        </div>
        <p className="font-heading leading-snug" data-testid="chronicle-prose">
          {prose ?? e.title}
        </p>
        <div className="truncate text-xs text-muted-foreground">
          {e.title}
          {e.description ? ` · ${e.description}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end sm:gap-0">
        <span className="font-heading tabular">{e.amount !== null ? money(e.amount) : "—"}</span>
        <span className="whitespace-nowrap text-[11px] text-muted-foreground tabular">net to date {moneyCompact(e.cumulativeNetProfit)}</span>
      </div>
    </motion.div>
  );
}
