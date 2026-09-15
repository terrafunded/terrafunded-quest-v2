import { EXIT_HORIZONS, isExitHorizon, type ExitHorizon } from "../../src/config/goal";
import { bearerToken, verifyQuestSession } from "../_weeklyCouncil/auth";
import type { SessionOk } from "../_weeklyCouncil/types";
import {
  runNightlyAllHorizons,
  type AlertSender,
  type NightlyExportStore,
  type NightlyRun,
} from "../../src/lib/nightlyExport";
import type { PaymentsSnapshot } from "../../src/domain/types";
import { resendAlertSender } from "./email";
import { fetchLivePaymentsSnapshot } from "./fetchLive";
import { resolveQuestStore } from "./questStore";

export interface NightlyExportDeps {
  now?: Date;
  store?: NightlyExportStore;
  storeKind?: "blob" | "fs" | "memory";
  sender?: AlertSender | null;
  fetchSnapshot?: () => Promise<PaymentsSnapshot>;
  fetchImpl?: typeof fetch;
  verifySession?: (token: string) => Promise<SessionOk | { ok: false }>;
  env?: Record<string, string | undefined>;
  commitSha?: string;
  publicBaseUrl?: string;
}

type NightlyOk = {
  ok: true;
  persisted: boolean;
  store: "blob" | "fs" | "memory";
  sent: boolean;
  runs: {
    runId: string;
    date: string;
    horizon: number;
    commitSha: string;
    alertCount: number;
    sent: boolean;
  }[];
};

type NightlyErr = { ok: false; reason: string };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function publicBase(env: Record<string, string | undefined>): string {
  return env.QUEST_PUBLIC_URL ?? "https://quest.terrafunded.com";
}

function commitOf(env: Record<string, string | undefined>, override?: string): string {
  return override ?? env.VERCEL_GIT_COMMIT_SHA ?? env.VITE_VERCEL_GIT_COMMIT_SHA ?? "local";
}

function isCron(request: Request, env: Record<string, string | undefined>): boolean {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function authorize(
  request: Request,
  deps: NightlyExportDeps,
  env: Record<string, string | undefined>,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (isCron(request, env)) return { ok: true };
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return { ok: false, response: json(401, { ok: false, reason: "unauthorized" } satisfies NightlyErr) };
  const verify = deps.verifySession ?? ((t: string) => verifyQuestSession(t, env));
  const session = await verify(token);
  if (!session.ok) return { ok: false, response: json(401, { ok: false, reason: "unauthorized" } satisfies NightlyErr) };
  return { ok: true };
}

function parseHorizon(value: string | null): ExitHorizon | null {
  if (!value) return null;
  const n = Number(value);
  return isExitHorizon(n) ? n : null;
}

export async function handleNightlyExport(request: Request, deps: NightlyExportDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const auth = await authorize(request, deps, env);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const resolved = deps.store
    ? { store: deps.store, kind: deps.storeKind ?? "memory" as const }
    : resolveQuestStore(env, deps.fetchImpl ?? fetch);
  const store = resolved.store;

  if (request.method === "GET") {
    const runId = url.searchParams.get("runId");
    const date = url.searchParams.get("date") ?? url.searchParams.get("nightlyDate");
    const sha = url.searchParams.get("sha");
    const horizon = parseHorizon(url.searchParams.get("horizon"));
    if (runId) {
      const run = await store.get(runId);
      if (!run) return json(404, { ok: false, reason: "not_found" } satisfies NightlyErr);
      return json(200, { ok: true, run: publicRun(run) });
    }
    if (date && sha && horizon !== null) {
      const run = await store.getByKey(date, horizon, sha);
      if (!run) return json(404, { ok: false, reason: "not_found" } satisfies NightlyErr);
      return json(200, { ok: true, run: publicRun(run) });
    }
    const runs = await store.list();
    const monthly = await store.listMonthly();
    return json(200, { ok: true, runs, monthly });
  }

  if (request.method !== "POST") {
    return json(405, { ok: false, reason: "method_not_allowed" } satisfies NightlyErr);
  }

  let requested: ExitHorizon[] | undefined;
  const rawHorizon = url.searchParams.get("horizon");
  const one = parseHorizon(rawHorizon);
  if (rawHorizon && one === null) return json(400, { ok: false, reason: "bad_horizon" } satisfies NightlyErr);
  if (one) requested = [one];

  const now = deps.now ?? new Date();
  const fetchSnapshot = deps.fetchSnapshot ?? (() => fetchLivePaymentsSnapshot(env));
  let snapshot: PaymentsSnapshot;
  try {
    snapshot = await fetchSnapshot();
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch_failed";
    return json(500, { ok: false, reason: message } satisfies NightlyErr);
  }

  const sender = deps.sender === undefined ? resendAlertSender(env, deps.fetchImpl ?? fetch) : deps.sender;
  const results = await runNightlyAllHorizons({
    snapshot,
    horizons: requested ?? EXIT_HORIZONS,
    commitSha: commitOf(env, deps.commitSha),
    now,
    store,
    sender: sender ?? undefined,
    publicBaseUrl: deps.publicBaseUrl ?? publicBase(env),
  });

  const body: NightlyOk = {
    ok: true,
    persisted: resolved.kind !== "memory",
    store: resolved.kind,
    sent: results.some((r) => r.sent),
    runs: results.map((r) => ({
      runId: r.run.runId,
      date: r.run.date,
      horizon: r.run.horizon,
      commitSha: r.run.commitSha,
      alertCount: r.alerts.length,
      sent: r.sent,
    })),
  };
  return json(200, body);
}

function publicRun(run: NightlyRun) {
  return {
    runId: run.runId,
    date: run.date,
    horizon: run.horizon,
    commitSha: run.commitSha,
    createdAt: run.createdAt,
    alerts: run.alerts,
    document: run.document,
  };
}
