import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Hourglass } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import { LOT_STAGES, type ExpectedLot, type Lot, type LotStage } from "@/domain";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StageBadge } from "@/components/realm/StageBadge";
import { Ellipsize } from "@/components/realm/FitMoney";
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
  | "reservationDate"
  | "expectedCloseDate";

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
  { key: "expectedCloseDate", label: "Expected close", className: "min-w-[150px]" },
  { key: "daysGained", label: "Oxygen", numeric: true },
];

/**
 * A ledger row: the lot plus its oxygen score (days gained toward the exit), whether its reservation
 * is stuck, and — for live reservations — the expected closing and the provisional days it promises.
 */
type Row = Lot & { daysGained: number | null; stuck: boolean; expected: ExpectedLot | null; expectedCloseDate: string | null; provisionalDays: number | null };

const STUCK_FILTER = "stuck";
/** `?filter=expected`: live reservations whose expected closing falls in the current month. */
const EXPECTED_FILTER = "expected";
const URL_FILTERS = new Set([STUCK_FILTER, EXPECTED_FILTER]);

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
  const urlFilter = params.get("filter") ?? "";
  const [stage, setStage] = useState(URL_FILTERS.has(urlFilter) ? urlFilter : "sold");
  const [investor, setInvestor] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "reservationDate", dir: "desc" });

  const realmLots = data?.realm.lots;
  const oxygen = data?.realm.oxygen;
  const pipeline = data?.realm.pipeline;
  const expected = data?.realm.expected;
  const thisMonth = expected?.thisMonth.month ?? "";
  const lots = useMemo<Row[]>(
    () =>
      (realmLots ?? []).map((l) => {
        const x = expected?.byId.get(l.propertyId) ?? null;
        return {
          ...l,
          daysGained: oxygen?.perLot.get(l.propertyId)?.daysGained ?? null,
          stuck: pipeline?.stuckIds.has(l.propertyId) ?? false,
          expected: x,
          expectedCloseDate: x?.expectedCloseDate ?? null,
          provisionalDays: oxygen?.provisional.get(l.propertyId)?.provisionalDays ?? null,
        };
      }),
    [realmLots, oxygen, pipeline, expected],
  );
  const farms = useMemo(() => [...new Set(lots.map((l) => l.farmName))].sort(), [lots]);
  const investors = useMemo(() => [...new Set(lots.map((l) => l.investorName).filter((n): n is string => !!n))].sort(), [lots]);
  const expectedThisMonth = useMemo(() => lots.filter((l) => l.expected?.expectedMonth === thisMonth).length, [lots, thisMonth]);

  const filtered = useMemo(() => {
    const rows = lots.filter((l) => {
      if (farm !== "all" && l.farmName !== farm) return false;
      if (investor !== "all" && l.investorName !== investor) return false;
      if (stage === "sold") return l.fileCaseId !== null || l.noteId !== null;
      if (stage === STUCK_FILTER) return l.stuck;
      if (stage === EXPECTED_FILTER) return l.expected?.expectedMonth === thisMonth;
      if (stage !== "all" && l.stage !== stage) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const c = compare(a, b, sort.key);
      return sort.dir === "asc" ? c : -c;
    });
  }, [lots, farm, investor, stage, sort, thisMonth]);

  if (isLoading) return <LoadingState rows={10} />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const ascFirst = (key: SortKey) => key === "name" || key === "buyerName" || key === "expectedCloseDate";
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: ascFirst(key) ? "asc" : "desc" }));

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
    reservations: filtered.filter((l) => l.expected !== null).length,
    expectedNet: Math.round(filtered.reduce((s, l) => s + (l.expected?.expectedNetProfit ?? 0), 0) * 100) / 100,
  };

  return (
    <div>
      <PageHeader title="Quests" subtitle="Every lot sale, straight from file cases and notes. Contract price is the file-case figure; sale price follows the note when one exists. Oxygen is the days each closing moved the exit date; a reservation shows the days it would gain, lighter, until it closes. Expected close is the reservation date plus the farm's median reservation→closing lag. Hourglass rows are reservations stuck past 60 days.">
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
          <option value={EXPECTED_FILTER}>Expected this month ({expectedThisMonth})</option>
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
        <Select
          value={sort.key}
          onChange={(e) => setSort({ key: e.target.value as SortKey, dir: ascFirst(e.target.value as SortKey) ? "asc" : "desc" })}
          aria-label="Sort by"
          className="w-44 sm:hidden"
          data-testid="mobile-sort"
        >
          {COLUMNS.map((c) => (
            <option key={c.key} value={c.key}>
              Sort: {c.label}
            </option>
          ))}
        </Select>
      </PageHeader>

      <TableErrorsBanner errors={data.tableErrors} />

      {filtered.length === 0 ? (
        <EmptyState title="No quests match" body="Loosen the filters to see lots." />
      ) : (
        <div className="parchment-card overflow-hidden">
          <Table className="min-w-[1520px] max-sm:min-w-0" data-mobile="cards" data-testid="ledger-table">
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
                  <TableCell data-label="Lot" className="whitespace-nowrap">
                    <Ellipsize className="font-medium">{l.name}</Ellipsize>
                    <div className="text-xs text-muted-foreground">
                      {l.dealType ?? "—"} · {l.investorName ?? "own capital"}
                    </div>
                  </TableCell>
                  <TableCell data-label="Buyer" className="max-w-[220px] whitespace-nowrap">
                    {l.buyerName ? (
                      <Ellipsize>{l.buyerName}</Ellipsize>
                    ) : l.buyerIsTestClient ? (
                      <span className="italic text-muted-foreground">test client</span>
                    ) : (
                      "—"
                    )}
                    <div className="truncate text-xs text-muted-foreground">
                      {l.reservationDate ? `Res. ${date(l.reservationDate)}` : ""}
                      {l.closeDate ? ` · Closed ${date(l.closeDate)}` : ""}
                    </div>
                  </TableCell>
                  <TableCell data-label="Stage">
                    <StageBadge stage={l.stage} />
                  </TableCell>
                  <TableCell data-label="Contract price" className="text-right tabular">{moneyExact(l.fileCaseSalePrice)}</TableCell>
                  <TableCell className={cn("text-right tabular", l.priceSource === "note" && l.fileCaseSalePrice !== l.salePrice && "text-stage-reserved")} data-label="Sale price">
                    {moneyExact(l.salePrice)}
                  </TableCell>
                  <TableCell data-label="Land cost" className="text-right tabular">{moneyExact(l.landCost)}</TableCell>
                  <TableCell data-label="Gross" className="text-right tabular">{moneyExact(l.grossProfit)}</TableCell>
                  <TableCell data-label="Investor take" className="text-right tabular">{moneyExact(l.investorTake)}</TableCell>
                  <TableCell className={cn("text-right tabular font-medium", (l.netProfit ?? 0) < 0 && "text-ember")} data-label="Net">{moneyExact(l.netProfit)}</TableCell>
                  <TableCell data-label="Cash realized" className="text-right tabular text-stage-closed">{moneyExact(l.cashRealized)}</TableCell>
                  <TableCell className={cn("text-right tabular whitespace-nowrap", l.stuck && "text-siege")} data-label="Days">
                    {l.stuck && <Hourglass className="mr-1 inline h-3 w-3" aria-label="Stuck reservation" />}
                    {days(l.daysInPipeline)}
                  </TableCell>
                  <TableCell
                    className={cn("whitespace-nowrap tabular", l.expected?.overdue && "text-siege")}
                    data-testid="ledger-expected"
                    data-value={l.expectedCloseDate ?? ""}
                    data-month={l.expected?.expectedMonth ?? undefined}
                    data-label="Expected close"
                  >
                    <ExpectedCloseCell x={l.expected} thisMonth={thisMonth} />
                  </TableCell>
                  <TableCell
                    className={cn("text-right tabular", l.daysGained !== null && l.daysGained > 0 && "text-oxygen", l.daysGained === null && l.provisionalDays !== null && "font-light text-oxygen/60")}
                    data-testid="ledger-oxygen"
                    data-value={l.daysGained ?? ""}
                    data-provisional={l.daysGained === null && l.provisionalDays !== null ? l.provisionalDays : undefined}
                    data-label="Oxygen"
                  >
                    {l.daysGained !== null ? `${l.daysGained > 0 ? "+" : ""}${l.daysGained}d` : l.provisionalDays !== null ? `~${l.provisionalDays > 0 ? "+" : ""}${l.provisionalDays}d` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow data-testid="ledger-totals">
                <TableCell data-label="Totals" className="font-heading">Totals · {totals.count} lots</TableCell>
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
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground" data-label="Expected close" data-testid="ledger-total-expected" data-value={totals.expectedNet}>
                  {totals.reservations > 0 ? `${totals.reservations} pending · ${moneyExact(totals.expectedNet)} expected` : ""}
                </TableCell>
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

/** The expected closing of a live reservation: the date, then how far off it is and which median produced it. */
function ExpectedCloseCell({ x, thisMonth }: { x: ExpectedLot | null; thisMonth: string }) {
  if (!x) return <>—</>;
  if (!x.expectedCloseDate || x.daysToExpectedClose === null) return <span className="text-muted-foreground">no median yet</span>;
  const when = x.overdue ? `${-x.daysToExpectedClose}d late` : x.daysToExpectedClose === 0 ? "today" : `in ${x.daysToExpectedClose}d`;
  return (
    <>
      <div className={cn(x.expectedMonth === thisMonth && !x.overdue && "font-medium text-oxygen")}>{date(x.expectedCloseDate)}</div>
      <div className="text-xs text-muted-foreground">
        {when} · {x.medianSource === "farm" ? "farm" : "realm"} median {x.medianDaysToClose}d
      </div>
    </>
  );
}
