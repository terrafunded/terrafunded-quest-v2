/**
 * Quest-owned persistence for nightly exports. Never Payments.
 * Prefers Vercel Blob, then a local directory, then memory (tests / missing env).
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  NIGHTLY_KEEP_RUNS,
  type MonthlyRunSummary,
  type NightlyExportStore,
  type NightlyRun,
  type NightlyRunMeta,
} from "../../src/lib/nightlyExport";
import { cloneExportDocument } from "../../src/lib/exportSnapshotStore";

const INDEX = "index.json";

interface StoreIndex {
  runs: NightlyRunMeta[];
  monthly: MonthlyRunSummary[];
}

function emptyIndex(): StoreIndex {
  return { runs: [], monthly: [] };
}

function metaOf(run: NightlyRun): NightlyRunMeta {
  return {
    runId: run.runId,
    date: run.date,
    horizon: run.horizon,
    commitSha: run.commitSha,
    createdAt: run.createdAt,
    asOf: run.asOf,
    snapshotAt: run.snapshotAt,
    alertCount: run.alertCount,
  };
}

function rollMonthly(monthly: MonthlyRunSummary[], dropped: NightlyRunMeta[]): MonthlyRunSummary[] {
  const map = new Map(monthly.map((m) => [`${m.yearMonth}:${m.horizon}`, { ...m, commitShas: [...m.commitShas] }]));
  for (const run of dropped) {
    const yearMonth = run.createdAt.slice(0, 7);
    const key = `${yearMonth}:${run.horizon}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        yearMonth,
        horizon: run.horizon,
        runCount: 1,
        firstCreatedAt: run.createdAt,
        lastCreatedAt: run.createdAt,
        commitShas: [run.commitSha],
        alertCount: run.alertCount,
      });
      continue;
    }
    existing.runCount += 1;
    existing.alertCount += run.alertCount;
    if (run.createdAt < existing.firstCreatedAt) existing.firstCreatedAt = run.createdAt;
    if (run.createdAt > existing.lastCreatedAt) existing.lastCreatedAt = run.createdAt;
    if (!existing.commitShas.includes(run.commitSha)) existing.commitShas.push(run.commitSha);
  }
  return [...map.values()].sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
}

interface BlobClient {
  put(pathname: string, body: string): Promise<void>;
  get(pathname: string): Promise<string | null>;
  del(pathname: string): Promise<void>;
}

function runPath(runId: string): string {
  return `nightly/runs/${runId}.json`;
}

function makeStore(io: {
  readIndex: () => Promise<StoreIndex>;
  writeIndex: (index: StoreIndex) => Promise<void>;
  readRun: (runId: string) => Promise<NightlyRun | null>;
  writeRun: (run: NightlyRun) => Promise<void>;
  deleteRun: (runId: string) => Promise<void>;
}): NightlyExportStore {
  return {
    async put(run) {
      const index = await io.readIndex();
      await io.writeRun({
        ...run,
        document: cloneExportDocument(run.document),
        alerts: [...run.alerts],
      });
      index.runs = [metaOf(run), ...index.runs.filter((r) => r.runId !== run.runId)].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
      await io.writeIndex(index);
    },
    async get(runId) {
      return io.readRun(runId);
    },
    async getByKey(date, horizon, commitSha) {
      const index = await io.readIndex();
      const meta = index.runs.find((r) => r.date === date && r.horizon === horizon && r.commitSha === commitSha);
      return meta ? io.readRun(meta.runId) : null;
    },
    async getPrevious(horizon, beforeCreatedAt) {
      const index = await io.readIndex();
      const meta = index.runs.find((r) => r.horizon === horizon && r.createdAt < beforeCreatedAt);
      return meta ? io.readRun(meta.runId) : null;
    },
    async list() {
      return (await io.readIndex()).runs;
    },
    async prune(keep = NIGHTLY_KEEP_RUNS) {
      const index = await io.readIndex();
      const keepRuns = index.runs.slice(0, keep);
      const drop = index.runs.slice(keep);
      for (const run of drop) await io.deleteRun(run.runId);
      index.monthly = rollMonthly(index.monthly, drop);
      index.runs = keepRuns;
      await io.writeIndex(index);
      return index.monthly;
    },
    async listMonthly() {
      return (await io.readIndex()).monthly;
    },
  };
}

export function filesystemQuestStore(root: string): NightlyExportStore {
  const indexPath = path.join(root, INDEX);
  return makeStore({
    async readIndex() {
      try {
        return JSON.parse(await readFile(indexPath, "utf8")) as StoreIndex;
      } catch {
        return emptyIndex();
      }
    },
    async writeIndex(index) {
      await mkdir(root, { recursive: true });
      await mkdir(path.join(root, "nightly", "runs"), { recursive: true });
      await writeFile(indexPath, JSON.stringify(index), "utf8");
    },
    async readRun(runId) {
      try {
        return JSON.parse(await readFile(path.join(root, runPath(runId)), "utf8")) as NightlyRun;
      } catch {
        return null;
      }
    },
    async writeRun(run) {
      await mkdir(path.join(root, "nightly", "runs"), { recursive: true });
      await writeFile(path.join(root, runPath(run.runId)), JSON.stringify(run), "utf8");
    },
    async deleteRun(runId) {
      await rm(path.join(root, runPath(runId)), { force: true });
    },
  });
}

function vercelBlobClient(token: string, fetchImpl: typeof fetch): BlobClient {
  const api = "https://blob.vercel-storage.com";
  return {
    async put(pathname, body) {
      const url = new URL(api);
      url.searchParams.set("pathname", pathname);
      const res = await fetchImpl(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-api-version": "7",
          "x-content-type": "application/json",
          "x-add-random-suffix": "0",
        },
        body,
      });
      if (!res.ok) throw new Error(`Quest blob put failed (${res.status})`);
    },
    async get(pathname) {
      const url = new URL(api);
      url.searchParams.set("pathname", pathname);
      const res = await fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-api-version": "7",
        },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Quest blob get failed (${res.status})`);
      const json = (await res.json()) as { url?: string } | string;
      if (typeof json === "string") return json;
      if (json.url) {
        const file = await fetchImpl(json.url);
        if (file.status === 404) return null;
        if (!file.ok) throw new Error(`Quest blob download failed (${file.status})`);
        return file.text();
      }
      return JSON.stringify(json);
    },
    async del(pathname) {
      const url = new URL(api);
      url.searchParams.set("url", pathname);
      const res = await fetchImpl(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-api-version": "7",
        },
      });
      if (!res.ok && res.status !== 404) throw new Error(`Quest blob del failed (${res.status})`);
    },
  };
}

export function blobQuestStore(client: BlobClient): NightlyExportStore {
  return makeStore({
    async readIndex() {
      const raw = await client.get(INDEX);
      return raw ? (JSON.parse(raw) as StoreIndex) : emptyIndex();
    },
    async writeIndex(index) {
      await client.put(INDEX, JSON.stringify(index));
    },
    async readRun(runId) {
      const raw = await client.get(runPath(runId));
      return raw ? (JSON.parse(raw) as NightlyRun) : null;
    },
    async writeRun(run) {
      await client.put(runPath(run.runId), JSON.stringify(run));
    },
    async deleteRun(runId) {
      await client.del(runPath(runId));
    },
  });
}

export function resolveQuestStore(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): {
  store: NightlyExportStore;
  kind: "blob" | "fs" | "memory";
} {
  const token = env.BLOB_READ_WRITE_TOKEN;
  if (token) return { store: blobQuestStore(vercelBlobClient(token, fetchImpl)), kind: "blob" };
  const dir = env.QUEST_EXPORT_STORE_DIR;
  if (dir) return { store: filesystemQuestStore(dir), kind: "fs" };
  return { store: filesystemQuestStore(path.join("/tmp", "quest-export-store")), kind: "fs" };
}

