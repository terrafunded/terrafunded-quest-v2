import { describe, expect, it, vi } from "vitest";
import { handleWeeklyCouncil } from "./handle";
import { memoryStore } from "./cache";
import { WEEKLY_COUNCIL_REGENERATE_DAILY_LIMIT } from "./types";
import type { WeeklyFacts } from "../../src/domain/weeklyCouncil";

const NOW = new Date("2026-09-13T15:40:00Z");

const facts: WeeklyFacts = {
  week: "2026-W37",
  week_of: "2026-09-07",
  horizon: 2027,
  lang: "en",
  summary: {
    netProfitToDate: "$2,272,304",
    remaining: "$7,727,696",
    deadline: "2027-12-31",
    daysLeft: "474",
    producingPerDay: "$8,986.79",
    requiredPerDay: "$16,303.16",
    closingsPerMonth: "4.4",
    requiredClosingsPerMonth: "8.31",
    reservationsPerMonth: "7.2",
    requiredReservationsPerMonth: "11.1",
    conversion: "75%",
    lotsAvailable: "12",
    lotsReserved: "8",
    lotsStillNeeded: "20",
    stuckCount: "3",
    trappedProfit: "$1,116,863",
    stuckAfterDays: "60",
    avgNetProfitPerLot: "$45,000.00",
    recentAvgNetProfitPerLot: "$48,000.00",
    thisWeekDays: "7",
  },
  farms: [],
  sponsors: [],
  recycledNext90: [],
  historyLast6: [],
  insights: [],
};

const validRead = {
  week_of: "2026-09-07",
  headline: "Close the 3 stuck reservations; $7,727,696 remains.",
  actions: [
    { action: "Call every stuck buyer this week.", why: "3 reservations trap $1,116,863.", worth: "$1,116,863" },
    { action: "Keep closings moving.", why: "Producing $8,986.79 a day against $16,303.16 required.", worth: "474" },
    { action: "Do not raise a farm this week.", why: "12 lots are available and 20 are still needed.", worth: "7" },
  ],
  watch_out: "The 2027 horizon is 2027-12-31.",
};

function anthropicFetch(text: string, calls: { n: number }) {
  return vi.fn(async () => {
    calls.n += 1;
    return new Response(
      JSON.stringify({
        content: [{ type: "text", text }],
        usage: { input_tokens: 100, output_tokens: 80 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

function request(over: { token?: string | null; body?: unknown; method?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (over.token !== null) headers.set("authorization", `Bearer ${over.token ?? "sess"}`);
  return new Request("http://127.0.0.1/api/weekly-council", {
    method: over.method ?? "POST",
    headers,
    body: over.method === "GET" ? undefined : JSON.stringify(over.body ?? { facts, force: false }),
  });
}

function deps(over: {
  store?: ReturnType<typeof memoryStore>;
  fetchImpl?: typeof fetch;
  env?: { ANTHROPIC_API_KEY?: string };
} = {}) {
  return {
    now: NOW,
    store: over.store ?? memoryStore(),
    fetchImpl: over.fetchImpl ?? anthropicFetch(JSON.stringify(validRead), { n: 0 }),
    verifySession: async (token: string) => (token ? { ok: true as const, userId: "u1", email: "a@b.c" } : { ok: false as const }),
    env: { ANTHROPIC_API_KEY: over.env?.ANTHROPIC_API_KEY ?? "sk-ant-test-not-real" },
  };
}

async function parse(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("handleWeeklyCouncil", () => {
  it("rejects a missing or invalid session with 401", async () => {
    const none = await parse(await handleWeeklyCouncil(request({ token: null }), deps()));
    expect(none.status).toBe(401);
    expect(none.body).toMatchObject({ ok: false, unavailable: true, reason: "unauthorized" });

    const bad = await parse(
      await handleWeeklyCouncil(request({ token: "x" }), {
        ...deps(),
        verifySession: async () => ({ ok: false as const }),
      }),
    );
    expect(bad.status).toBe(401);
    expect(bad.body).toMatchObject({ reason: "unauthorized" });
  });

  it("returns weekly_read_unavailable on a missing or invalid key, never the provider text", async () => {
    const missing = await parse(await handleWeeklyCouncil(request(), deps({ env: { ANTHROPIC_API_KEY: "" } })));
    expect(missing.status).toBe(200);
    expect(missing.body).toMatchObject({ ok: false, unavailable: true, reason: "weekly_read_unavailable" });
    expect(JSON.stringify(missing.body)).not.toMatch(/sk-ant|anthropic|invalid x-api-key/i);

    const invalid = await parse(
      await handleWeeklyCouncil(
        request(),
        deps({
          fetchImpl: vi.fn(async () => new Response("authentication_error: invalid x-api-key", { status: 401 })),
        }),
      ),
    );
    expect(invalid.body).toMatchObject({ ok: false, reason: "weekly_read_unavailable" });
    expect(JSON.stringify(invalid.body)).not.toMatch(/authentication_error|invalid x-api-key/i);
  });

  it("discards a reply that cites a number absent from the payload", async () => {
    const store = memoryStore();
    const bad = { ...validRead, watch_out: "This is worth $99,999,999." };
    const res = await parse(
      await handleWeeklyCouncil(request(), deps({ store, fetchImpl: anthropicFetch(JSON.stringify(bad), { n: 0 }) })),
    );
    expect(res.body).toMatchObject({ ok: false, unavailable: true, reason: "weekly_read_unavailable" });
    expect(JSON.stringify(res.body)).not.toContain("99,999,999");
    expect(await store.get("2026-W37", 2027, "en")).toBeNull();
  });

  it("discards malformed JSON and does not cache it", async () => {
    const store = memoryStore();
    const res = await parse(
      await handleWeeklyCouncil(request(), deps({ store, fetchImpl: anthropicFetch("not json at all", { n: 0 }) })),
    );
    expect(res.body).toMatchObject({ ok: false, reason: "weekly_read_unavailable" });
    expect(JSON.stringify(res.body)).not.toContain("not json");
    expect(await store.get("2026-W37", 2027, "en")).toBeNull();
  });

  it("serves the second load in the same week from cache without calling the model", async () => {
    const store = memoryStore();
    const calls = { n: 0 };
    const fetchImpl = anthropicFetch(JSON.stringify(validRead), calls);
    const d = deps({ store, fetchImpl });
    const first = await parse(await handleWeeklyCouncil(request(), d));
    expect(first.body).toMatchObject({ ok: true, cached: false });
    expect(calls.n).toBe(1);
    const second = await parse(await handleWeeklyCouncil(request(), d));
    expect(second.body).toMatchObject({ ok: true, cached: true });
    expect((second.body.read as { headline: string }).headline).toBe(validRead.headline);
    expect(calls.n).toBe(1);
  });

  it("Regenerate bypasses the cache and overwrites it", async () => {
    const store = memoryStore();
    const calls = { n: 0 };
    const firstText = JSON.stringify(validRead);
    const secondRead = { ...validRead, headline: "Call the 3 stuck buyers first." };
    const fetchImpl = vi.fn(async () => {
      calls.n += 1;
      const text = calls.n === 1 ? firstText : JSON.stringify(secondRead);
      return new Response(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 10 } }), {
        status: 200,
      });
    });
    const d = deps({ store, fetchImpl });
    await handleWeeklyCouncil(request(), d);
    const forced = await parse(await handleWeeklyCouncil(request({ body: { facts, force: true } }), d));
    expect(forced.body).toMatchObject({ ok: true, cached: false });
    expect((forced.body.read as { headline: string }).headline).toBe("Call the 3 stuck buyers first.");
    expect(calls.n).toBe(2);
    const cached = await store.get("2026-W37", 2027, "en");
    expect(cached?.read.headline).toBe("Call the 3 stuck buyers first.");
  });

  it("returns the named daily limit message on the 11th forced call", async () => {
    const store = memoryStore({
      records: [],
      forces: [{ userId: "u1", day: "2026-09-13", count: WEEKLY_COUNCIL_REGENERATE_DAILY_LIMIT }],
    });
    const calls = { n: 0 };
    const res = await parse(
      await handleWeeklyCouncil(request({ body: { facts, force: true } }), deps({ store, fetchImpl: anthropicFetch(JSON.stringify(validRead), calls) })),
    );
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      ok: false,
      unavailable: true,
      reason: "regenerate_limit",
      limit: WEEKLY_COUNCIL_REGENERATE_DAILY_LIMIT,
    });
    expect(calls.n).toBe(0);
  });

  it("a horizon switch misses the other horizon's cache and generates once", async () => {
    const store = memoryStore();
    const calls = { n: 0 };
    const fetchImpl = anthropicFetch(JSON.stringify(validRead), calls);
    const d = deps({ store, fetchImpl });
    await handleWeeklyCouncil(request(), d);
    expect(calls.n).toBe(1);
    const other = { ...facts, horizon: 2028 as const };
    const switched = await parse(await handleWeeklyCouncil(request({ body: { facts: other, force: false } }), d));
    expect(switched.body).toMatchObject({ ok: true, cached: false, horizon: 2028 });
    expect(calls.n).toBe(2);
  });
});
