/**
 * Nightly export: the same `buildPlatformExport` the /quality button runs,
 * stored in a Quest-owned store, diffed against the previous run, alerted
 * only when something actually changed.
 */

import { deadlineForHorizon, EXIT_HORIZONS, type ExitHorizon } from "@/config/goal";
import { buildRealm } from "@/domain/realm";
import type { PaymentsSnapshot } from "@/domain/types";
import {
  diffExports,
  formatExportAlertMessage,
  type AlertExportRef,
  type ExportAlert,
} from "./exportDiff";
import { cloneExportDocument } from "./exportSnapshotStore";
import { buildPlatformExport, type PlatformExportDocument } from "./platformExport";

export const NIGHTLY_KEEP_RUNS = 90;

export interface NightlyRunMeta {
  runId: string;
  date: string;
  horizon: number;
  commitSha: string;
  createdAt: string;
  asOf: string;
  snapshotAt: string;
  alertCount: number;
}

export interface NightlyRun extends NightlyRunMeta {
  document: PlatformExportDocument;
  alerts: ExportAlert[];
}

export interface MonthlyRunSummary {
  yearMonth: string;
  horizon: number;
  runCount: number;
  firstCreatedAt: string;
  lastCreatedAt: string;
  commitShas: string[];
  alertCount: number;
}

export interface NightlyExportStore {
  put(run: NightlyRun): Promise<void>;
  get(runId: string): Promise<NightlyRun | null>;
  getByKey(date: string, horizon: number, commitSha: string): Promise<NightlyRun | null>;
  getPrevious(horizon: number, beforeCreatedAt: string): Promise<NightlyRun | null>;
  list(): Promise<NightlyRunMeta[]>;
  prune(keep?: number): Promise<MonthlyRunSummary[]>;
  listMonthly(): Promise<MonthlyRunSummary[]>;
}

export interface AlertSender {
  send(text: string): Promise<void>;
}

export function newNightlyRunId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `nightly-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function memoryNightlyExportStore(): NightlyExportStore {
  const runs = new Map<string, NightlyRun>();
  const monthly = new Map<string, MonthlyRunSummary>();

  return {
    async put(run) {
      runs.set(run.runId, {
        ...run,
        document: cloneExportDocument(run.document),
        alerts: [...run.alerts],
      });
    },
    async get(runId) {
      const hit = runs.get(runId);
      return hit ? { ...hit, document: cloneExportDocument(hit.document), alerts: [...hit.alerts] } : null;
    },
    async getByKey(date, horizon, commitSha) {
      const matches = [...runs.values()]
        .filter((r) => r.date === date && r.horizon === horizon && r.commitSha === commitSha)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const hit = matches[0];
      return hit ? { ...hit, document: cloneExportDocument(hit.document), alerts: [...hit.alerts] } : null;
    },
    async getPrevious(horizon, beforeCreatedAt) {
      const matches = [...runs.values()]
        .filter((r) => r.horizon === horizon && r.createdAt < beforeCreatedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const hit = matches[0];
      return hit ? { ...hit, document: cloneExportDocument(hit.document), alerts: [...hit.alerts] } : null;
    },
    async list() {
      return [...runs.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ document: _document, alerts: _alerts, ...meta }) => meta);
    },
    async prune(keep = NIGHTLY_KEEP_RUNS) {
      const sorted = [...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const drop = sorted.slice(keep);
      for (const run of drop) {
        runs.delete(run.runId);
        const yearMonth = run.createdAt.slice(0, 7);
        const key = `${yearMonth}:${run.horizon}`;
        const existing = monthly.get(key);
        if (!existing) {
          monthly.set(key, {
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
      return [...monthly.values()].sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
    },
    async listMonthly() {
      return [...monthly.values()].sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
    },
  };
}

export function qualityPageExportUrl(
  baseUrl: string,
  ref: { date: string; horizon: number; commitSha: string },
): string {
  const url = new URL("/quality", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  url.searchParams.set("nightlyDate", ref.date);
  url.searchParams.set("horizon", String(ref.horizon));
  url.searchParams.set("sha", ref.commitSha);
  return url.toString();
}

export interface RecordNightlyRunInput {
  document: PlatformExportDocument;
  now: Date;
  store: NightlyExportStore;
  sender?: AlertSender;
  publicBaseUrl: string;
}

export interface RunNightlyHorizonInput extends Omit<RecordNightlyRunInput, "document"> {
  snapshot: PaymentsSnapshot;
  horizon: ExitHorizon;
  commitSha: string;
  appVersion?: string;
  lang?: "en" | "es";
}

export interface RunNightlyHorizonResult {
  run: NightlyRun;
  previous: NightlyRun | null;
  alerts: ExportAlert[];
  sent: boolean;
}

/**
 * Build one horizon's export with the same function the /quality button uses,
 * store it, diff against the previous run, and email only when something changed.
 */
export async function recordNightlyRun(input: RecordNightlyRunInput): Promise<RunNightlyHorizonResult> {
  const createdAt = input.now.toISOString();
  const date = createdAt.slice(0, 10);
  const document = input.document;
  const previous = await input.store.getPrevious(document.meta.exitHorizon, createdAt);
  const alerts = previous ? diffExports(previous.document, document) : [];

  const run: NightlyRun = {
    runId: newNightlyRunId(),
    date,
    horizon: document.meta.exitHorizon,
    commitSha: document.meta.commitSha,
    createdAt,
    asOf: document.meta.asOf,
    snapshotAt: document.meta.snapshotAt,
    alertCount: alerts.length,
    document,
    alerts,
  };
  await input.store.put(run);
  await input.store.prune(NIGHTLY_KEEP_RUNS);

  let sent = false;
  if (alerts.length > 0 && previous && input.sender) {
    const prevRef: AlertExportRef = {
      date: previous.date,
      horizon: previous.horizon,
      commitSha: previous.commitSha,
      url: qualityPageExportUrl(input.publicBaseUrl, previous),
    };
    const currRef: AlertExportRef = {
      date: run.date,
      horizon: run.horizon,
      commitSha: run.commitSha,
      url: qualityPageExportUrl(input.publicBaseUrl, run),
    };
    await input.sender.send(formatExportAlertMessage(alerts, prevRef, currRef));
    sent = true;
  }

  return { run, previous, alerts, sent };
}

export async function runNightlyHorizon(input: RunNightlyHorizonInput): Promise<RunNightlyHorizonResult> {
  const createdAt = input.now.toISOString();
  const lang = input.lang ?? "en";
  const realm = buildRealm(input.snapshot, input.now, {
    deadline: deadlineForHorizon(input.horizon),
    lang,
  });
  const document = buildPlatformExport(realm, {
    lang,
    exitHorizon: input.horizon,
    commitSha: input.commitSha,
    appVersion: input.appVersion ?? "2.0.0",
    snapshotAt: createdAt,
  });
  return recordNightlyRun({
    document,
    now: input.now,
    store: input.store,
    sender: input.sender,
    publicBaseUrl: input.publicBaseUrl,
  });
}

export async function runNightlyAllHorizons(
  input: Omit<RunNightlyHorizonInput, "horizon"> & { horizons?: readonly ExitHorizon[] },
): Promise<RunNightlyHorizonResult[]> {
  const horizons = input.horizons ?? EXIT_HORIZONS;
  const out: RunNightlyHorizonResult[] = [];
  for (const horizon of horizons) {
    out.push(await runNightlyHorizon({ ...input, horizon }));
  }
  return out;
}
