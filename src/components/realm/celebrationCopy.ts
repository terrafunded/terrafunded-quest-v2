import type { RealmEvent } from "@/domain";
import type { RealmUiStrings } from "@/i18n/realm";

const FRESH_DAYS = 7;
const MS_PER_DAY = 86_400_000;

export function celebrationAgeDays(iso: string, now: Date): number {
  const stamp = Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(stamp)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - stamp) / MS_PER_DAY;
}

export function celebrationUsesDate(events: RealmEvent[], replay: boolean, now: Date): boolean {
  if (replay) return true;
  return events.some((e) => celebrationAgeDays(e.date, now) >= FRESH_DAYS);
}

export function celebrationHeadline(events: RealmEvent[], t: RealmUiStrings["celebration"], replay: boolean, now: Date, formatDate: (iso: string) => string): string {
  if (events.length === 0) return t.sinceLastVisit;
  const dated = celebrationUsesDate(events, replay, now);
  if (events.length > 1) return replay ? t.replayMany(events.length) : t.thingsHappened(events.length);
  const first = events[0]!;
  if (dated) return t.kindOn[first.kind]?.(formatDate(first.date)) ?? t.sinceLastVisit;
  return t.kind[first.kind] ?? t.sinceLastVisit;
}
