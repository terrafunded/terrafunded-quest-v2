import type { NoteStrategies, NoteStrategy } from "@/domain";
import { Stat } from "@/components/realm/Stat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTreasuryStrings } from "@/i18n/treasury";
import { money, moneyExact } from "@/lib/format";

function StrategyCard({
  title,
  hint,
  row,
  stillOwed,
}: {
  title: string;
  hint: string;
  row: NoteStrategy;
  stillOwed: (amount: string) => string;
}) {
  const t = useTreasuryStrings().notes;
  return (
    <div className="parchment-card p-4" data-testid={`note-strategy-${row.id}`}>
      <div className="stat-label">{title}</div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t.cashNow}</dt>
          <dd className="tabular font-medium">{money(row.cashInHandNow)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t.totalValue}</dt>
          <dd className="tabular">{money(row.totalValue)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t.liquidityCost}</dt>
          <dd className="tabular text-[hsl(var(--data-owed))]">{money(row.liquidityCost)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t.lpReturnable}</dt>
          <dd className="tabular text-[hsl(var(--data-status-hit))]">{money(row.lpCapitalReturnable)}</dd>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">{stillOwed(money(row.lpCapitalStillOwed))}</div>
      </dl>
    </div>
  );
}

export function NoteStrategiesSection({ strategies }: { strategies: NoteStrategies }) {
  const t = useTreasuryStrings().notes;
  return (
    <section className="mb-6 space-y-4" data-testid="note-strategies" id="notes-strategies" aria-label={t.title}>
      <div>
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t.subtitle}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label={t.realized}
          value={money(strategies.liquidityCostRealized)}
          data-testid="note-liquidity-realized"
        />
        <Stat
          label={t.unrealized}
          value={money(strategies.liquidityCostUnrealized)}
          data-testid="note-liquidity-unrealized"
        />
        <Stat
          label={t.totalCost}
          value={money(strategies.liquidityCostTotal)}
          hint={t.totalIdentity(moneyExact(strategies.liquidityCostTotal), moneyExact(strategies.liquidityCostRealized), moneyExact(strategies.liquidityCostUnrealized))}
          valueClassName="text-[hsl(var(--data-owed))]"
          data-testid="note-liquidity-total"
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <StrategyCard title={t.sell} hint={t.sellHint} row={strategies.sell} stillOwed={t.lpStillOwed} />
        <StrategyCard title={t.hold} hint={t.holdHint} row={strategies.hold} stillOwed={t.lpStillOwed} />
        <StrategyCard title={t.deliver} hint={t.deliverHint} row={strategies.deliver} stillOwed={t.lpStillOwed} />
      </div>
      <div className="parchment-card overflow-x-auto p-4">
        <h3 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.perNote}</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.colFarm}</TableHead>
              <TableHead>{t.colLot}</TableHead>
              <TableHead className="text-right">{t.colFace}</TableHead>
              <TableHead className="text-right">{t.colSale}</TableHead>
              <TableHead className="text-right">{t.colCost}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {strategies.notes.map((n) => (
              <TableRow key={n.propertyId} data-testid="held-note-row">
                <TableCell>{n.farmName}</TableCell>
                <TableCell>{n.lotName}</TableCell>
                <TableCell className="text-right tabular">{moneyExact(n.faceBalance)}</TableCell>
                <TableCell className="text-right tabular">{moneyExact(n.measuredSaleValue)}</TableCell>
                <TableCell className="text-right tabular text-[hsl(var(--data-owed))]">{moneyExact(n.costOfSelling)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground" data-testid="note-strategies-footnote">
        {t.footnote}
      </p>
    </section>
  );
}
