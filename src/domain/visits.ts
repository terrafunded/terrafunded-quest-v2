import type { RealmEvent } from "./events";

/**
 * CELEBRATIONS (Phase 2 §9) — which real events deserve a fanfare on this visit.
 *
 * The UI stores `lastVisit` (ISO timestamp) and the ids already celebrated in localStorage;
 * this module only decides. Rules:
 *  - a first visit (no `lastVisit`) celebrates nothing and just records the timestamp;
 *  - an event qualifies when it is a closing, note sale or liberation, is not in the future,
 *    is dated on or after the calendar day of the last visit, and has not been celebrated yet
 *    (rows only carry dates, so same-day events are caught by the id list, not the timestamp).
 */
export const CELEBRATED_KINDS: readonly RealmEvent["kind"][] = ["closing", "note_sale", "liberation"];

export interface VisitDecision {
  toCelebrate: RealmEvent[];
  /** Ids to persist as celebrated after this visit (existing + new). */
  celebratedIds: string[];
  firstVisit: boolean;
}

export const MAX_REMEMBERED_IDS = 300;

export function decideCelebrations(events: RealmEvent[], lastVisit: string | null, celebratedIds: readonly string[], now: string): VisitDecision {
  const qualifying = (sinceDay: string) => events.filter((e) => CELEBRATED_KINDS.includes(e.kind) && !e.future && e.date >= sinceDay);
  if (!lastVisit) {
    // Nothing to celebrate yet, but remember today's events so they are not "new" tomorrow.
    const today = qualifying(now.slice(0, 10)).map((e) => e.id);
    return { toCelebrate: [], celebratedIds: [...celebratedIds, ...today].slice(-MAX_REMEMBERED_IDS), firstVisit: true };
  }
  const seen = new Set(celebratedIds);
  const toCelebrate = qualifying(lastVisit.slice(0, 10)).filter((e) => !seen.has(e.id));
  const merged = [...celebratedIds, ...toCelebrate.map((e) => e.id)];
  return {
    toCelebrate,
    celebratedIds: merged.slice(Math.max(0, merged.length - MAX_REMEMBERED_IDS)),
    firstVisit: false,
  };
}
