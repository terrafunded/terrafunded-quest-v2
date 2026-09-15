import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import type { RealmEvent } from "@/domain";
import { Button } from "@/components/ui/button";
import { TOPBAR_HEIGHT_PX } from "@/components/layout/chrome";
import { date, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRealmStrings } from "@/i18n/realm";
import { useTheme } from "@/theme/ThemeProvider";
import { DATA_GOAL, DATA_PROFIT_INVENTORY } from "./chartTokens";
import { celebrationHeadline } from "./celebrationCopy";

const AUTO_DISMISS_MS = 8_000;
const MAX_VISIBLE = 3;

interface CelebrationProps {
  events: RealmEvent[];
  /** One line of chronicle prose per event id — kept for callers; the toast only prints date and amount. */
  narrative: Map<string, string>;
  onDone: () => void;
  /** Sponsors replay: never use "just" / "acaba de" in the headline. */
  replay?: boolean;
  now?: Date;
}

/**
 * A viewport toast for closings, note sales and capital returned. Portalled to document.body so
 * the page-transition wrapper cannot trap `position: fixed`. Does not dim, trap focus, or block
 * the page.
 */
export function Celebration({ events, narrative: _narrative, onDone, replay = false, now }: CelebrationProps) {
  const t = useRealmStrings();
  const { reducedMotion } = useTheme();
  const [held, setHeld] = useState(false);
  const remaining = useRef(AUTO_DISMISS_MS);
  const started = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  useEffect(() => {
    if (held) return;
    started.current = Date.now();
    const id = window.setTimeout(onDone, remaining.current);
    return () => {
      window.clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started.current));
    };
  }, [held, onDone]);

  if (events.length === 0 || typeof document === "undefined") return null;

  const clock = now ?? new Date();
  const liberation = events.some((e) => e.kind === "liberation");
  const accent = liberation ? DATA_PROFIT_INVENTORY : DATA_GOAL;
  const headline = celebrationHeadline(events, t.celebration, replay, clock, (iso) => date(iso));
  const visible = events.slice(0, MAX_VISIBLE);
  const extra = events.length - visible.length;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="celebration"
        role="status"
        aria-live="polite"
        aria-label={t.celebration.aria}
        className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-4"
        style={{ top: `calc(${TOPBAR_HEIGHT_PX}px + env(safe-area-inset-top, 0px) + 0.5rem)` }}
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
        transition={{ duration: reducedMotion ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
        data-testid="celebration"
        data-replay={replay || undefined}
      >
        <div
          className={cn("pointer-events-auto w-full max-w-3xl rounded-xl border bg-card/95 px-4 py-3 shadow-lg")}
          style={{ borderColor: accent, boxShadow: `0 8px 28px -16px ${accent}` }}
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocusCapture={() => setHeld(true)}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
          }}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-heading text-sm leading-snug" style={{ color: accent }} data-testid="celebration-headline">
                {headline}
              </p>
              <ol className="mt-1.5 space-y-0.5 text-sm">
                {visible.map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-3 tabular" data-testid="celebration-event">
                    <span>{date(e.date)}</span>
                    <span className="text-muted-foreground">{e.amount !== null ? money(e.amount) : ""}</span>
                  </li>
                ))}
              </ol>
              {extra > 0 && (
                <Link
                  to="/chronicle"
                  onClick={onDone}
                  className="mt-1 inline-block text-sm underline-offset-2 hover:underline"
                  data-testid="celebration-more"
                >
                  {t.celebration.andMore(extra)}
                </Link>
              )}
            </div>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={onDone} aria-label={t.celebration.close}>
              <X />
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
