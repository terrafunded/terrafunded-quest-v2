import type { FrozenWeeklyWeek } from "../../src/domain/weeklyActions";
import { resolveQuestKv, type QuestKv } from "../_nightlyExport/questKv";

const PREFIX = "weekly-actions";
const INDEX = `${PREFIX}/index.json`;

interface WeekIndex {
  weeks: string[];
}

function weekPath(week: string): string {
  return `${PREFIX}/${week}.json`;
}

export interface WeeklyActionsStore {
  get(week: string): Promise<FrozenWeeklyWeek | null>;
  put(week: FrozenWeeklyWeek): Promise<void>;
  list(): Promise<string[]>;
}

export function weeklyActionsStore(kv: QuestKv): WeeklyActionsStore {
  return {
    async get(week) {
      const raw = await kv.get(weekPath(week));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as FrozenWeeklyWeek;
      } catch {
        return null;
      }
    },
    async put(doc) {
      await kv.put(weekPath(doc.week), JSON.stringify(doc));
      const raw = await kv.get(INDEX);
      const index: WeekIndex = raw ? (JSON.parse(raw) as WeekIndex) : { weeks: [] };
      if (!index.weeks.includes(doc.week)) {
        index.weeks = [...index.weeks, doc.week].sort();
        await kv.put(INDEX, JSON.stringify(index));
      }
    },
    async list() {
      const raw = await kv.get(INDEX);
      if (!raw) return [];
      try {
        return (JSON.parse(raw) as WeekIndex).weeks ?? [];
      } catch {
        return [];
      }
    },
  };
}

export function defaultWeeklyActionsStore(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): WeeklyActionsStore {
  return weeklyActionsStore(resolveQuestKv(env, fetchImpl).kv);
}

export function memoryWeeklyActionsStore(seed: FrozenWeeklyWeek[] = []): WeeklyActionsStore {
  const map = new Map(seed.map((w) => [w.week, w]));
  return {
    async get(week) {
      return map.get(week) ?? null;
    },
    async put(doc) {
      map.set(doc.week, doc);
    },
    async list() {
      return [...map.keys()].sort();
    },
  };
}
