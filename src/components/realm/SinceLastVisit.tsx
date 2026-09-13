import { useEffect, useState } from "react";
import { useRealm } from "@/data/useRealm";
import { decideCelebrations, type RealmEvent } from "@/domain";
import { Celebration } from "./Celebration";

const LAST_VISIT_KEY = "quest.lastVisit";
const CELEBRATED_KEY = "quest.celebrated";

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(CELEBRATED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * CELEBRATIONS (Phase 2 §9). Once per app open, compares the real events against the
 * `localStorage` timestamp of the last visit and celebrates every closing, note sale or
 * liberation dated since then that has not been celebrated before. The decision is pure
 * (src/domain/visits.ts); this component only reads and writes the browser storage.
 */
export function SinceLastVisit() {
  const { data } = useRealm();
  const [pending, setPending] = useState<RealmEvent[] | null>(null);
  const [decided, setDecided] = useState(false);

  useEffect(() => {
    if (!data || decided) return;
    setDecided(true);
    let lastVisit: string | null = null;
    try {
      lastVisit = localStorage.getItem(LAST_VISIT_KEY);
    } catch {
      lastVisit = null;
    }
    const now = new Date().toISOString();
    const decision = decideCelebrations(data.realm.events, lastVisit, readIds(), now);
    try {
      localStorage.setItem(LAST_VISIT_KEY, now);
      localStorage.setItem(CELEBRATED_KEY, JSON.stringify(decision.celebratedIds));
    } catch {
      // storage unavailable: celebrate anyway, just without memory
    }
    if (decision.toCelebrate.length > 0) setPending(decision.toCelebrate);
  }, [data, decided]);

  if (!data || !pending) return null;
  return <Celebration events={pending} narrative={data.realm.narrative} onDone={() => setPending(null)} />;
}
