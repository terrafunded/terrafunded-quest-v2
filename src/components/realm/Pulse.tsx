import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { pulseBand, pulseRatioPct } from "@/domain";

const BAND_CLASS = {
  ember: "text-ember",
  gold: "text-gold",
  oxygen: "text-oxygen",
} as const;

/**
 * THE PULSE — the two figures that answer "am I going to make it", promoted to the top of
 * the Throne Room. PRODUCING is today's trailing pace; NEEDED is remaining ÷ days left
 * (already on the Debt card; this is a promotion, not a move).
 */
export function Pulse({
  producing,
  needed,
  horizonYear,
}: {
  producing: number | null;
  needed: number | null;
  horizonYear: number;
}) {
  const ratio = pulseRatioPct(producing, needed);
  const band = ratio === null ? null : pulseBand(ratio);

  return (
    <section className="mt-6" aria-label="The Pulse" data-testid="pulse">
      <div className="grid grid-cols-2 gap-3">
        <figure className="min-w-0 text-center sm:text-left">
          <figcaption className="stat-label">Producing</figcaption>
          <div
            className="mt-1 font-display text-[clamp(1.35rem,5vw,2.25rem)] leading-none tabular text-foreground"
            data-testid="pulse-producing"
            data-value={producing ?? ""}
          >
            {producing === null ? "—" : money(producing)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">net profit per day at the trailing pace</div>
        </figure>
        <figure className="min-w-0 text-center sm:text-left">
          <figcaption className="stat-label">Needed</figcaption>
          <div
            className="mt-1 font-display text-[clamp(1.35rem,5vw,2.25rem)] leading-none tabular text-foreground"
            data-testid="pulse-needed"
            data-value={needed ?? ""}
          >
            {needed === null ? "—" : money(needed)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">remaining ÷ days left</div>
        </figure>
      </div>
      {ratio !== null && band !== null && (
        <p className={cn("mt-3 text-sm", BAND_CLASS[band])} data-testid="pulse-ratio" data-value={ratio} data-band={band}>
          you are at {Math.round(ratio)}% of the pace the {horizonYear} horizon requires
        </p>
      )}
    </section>
  );
}
