import { useCallback, useMemo, useState } from "react";

/**
 * "Revisado" and "Nota" per issue, keyed by lot + issue kind (see `reviewKeyOf`). Quest cannot
 * write to Payments, so this lives in the browser's localStorage only.
 */
export const REVIEW_STORAGE_KEY = "quest.quality.review";

export interface ReviewEntry {
  reviewed: boolean;
  note: string;
  /** ISO timestamp of the last change. */
  at: string;
}

export type ReviewState = Record<string, ReviewEntry>;

function isEntry(v: unknown): v is ReviewEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<ReviewEntry>;
  return typeof e.reviewed === "boolean" && typeof e.note === "string";
}

export function readReviewState(): ReviewState {
  try {
    const raw = localStorage.getItem(REVIEW_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: ReviewState = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (isEntry(v)) out[k] = { reviewed: v.reviewed, note: v.note, at: typeof v.at === "string" ? v.at : "" };
    return out;
  } catch {
    return {};
  }
}

export function writeReviewState(state: ReviewState) {
  try {
    localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage disabled or full: the state still lives in memory for this visit */
  }
}

export function useReviewState() {
  const [state, setState] = useState<ReviewState>(() => readReviewState());
  const update = useCallback((key: string, patch: Partial<Pick<ReviewEntry, "reviewed" | "note">>) => {
    setState((prev) => {
      const current = prev[key] ?? { reviewed: false, note: "", at: "" };
      const entry: ReviewEntry = { ...current, ...patch, at: new Date().toISOString() };
      const next = { ...prev };
      if (!entry.reviewed && entry.note.trim() === "") delete next[key];
      else next[key] = entry;
      writeReviewState(next);
      return next;
    });
  }, []);
  const reviewed = useMemo(() => new Set(Object.entries(state).filter(([, e]) => e.reviewed).map(([k]) => k)), [state]);
  return { state, update, reviewed };
}
