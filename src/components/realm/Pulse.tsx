import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { pulseBand, pulseRatioPct } from "@/domain";
import { useRealmStrings } from "@/i18n/realm";

const BAND_CLASS = {
  ember: "text-ember",
  gold: "text-gold",
  oxygen: "text-oxygen",
} as const;

/**
 * THE PULSE — the two figures that answer "am I going to make it", promoted to the top of
 * the Throne Room. PRODUCING is today's trailing pace; NEEDED is remaining ÷ days left
 * (already on the Debt card; this is a promotion, not a move).
 *
 * Both figures sit in the same card treatment as the this-month tiles below them, as an
 * equal-width pair, with the derived % line centered under both.
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
  const t = useRealmStrings().pulse;
  const ratio = pulseRatioPct(producing, needed);
  const band = ratio === null ? null : pulseBand(ratio);

  return (
    <section className="mt-6" aria-label={t.aria} data-testid="pulse">
      <div className="grid grid-cols-2 gap-3">
        <figure className="min-w-0 rounded-md bg-background/40 p-3 text-center sm:text-left">
          <figcaption className="stat-label">{t.producing}</figcaption>
          <div
            className="mt-1 font-display text-[clamp(1.35rem,5vw,2.25rem)] leading-none tabular text-foreground"
            data-testid="pulse-producing"
            data-value={producing ?? ""}
          >
            {producing === null ? "—" : money(producing)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{t.producingHint}</div>
        </figure>
        <figure className="min-w-0 rounded-md bg-background/40 p-3 text-center sm:text-left">
          <figcaption className="stat-label">{t.needed}</figcaption>
          <div
            className="mt-1 font-display text-[clamp(1.35rem,5vw,2.25rem)] leading-none tabular text-foreground"
            data-testid="pulse-needed"
            data-value={needed ?? ""}
          >
            {needed === null ? "—" : money(needed)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{t.neededHint}</div>
        </figure>
      </div>
      {ratio !== null && band !== null && (
        <p
          className={cn("mt-3 text-center text-sm", BAND_CLASS[band])}
          data-testid="pulse-ratio"
          data-value={ratio}
          data-band={band}
        >
          {t.ratio(Math.round(ratio), horizonYear)}
        </p>
      )}
    </section>
  );
}
