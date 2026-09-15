import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { FarmScorecard, FarmScorecardRow, ScorecardGrade } from "@/domain";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRealmMapStrings } from "@/i18n/realmMap";
import { money, number, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const GRADE_CLASS: Record<ScorecardGrade, string> = {
  A: "text-[hsl(var(--data-status-hit))]",
  B: "text-[hsl(var(--data-status-near))]",
  C: "text-[hsl(var(--data-interest))]",
  D: "text-[hsl(var(--data-status-far))]",
};

type SortKey =
  | "name"
  | "grade"
  | "landCostPerLot"
  | "avgSalePrice"
  | "netProfitPerSoldLot"
  | "netOverLandCost"
  | "soldLots"
  | "sellThroughPct"
  | "medianDaysFundingToClose"
  | "daysSinceLastReservation"
  | "sponsorTakePerSoldLot";

const GRADE_RANK: Record<ScorecardGrade, number> = { A: 4, B: 3, C: 2, D: 1 };

function compare(a: FarmScorecardRow, b: FarmScorecardRow, key: SortKey): number {
  if (key === "name") return a.name.localeCompare(b.name);
  if (key === "grade") return (a.grade ? GRADE_RANK[a.grade] : 0) - (b.grade ? GRADE_RANK[b.grade] : 0);
  const av = a[key];
  const bv = b[key];
  if (av === null && bv === null) return 0;
  if (av === null) return -1;
  if (bv === null) return 1;
  return (av as number) - (bv as number);
}

function takeLabel(row: FarmScorecardRow, t: ReturnType<typeof useRealmMapStrings>["scorecard"]): string {
  if (row.sponsorTakeKind === "own_capital") return t.dealOwn;
  const take = money(row.sponsorTakePerSoldLot);
  if (row.sponsorTakeKind === "profit_share") return t.dealProfitShare(pct(row.profitSharePct, 0), take);
  return t.dealInterest(pct(row.annualRatePct, 0), take);
}

export function FarmScorecardSection({ scorecard }: { scorecard: FarmScorecard }) {
  const t = useRealmMapStrings().scorecard;
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "grade", dir: "desc" });
  const rows = useMemo(() => {
    return [...scorecard.rows].sort((a, b) => {
      const c = compare(a, b, sort.key);
      return sort.dir === "asc" ? c : -c;
    });
  }, [scorecard.rows, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  const head = (key: SortKey, label: string, className?: string) => (
    <TableHead className={className}>
      <Button variant="ghost" size="sm" className="-ml-3 h-8 px-2 text-xs" onClick={() => toggle(key)}>
        {label}
        {sort.key === key ? sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </Button>
    </TableHead>
  );

  const names = scorecard.buyLike.map((r) => r.name).join(scorecard.buyLike.length === 2 ? " & " : ", ");
  const verdict =
    scorecard.buyLike.length === 0 || !scorecard.buyLike[0]?.grade
      ? t.buyLikeNone
      : t.buyLike(names, scorecard.buyLike[0].grade);

  return (
    <section className="parchment-card mb-6 p-4 sm:p-5" data-testid="farm-scorecard" aria-label={t.title}>
      <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t.subtitle}</p>
      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {head("name", t.col.farm)}
              {head("grade", t.col.grade)}
              {head("landCostPerLot", t.col.landCost, "text-right")}
              {head("avgSalePrice", t.col.avgSale, "text-right")}
              {head("netProfitPerSoldLot", t.col.netPerLot, "text-right")}
              {head("netOverLandCost", t.col.netOverLand, "text-right")}
              {head("soldLots", t.col.lots, "text-right")}
              {head("sellThroughPct", t.col.sellThrough, "text-right")}
              {head("medianDaysFundingToClose", t.col.medianClose, "text-right")}
              {head("daysSinceLastReservation", t.col.daysSinceRes, "text-right")}
              {head("sponsorTakePerSoldLot", t.col.sponsorTake)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.farmId}
                data-testid="farm-scorecard-row"
                data-farm={row.name}
                data-grade={row.grade ?? "none"}
                data-stale={row.stale || undefined}
                className={cn(row.stale && "bg-[hsl(var(--data-status-far)/0.08)]")}
              >
                <TableCell className="whitespace-nowrap font-medium">
                  {row.name}
                  {row.stale && (
                    <div className="text-[11px] text-[hsl(var(--data-status-far))]" title={t.staleHint(scorecard.staleAfterDays)}>
                      {t.staleFlag}
                    </div>
                  )}
                </TableCell>
                <TableCell className={cn("font-heading text-lg", row.grade ? GRADE_CLASS[row.grade] : "text-muted-foreground")}>
                  {row.grade ?? t.ungraded}
                </TableCell>
                <TableCell className="text-right tabular">{money(row.landCostPerLot)}</TableCell>
                <TableCell className="text-right tabular">{row.avgSalePrice === null ? "—" : money(row.avgSalePrice)}</TableCell>
                <TableCell className="text-right tabular font-medium">{row.netProfitPerSoldLot === null ? "—" : money(row.netProfitPerSoldLot)}</TableCell>
                <TableCell className="text-right tabular">{row.netOverLandCost === null ? "—" : `${row.netOverLandCost.toFixed(2)}×`}</TableCell>
                <TableCell className="text-right tabular text-xs">{t.lotsSplit(row.soldLots, row.reservedLots, row.availableLots)}</TableCell>
                <TableCell className="text-right tabular">{pct(row.sellThroughPct, 0)}</TableCell>
                <TableCell className="text-right tabular">{row.medianDaysFundingToClose === null ? "—" : number(row.medianDaysFundingToClose)}</TableCell>
                <TableCell className="text-right tabular">{row.daysSinceLastReservation === null ? "—" : number(row.daysSinceLastReservation)}</TableCell>
                <TableCell className="max-w-[16rem] text-xs text-muted-foreground">{takeLabel(row, t)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-4 text-sm" data-testid="farm-scorecard-verdict">
        {verdict}
      </p>
    </section>
  );
}

export function FarmScorecardSummary({ scorecard }: { scorecard: FarmScorecard }) {
  const tMap = useRealmMapStrings().scorecard;
  const names = scorecard.buyLike.map((r) => r.name).join(", ");
  return (
    <p className="text-xs text-muted-foreground" data-testid="farm-scorecard-summary-verdict">
      {scorecard.buyLike.length === 0 || !scorecard.buyLike[0]?.grade
        ? tMap.buyLikeNone
        : tMap.buyLike(names, scorecard.buyLike[0].grade)}
    </p>
  );
}
