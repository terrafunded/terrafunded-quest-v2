import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CacheRecord, WeeklyCouncilStore } from "./types";

interface FileShape {
  records: CacheRecord[];
  forces: { userId: string; day: string; count: number }[];
}

/** In-memory store for tests. Not shared across processes. */
export function memoryStore(seed: FileShape = { records: [], forces: [] }): WeeklyCouncilStore & { snapshot: () => FileShape } {
  const records = [...seed.records];
  const forces = [...seed.forces];
  return {
    async get(week, horizon, lang) {
      return records.find((r) => r.week === week && r.horizon === horizon && r.lang === lang) ?? null;
    },
    async set(record) {
      const i = records.findIndex((r) => r.week === record.week && r.horizon === record.horizon && r.lang === record.lang);
      if (i >= 0) records[i] = record;
      else records.push(record);
    },
    async getForceCount(userId, day) {
      return forces.find((f) => f.userId === userId && f.day === day)?.count ?? 0;
    },
    async incrementForceCount(userId, day) {
      const row = forces.find((f) => f.userId === userId && f.day === day);
      if (row) {
        row.count += 1;
        return row.count;
      }
      forces.push({ userId, day, count: 1 });
      return 1;
    },
    snapshot: () => ({ records: [...records], forces: [...forces] }),
  };
}

/**
 * JSON file under `/tmp` so a warm serverless instance and the local Vite preview share a cache
 * without writing to Payments. Production should apply `sql/proposed_weekly_council.sql` and
 * swap this for the Supabase store; until then the file is the persistence the function has.
 */
export function fileStore(path: string): WeeklyCouncilStore {
  const empty = (): FileShape => ({ records: [], forces: [] });
  const read = (): FileShape => {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as FileShape;
    } catch {
      return empty();
    }
  };
  const write = (data: FileShape) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data));
  };
  const inner = () => {
    const data = read();
    const mem = memoryStore(data);
    return { mem, persist: () => write(mem.snapshot()) };
  };
  return {
    async get(week, horizon, lang) {
      return inner().mem.get(week, horizon, lang);
    },
    async set(record) {
      const { mem, persist } = inner();
      await mem.set(record);
      persist();
    },
    async getForceCount(userId, day) {
      return inner().mem.getForceCount(userId, day);
    },
    async incrementForceCount(userId, day) {
      const { mem, persist } = inner();
      const n = await mem.incrementForceCount(userId, day);
      persist();
      return n;
    },
  };
}

const DEFAULT_PATH = "/tmp/quest-weekly-council-cache.json";

let defaultStore: WeeklyCouncilStore | null = null;

export function defaultWeeklyStore(): WeeklyCouncilStore {
  if (!defaultStore) defaultStore = fileStore(DEFAULT_PATH);
  return defaultStore;
}

/** Test-only: reset the process-wide default so suites do not leak into each other. */
export function resetDefaultWeeklyStore(store?: WeeklyCouncilStore): void {
  defaultStore = store ?? null;
}
