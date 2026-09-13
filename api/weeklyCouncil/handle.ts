import { createHash } from "node:crypto";
import { isExitHorizon } from "../../src/config/goal";
import { isoWeekOf, utcToday } from "../../src/domain/isoWeek";
import { validateWeeklyRead, type WeeklyFacts } from "../../src/domain/weeklyCouncil";
import { completeWeeklyRead } from "./anthropic";
import { bearerToken, verifyQuestSession } from "./auth";
import { defaultWeeklyStore } from "./cache";
import { WEEKLY_COUNCIL_REGENERATE_DAILY_LIMIT } from "./types";
import type { WeeklyCouncilDeps, WeeklyCouncilErr, WeeklyCouncilOk, WeeklyCouncilResponse } from "./types";

function json(status: number, body: WeeklyCouncilResponse): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function unavailable(reason: WeeklyCouncilErr["reason"], extra?: Partial<WeeklyCouncilErr>): Response {
  const status = reason === "unauthorized" ? 401 : reason === "regenerate_limit" ? 429 : 200;
  return json(status, { ok: false, unavailable: true, reason, ...extra });
}

function isFacts(value: unknown): value is WeeklyFacts {
  if (!value || typeof value !== "object") return false;
  const f = value as WeeklyFacts;
  return (
    typeof f.week === "string" &&
    /^\d{4}-W\d{2}$/.test(f.week) &&
    typeof f.week_of === "string" &&
    isExitHorizon(f.horizon) &&
    (f.lang === "en" || f.lang === "es") &&
    typeof f.summary === "object" &&
    f.summary !== null &&
    Array.isArray(f.insights)
  );
}

function payloadHash(facts: WeeklyFacts): string {
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}

function nextUtcMidnight(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

/**
 * Shared handler for Vercel and the Vite preview plugin.
 * ANTHROPIC_API_KEY is read only from deps.env / process.env — never returned, never logged.
 */
export async function handleWeeklyCouncil(
  request: Request,
  deps: WeeklyCouncilDeps = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return json(405, { ok: false, unavailable: true, reason: "weekly_read_unavailable" });
  }

  const env = deps.env ?? process.env;
  const store = deps.store ?? defaultWeeklyStore();
  const now = deps.now ?? new Date();
  const verify = deps.verifySession ?? ((token: string) => verifyQuestSession(token, env));
  const fetchImpl = deps.fetchImpl ?? fetch;

  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return unavailable("unauthorized");

  const session = await verify(token);
  if (!session.ok) return unavailable("unauthorized");

  let body: { facts?: unknown; force?: unknown };
  try {
    body = (await request.json()) as { facts?: unknown; force?: unknown };
  } catch {
    return unavailable("weekly_read_unavailable");
  }

  if (!isFacts(body.facts)) return unavailable("weekly_read_unavailable");
  const facts = body.facts;
  const force = body.force === true;

  // Cache key is the server clock's ISO week + the requested horizon (and language).
  // A mid-week fact change does not regenerate; Regenerate or a horizon switch does.
  const clock = isoWeekOf(utcToday(now));
  const week = clock.week;
  const horizon = facts.horizon;
  const lang = facts.lang;

  if (!force) {
    const hit = await store.get(week, horizon, lang);
    if (hit) {
      const ok: WeeklyCouncilOk = {
        ok: true,
        cached: true,
        generatedAt: hit.generatedAt,
        week: hit.week,
        weekOf: facts.week_of,
        horizon: hit.horizon,
        lang: hit.lang,
        tokenCount: hit.tokenCount,
        read: hit.read,
      };
      return json(200, ok);
    }
  }

  if (force) {
    const day = now.toISOString().slice(0, 10);
    const count = await store.incrementForceCount(session.userId, day);
    if (count > WEEKLY_COUNCIL_REGENERATE_DAILY_LIMIT) {
      return unavailable("regenerate_limit", {
        limit: WEEKLY_COUNCIL_REGENERATE_DAILY_LIMIT,
        reset: nextUtcMidnight(now),
      });
    }
  }

  const apiKey = env.ANTHROPIC_API_KEY ?? "";
  const completion = await completeWeeklyRead(apiKey, JSON.stringify(facts), fetchImpl);
  if (!completion.ok) return unavailable("weekly_read_unavailable");

  const validated = validateWeeklyRead(completion.text, facts);
  if (!validated.ok || !validated.read) return unavailable("weekly_read_unavailable");

  const generatedAt = now.toISOString();
  await store.set({
    week,
    horizon,
    lang,
    payloadHash: payloadHash(facts),
    read: validated.read,
    generatedAt,
    tokenCount: completion.tokenCount,
  });

  const ok: WeeklyCouncilOk = {
    ok: true,
    cached: false,
    generatedAt,
    week,
    weekOf: facts.week_of,
    horizon,
    lang,
    tokenCount: completion.tokenCount,
    read: validated.read,
  };
  return json(200, ok);
}
