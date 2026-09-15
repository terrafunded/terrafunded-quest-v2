import { isExitHorizon } from "../../src/config/goal";
import { addDays, parseDate } from "../../src/domain/dates";
import { chicagoIsoWeek, isoWeekOf } from "../../src/domain/isoWeek";
import type { FrozenWeeklyAction, FrozenWeeklyWeek, WeeklyActionStatus } from "../../src/domain/weeklyActions";
import { bearerToken, verifyQuestSession } from "../_weeklyCouncil/auth";
import { defaultWeeklyActionsStore, type WeeklyActionsStore } from "./store";

export interface WeeklyActionsDeps {
  now?: Date;
  store?: WeeklyActionsStore;
  verifySession?: (token: string) => Promise<{ ok: true; userId: string; email: string | null } | { ok: false }>;
  env?: Record<string, string | undefined>;
}

type WeeklyActionsOk = {
  ok: true;
  week: FrozenWeeklyWeek | null;
  previous: FrozenWeeklyWeek | null;
  history: FrozenWeeklyWeek[];
};

type WeeklyActionsErr = {
  ok: false;
  unavailable: true;
  reason: "unauthorized" | "weekly_actions_unavailable";
};

function json(status: number, body: WeeklyActionsOk | WeeklyActionsErr): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function unavailable(reason: WeeklyActionsErr["reason"]): Response {
  const status = reason === "unauthorized" ? 401 : 200;
  return json(status, { ok: false, unavailable: true, reason });
}

function isFrozenWeek(value: unknown): value is FrozenWeeklyWeek {
  if (!value || typeof value !== "object") return false;
  const w = value as FrozenWeeklyWeek;
  return typeof w.week === "string" && /^\d{4}-W\d{2}$/.test(w.week) && Array.isArray(w.actions);
}

const STATUSES: WeeklyActionStatus[] = ["pending", "done", "dismissed"];

async function historyOf(store: WeeklyActionsStore, except?: string): Promise<FrozenWeeklyWeek[]> {
  const weeks = await store.list();
  const out: FrozenWeeklyWeek[] = [];
  for (const week of weeks) {
    if (week === except) continue;
    const doc = await store.get(week);
    if (!doc) continue;
    out.push(doc);
  }
  return out.sort((a, b) => b.week.localeCompare(a.week));
}

function previousIsoWeek(week: FrozenWeeklyWeek | string, weekOf?: string): string | null {
  const of = typeof week === "string" ? weekOf : week.weekOf;
  if (!of) {
    const id = typeof week === "string" ? week : week.week;
    const m = /^(\d{4})-W(\d{2})$/.exec(id);
    if (!m) return null;
    const year = Number(m[1]);
    const num = Number(m[2]);
    if (num > 1) return `${year}-W${String(num - 1).padStart(2, "0")}`;
    return isoWeekOf(new Date(Date.UTC(year, 0, 4 - 7))).week;
  }
  const monday = parseDate(of);
  if (!monday) return null;
  return isoWeekOf(addDays(monday, -7)).week;
}

/**
 * Shared handler for Vercel and the Vite preview plugin.
 * Same auth pattern as weekly-council: Bearer required; failed verify returns 200.
 */
export async function handleWeeklyActions(request: Request, deps: WeeklyActionsDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const store = deps.store ?? defaultWeeklyActionsStore(env);
  const now = deps.now ?? new Date();
  const verify = deps.verifySession ?? ((token: string) => verifyQuestSession(token, env));

  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return unavailable("unauthorized");
  const session = await verify(token);
  if (!session.ok) {
    return json(200, { ok: false, unavailable: true, reason: "unauthorized" });
  }

  const clock = chicagoIsoWeek(now);
  const url = new URL(request.url);
  const requestedWeek = url.searchParams.get("week") ?? clock.week;

  if (request.method === "GET") {
    const week = await store.get(requestedWeek);
    const prevId = previousIsoWeek(week ?? requestedWeek, week?.weekOf ?? clock.weekOf);
    const previous = prevId ? await store.get(prevId) : null;
    return json(200, { ok: true, week, previous, history: await historyOf(store, week?.week) });
  }

  if (request.method === "POST") {
    let body: { week?: unknown };
    try {
      body = (await request.json()) as { week?: unknown };
    } catch {
      return json(200, { ok: false, unavailable: true, reason: "weekly_actions_unavailable" });
    }
    if (!isFrozenWeek(body.week)) {
      return json(200, { ok: false, unavailable: true, reason: "weekly_actions_unavailable" });
    }
    const incoming = body.week;
    if (!isExitHorizon(incoming.horizon)) {
      return json(200, { ok: false, unavailable: true, reason: "weekly_actions_unavailable" });
    }
    const existing = await store.get(incoming.week);
    if (existing) {
      const prevId = previousIsoWeek(existing.week);
      const previous = prevId ? await store.get(prevId) : null;
      return json(200, { ok: true, week: existing, previous, history: await historyOf(store, existing.week) });
    }
    const frozen: FrozenWeeklyWeek = {
      ...incoming,
      generatedAt: incoming.generatedAt || now.toISOString(),
      actions: incoming.actions.map((a) => ({
        ...a,
        status: a.status ?? "pending",
        dismissReason: a.dismissReason ?? null,
      })),
    };
    await store.put(frozen);
    const prevId = previousIsoWeek(frozen.week);
    const previous = prevId ? await store.get(prevId) : null;
    return json(200, { ok: true, week: frozen, previous, history: await historyOf(store, frozen.week) });
  }

  if (request.method === "PATCH") {
    let body: { week?: string; actionId?: string; status?: WeeklyActionStatus; reason?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json(200, { ok: false, unavailable: true, reason: "weekly_actions_unavailable" });
    }
    const weekId = body.week || requestedWeek;
    const existing = await store.get(weekId);
    if (!existing || !body.actionId || !body.status || !STATUSES.includes(body.status)) {
      return json(200, { ok: false, unavailable: true, reason: "weekly_actions_unavailable" });
    }
    if (body.status === "dismissed" && !body.reason?.trim()) {
      return json(200, { ok: false, unavailable: true, reason: "weekly_actions_unavailable" });
    }
    const actions: FrozenWeeklyAction[] = existing.actions.map((a) =>
      a.id === body.actionId
        ? { ...a, status: body.status!, dismissReason: body.status === "dismissed" ? body.reason!.trim() : null }
        : a,
    );
    const next = { ...existing, actions };
    await store.put(next);
    const prevId = previousIsoWeek(next.week);
    const previous = prevId ? await store.get(prevId) : null;
    return json(200, { ok: true, week: next, previous, history: await historyOf(store, next.week) });
  }

  return json(405, { ok: false, unavailable: true, reason: "weekly_actions_unavailable" });
}
