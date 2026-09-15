import { Download } from "lucide-react";
import type { ReservationAging } from "@/domain";
import { AGING_BUCKETS, buildScoreTasks } from "@/domain";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePipelineStrings } from "@/i18n/pipeline";
import { money, number } from "@/lib/format";
import { cn } from "@/lib/utils";

function downloadScoreTasks(aging: ReservationAging, asOf: Date) {
  const tasks = buildScoreTasks(aging.stuck, asOf);
  const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "score-tasks.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function ReservationAgingSection({ aging, asOf }: { aging: ReservationAging; asOf: Date }) {
  const t = usePipelineStrings().aging;
  const bucketLabel = {
    "0-30": t.bucket0,
    "31-60": t.bucket31,
    "61-90": t.bucket61,
    "90+": t.bucket90,
  } as const;

  return (
    <section className="mb-6 space-y-4" data-testid="reservation-aging" aria-label={t.title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.title}</h2>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{t.subtitle}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => downloadScoreTasks(aging, asOf)}
          disabled={aging.stuckCount === 0}
          data-testid="export-score-tasks"
        >
          <Download /> {t.exportTasks}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {AGING_BUCKETS.map((id) => (
          <div key={id} className="parchment-card p-4" data-testid={`aging-bucket-${id}`}>
            <div className="stat-label">{bucketLabel[id]}</div>
            <div className="mt-1 font-heading text-xl tabular">{aging.counts[id]}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {money(aging.salePriceByBucket[id])} · {money(aging.expectedNetByBucket[id])}
            </div>
          </div>
        ))}
      </div>

      <div className="parchment-card overflow-x-auto p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.farm}</TableHead>
              <TableHead className="text-right">{t.bucket0}</TableHead>
              <TableHead className="text-right">{t.bucket31}</TableHead>
              <TableHead className="text-right">{t.bucket61}</TableHead>
              <TableHead className="text-right">{t.bucket90}</TableHead>
              <TableHead className="text-right">{t.salePrice}</TableHead>
              <TableHead className="text-right">{t.expectedNet}</TableHead>
              <TableHead className="text-right">{t.daysGained}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aging.farms
              .filter((f) => f.reserved > 0 || f.fullyReservedUnsold)
              .map((farm) => (
                <TableRow
                  key={farm.farmId}
                  data-testid="aging-farm-row"
                  data-farm={farm.farmName}
                  data-fully-reserved={farm.fullyReservedUnsold || undefined}
                  className={cn(farm.fullyReservedUnsold && "bg-[hsl(var(--data-status-far)/0.1)]")}
                >
                  <TableCell className="font-medium">
                    {farm.farmName}
                    {farm.fullyReservedUnsold && (
                      <div className="text-[11px] text-[hsl(var(--data-status-far))]">{t.fullyReserved}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular">{farm.counts["0-30"]}</TableCell>
                  <TableCell className="text-right tabular">{farm.counts["31-60"]}</TableCell>
                  <TableCell className="text-right tabular">{farm.counts["61-90"]}</TableCell>
                  <TableCell className="text-right tabular">{farm.counts["90+"]}</TableCell>
                  <TableCell className="text-right tabular">{money(farm.salePrice)}</TableCell>
                  <TableCell className="text-right tabular">{money(farm.expectedNetProfit)}</TableCell>
                  <TableCell className="text-right tabular">{number(farm.daysIfClosedThisMonth)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {aging.lots.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <div className="parchment-card overflow-x-auto p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.lot}</TableHead>
                <TableHead>{t.farm}</TableHead>
                <TableHead className="text-right">{t.daysWaiting}</TableHead>
                <TableHead>{t.client}</TableHead>
                <TableHead className="text-right">{t.salePrice}</TableHead>
                <TableHead className="text-right">{t.expectedNet}</TableHead>
                <TableHead className="text-right">{t.daysGained}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aging.lots.map((lot) => (
                <TableRow
                  key={lot.propertyId}
                  data-testid="aging-lot-row"
                  data-bucket={lot.bucket}
                  className={cn(lot.bucket === "90+" && "bg-[hsl(var(--data-status-far)/0.08)]")}
                >
                  <TableCell className="whitespace-nowrap">{lot.lotName}</TableCell>
                  <TableCell>{lot.farmName}</TableCell>
                  <TableCell className="text-right tabular">{number(lot.daysWaiting)}</TableCell>
                  <TableCell className="max-w-[14rem]">
                    {lot.buyerName ?? (lot.buyerIsTestClient ? <span className="italic text-muted-foreground">{t.testClient}</span> : "—")}
                  </TableCell>
                  <TableCell className="text-right tabular">{money(lot.salePrice)}</TableCell>
                  <TableCell className="text-right tabular">{money(lot.expectedNetProfit)}</TableCell>
                  <TableCell className="text-right tabular">{number(lot.daysIfClosedThisMonth)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
