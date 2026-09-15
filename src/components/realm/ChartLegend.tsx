export interface ChartLegendItem {
  color: string;
  label: string;
  dashed?: boolean;
}

/** Compact swatch row — same pattern as the goal curve and farm calendar. */
export function ChartLegend({ items, aria }: { items: ChartLegendItem[]; aria: string }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground" aria-label={aria}>
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          {item.dashed ? (
            <span className="inline-block h-0 w-4 border-t border-dashed" style={{ borderColor: item.color }} />
          ) : (
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}
