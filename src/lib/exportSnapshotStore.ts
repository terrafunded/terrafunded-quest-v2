/**
 * Immutable named snapshots of a platform export (the LP conversation freeze).
 * Browser: IndexedDB. Tests: memory. Never updates or overwrites an existing id.
 */

import type { PlatformExportDocument } from "./platformExport";

export const FROZEN_SNAPSHOT_DB = "quest-export-snapshots";
export const FROZEN_SNAPSHOT_STORE = "snapshots";

export interface FrozenSnapshotMeta {
  id: string;
  name: string;
  createdAt: string;
  snapshotAt: string;
  asOf: string;
  horizon: number;
  commitSha: string;
}

export interface FrozenSnapshotRecord extends FrozenSnapshotMeta {
  document: PlatformExportDocument;
}

export interface FrozenSnapshotStore {
  save(name: string, document: PlatformExportDocument, now?: Date): Promise<FrozenSnapshotMeta>;
  list(): Promise<FrozenSnapshotMeta[]>;
  get(id: string): Promise<PlatformExportDocument | null>;
}

export function cloneExportDocument(document: PlatformExportDocument): PlatformExportDocument {
  return JSON.parse(JSON.stringify(document)) as PlatformExportDocument;
}

export function metaOfRecord(record: FrozenSnapshotRecord): FrozenSnapshotMeta {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    snapshotAt: record.snapshotAt,
    asOf: record.asOf,
    horizon: record.horizon,
    commitSha: record.commitSha,
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `snap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function memoryFrozenSnapshotStore(seed: FrozenSnapshotRecord[] = []): FrozenSnapshotStore {
  const records = new Map<string, FrozenSnapshotRecord>();
  for (const row of seed) records.set(row.id, { ...row, document: cloneExportDocument(row.document) });

  return {
    async save(name, document, now = new Date()) {
      const frozen = cloneExportDocument(document);
      const id = newId();
      const record: FrozenSnapshotRecord = {
        id,
        name,
        createdAt: now.toISOString(),
        snapshotAt: frozen.meta.snapshotAt,
        asOf: frozen.meta.asOf,
        horizon: frozen.meta.exitHorizon,
        commitSha: frozen.meta.commitSha,
        document: frozen,
      };
      records.set(id, record);
      return metaOfRecord(record);
    },
    async list() {
      return [...records.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(metaOfRecord);
    },
    async get(id) {
      const hit = records.get(id);
      return hit ? cloneExportDocument(hit.document) : null;
    },
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FROZEN_SNAPSHOT_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FROZEN_SNAPSHOT_STORE)) {
        db.createObjectStore(FROZEN_SNAPSHOT_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB request failed"));
  });
}

export function indexedDbFrozenSnapshotStore(): FrozenSnapshotStore {
  return {
    async save(name, document, now = new Date()) {
      const frozen = cloneExportDocument(document);
      const id = newId();
      const record: FrozenSnapshotRecord = {
        id,
        name,
        createdAt: now.toISOString(),
        snapshotAt: frozen.meta.snapshotAt,
        asOf: frozen.meta.asOf,
        horizon: frozen.meta.exitHorizon,
        commitSha: frozen.meta.commitSha,
        document: frozen,
      };
      const db = await openDb();
      try {
        const tx = db.transaction(FROZEN_SNAPSHOT_STORE, "readwrite");
        // `add` refuses an existing key — snapshots are immutable.
        await idbReq(tx.objectStore(FROZEN_SNAPSHOT_STORE).add(record));
      } finally {
        db.close();
      }
      return metaOfRecord(record);
    },
    async list() {
      const db = await openDb();
      try {
        const tx = db.transaction(FROZEN_SNAPSHOT_STORE, "readonly");
        const rows = (await idbReq(tx.objectStore(FROZEN_SNAPSHOT_STORE).getAll())) as FrozenSnapshotRecord[];
        return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(metaOfRecord);
      } finally {
        db.close();
      }
    },
    async get(id) {
      const db = await openDb();
      try {
        const tx = db.transaction(FROZEN_SNAPSHOT_STORE, "readonly");
        const hit = (await idbReq(tx.objectStore(FROZEN_SNAPSHOT_STORE).get(id))) as FrozenSnapshotRecord | undefined;
        return hit ? cloneExportDocument(hit.document) : null;
      } finally {
        db.close();
      }
    },
  };
}

export function browserFrozenSnapshotStore(): FrozenSnapshotStore {
  if (typeof indexedDB === "undefined") return memoryFrozenSnapshotStore();
  return indexedDbFrozenSnapshotStore();
}
