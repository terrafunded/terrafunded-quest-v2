import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Hourglass } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import { LOT_STAGES, type Lot, type LotStage } from "@/domain";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StageBadge } from "@/components/realm/StageBadge";
import { EmptyState, ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { STAGE_LABEL, date, days, moneyExact } from "@/lib/format";
import { cn } from "@/lib/utils";

type SortKey =
  | "name"
  | "buyerName"
  | "stage"
  | "salePrice"
  | "fileCaseSalePrice"
  | "landCost"
  | "grossProfit"
  | "investorTake"
  | "netProfit"
  | "cashRealized"
  | "daysInPipeline"
  | "daysGained"
  | "reservationDate";

const STAGE_ORDER: Record<LotStage, number> = { available: 0, reserved: 1, closed: 2, note_sold: 3 };

const COLUMNS: { key: SortKey; label: string; numeric?: boolean; className?: string }[] = [
  { key: "name", label: "Lot", className: "min-w-[200px]" },
  { key: "buyerName", label: "Buyer", className: "min-w-[190px]" },
  { key: "stage", label: "Stage" },
  { key: "fileCaseSalePrice", label: "Contract price", numeric: true },
  { key: "salePrice", label: "Sale price", numeric: true },
  { key: "landCost", label: "Land cost", numeric: true },
  { key: "grossProfit", label: "Gross", numeric: true },
  { key: "investorTake", label: "Investor take", numeric: true },
  { key: "netProfit", label: "Net", numeric: true },
  { key: "cashRealized", label: "Cash realized", numeric: true },
  { key: "daysInPipeline", label: "Days", numeric: true },
  { key: "daysGained", label: "Oxygen", numeric: true },
];

/** A ledger row: the lot plus its oxygen score (days gained toward the exit) and whether its reservation is stuck. */
type Row = Lot & { daysGained: number | null; stuck: boolean };

const STUCK_FILTER = "stuck";

function compare(a: Row, b: Row, key: SortKey): number {
  if (key === "stage") return STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage];
  const va = a[key];
  const vb = b[key];
  if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : 1;
  if (vb === null || vb === undefined) return -1;
  if (typeof va === "number" && typeof vb === "number") return va - vb;
  return String(va).localeCompare(String(vb));
}

const sumOf = (lots: Row[], key: keyof Row) => lots.reduce((s, l) => s + ((l[key] as number | null) ?? 0), 0);

export default function Quests() {
  const { data, isLoading, error, refetch } = useRealm();
  const [params] = useSearchParams();
  const [farm, setFarm] = useState("all");
  const [stage, setStage] = useState(params.get("filter") === STUCK_FILTER ? STUCK_FILTER : "sold");
  const [investor, setInvestor] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "reservationDate", dir: "desc" });

  const realmLots = data?.realm.lots;
  const oxygen = data?.realm.oxygen;
  const pipeline = data?.realm.pipeline;
  const lots = useMemo<Row[]>(
    () =>
      (realmLots ?? []).map((l) => ({
        ...l,
        daysGained: oxygen?.perLot.get(l.propertyId)?.daysGained ?? null,
        stuck: pipeline?.stuckIds.has(l.propertyId) ?? false,
      })),
    [realmLots, oxygen, pipeline],
  );
  const farms = useMemo(() => [...new Set(lots.map((l) => l.farmName))].sort(), [lots]);
  const investors = useMemo(() => [...new Set(lots.map((l) => l.investorName).filter((n): n is string => !!n))].sort(), [lots]);

  const filtered = useMemo(() => {
    const rows = lots.filter((l) => {
      if (farm !== "all" && l.farmName !== farm) return false;
      if (investor !== "all" && l.investorName !== investor) return false;
      if (stage === "sold") return l.fileCaseId !== null || l.noteId !== null;
      if (stage === STUCK_FILTER) return l.stuck;
      if (stage !== "all" && l.stage !== stage) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const c = compare(a, b, sort.key);
      return sort.dir === "asc" ? c : -c;
    });
  }, [lots, farm, investor, stage, sort]);

  if (isLoading) return <LoadingState rows={10} />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "buyerName" ? "asc" : "desc" }));

  const totals = {
    count: filtered.length,
    contract: sumOf(filtered, "fileCaseSalePrice"),
    sale: sumOf(filtered, "salePrice"),
    land: sumOf(filtered, "landCost"),
    gross: sumOf(filtered, "grossProfit"),
    take: sumOf(filtered.filter((l) => l.stage === "closed" || l.stage === "note_sold"), "investorTake"),
    net: sumOf(filtered, "netProfit"),
    cash: sumOf(filtered, "cashRealized"),
    oxygen: sumOf(filtered, "daysGained"),
  };

  return (
    <div>
      <PageHeader title="Quests" subtitle="Every lot sale, straight from file cases and notes. Contract price is the file-case figure; sale price follows the note when one exists. Oxygen is the days each closing moved the exit date. Hourglass rows are reservations stuck past 60 days.">
        <Select value={farm} onChange={(e) => setFarm(e.target.value)} aria-label="Filter by farm" className="w-40">
          <option value="all">All farms</option>
          {farms.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
        <Select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Filter by stage" className="w-52">
          <option value="sold">All sales (with a case)</option>
          <option value="all">All lots</option>
          <option value={STUCK_FILTER}>Stuck reservations ({data?.realm.pipeline.stuckAfterDays ?? 60}+ days)</option>
          {LOT_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select value={investor} onChange={(e) => setInvestor(e.target.value)} aria-label="Filter by investor" className="w-44">
          <option value="all">All sponsors</option>
          {investors.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </Select>
      </PageHeader>

      <TableErrorsBanner errors={data.tableErrors} />

      {filtered.length === 0 ? (
        <EmptyState title="No quests match" body="Loosen the filters to see lots." />
      ) : (
        <div className="parchment-card overflow-hidden">
          <Table className="min-w-[1360px]" data-testid="ledger-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {COLUMNS.map((c) => (
                  <TableHead key={c.key} className={cn(c.numeric && "text-right", c.className)}>
                    <Button variant="ghost" size="sm" className={cn("-mx-2 h-7 gap-1 px-2 text-[11px] uppercase tracking-wider", c.numeric && "ml-auto")} onClick={() => toggleSort(c.key)}>
                      {c.label}
                      {sort.key === c.key ? sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </Button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.propertyId} data-testid="ledger-row" data-stuck={l.stuck || undefined} className={cn(l.stuck && "bg-siege/8")}>
                  <TableCell className="whitespace-nowrap">
                    <div className="font-medium">{l.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.dealType ?? "—"} · {l.investorName ?? "own capital"}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[220px] whitespace-nowrap">
                    <div className="truncate">{l.buyerName ?? (l.buyerIsTestClient ? <span className="italic text-muted-foreground">test client</span> : "—")}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {l.reservationDate ? `Res. ${date(l.reservationDate)}` : ""}
                      {l.closeDate ? ` · Closed ${date(l.closeDate)}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StageBadge stage={l.stage} />
                  </TableCell>
                  <TableCell className="text-right tabular">{moneyExact(l.fileCaseSalePrice)}</TableCell>
                  <TableCell className={cn("text-right tabular", l.priceSource === "note" && l.fileCaseSalePrice !== l.salePrice && "text-stage-reserved")}>
                    {moneyExact(l.salePrice)}
                  </TableCell>
                  <TableCell className="text-right tabular">{moneyExact(l.landCost)}</TableCell>
                  <TableCell className="text-right tabular">{moneyExact(l.grossProfit)}</TableCell>
                  <TableCell className="text-right tabular">{moneyExact(l.investorTake)}</TableCell>
                  <TableCell className={cn("text-right tabular font-medium", (l.netProfit ?? 0) < 0 && "text-ember")}>{moneyExact(l.netProfit)}</TableCell>
                  <TableCell className="text-right tabular text-stage-closed">{moneyExact(l.cashRealized)}</TableCell>
                  <TableCell className={cn("text-right tabular whitespace-nowrap", l.stuck && "text-siege")}>
                    {l.stuck && <Hourglass className="mr-1 inline h-3 w-3" aria-label="Stuck reservation" />}
                    {days(l.daysInPipeline)}
                  </TableCell>
                  <TableCell className={cn("text-right tabular", l.daysGained !== null && l.daysGained > 0 && "text-oxygen")} data-testid="ledger-oxygen" data-value={l.daysGained ?? ""}>
                    {l.daysGained === null ? "—" : `${l.daysGained > 0 ? "+" : ""}${l.daysGained}d`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow data-testid="ledger-totals">
                <TableCell className="font-heading">Totals · {totals.count} lots</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right tabular font-semibold text-gold" data-testid="ledger-total-contract-price">
                  {moneyExact(totals.contract)}
                </TableCell>
                <TableCell className="text-right tabular" data-testid="ledger-total-sale-price">
                  {moneyExact(totals.sale)}
                </TableCell>
                <TableCell className="text-right tabular">{moneyExact(totals.land)}</TableCell>
                <TableCell className="text-right tabular">{moneyExact(totals.gross)}</TableCell>
                <TableCell className="text-right tabular">{moneyExact(totals.take)}</TableCell>
                <TableCell className="text-right tabular font-semibold" data-testid="ledger-total-net">
                  {moneyExact(totals.net)}
                </TableCell>
                <TableCell className="text-right tabular text-stage-closed" data-testid="ledger-total-cash">
                  {moneyExact(totals.cash)}
                </TableCell>
                <TableCell />
                <TableCell className="text-right tabular font-semibold text-oxygen" data-testid="ledger-total-oxygen" data-value={totals.oxygen}>
                  {totals.oxygen > 0 ? "+" : ""}
                  {totals.oxygen}d
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}
