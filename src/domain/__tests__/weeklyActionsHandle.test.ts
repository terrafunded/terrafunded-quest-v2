import { describe, expect, it } from "vitest";
import { handleWeeklyActions } from "../../../api/_weeklyActions/handle";
import { memoryWeeklyActionsStore } from "../../../api/_weeklyActions/store";
import { freezeWeeklyActions, computeWeeklyActions } from "../weeklyActions";
import { buildRealm } from "../realm";
import raw from "../__fixtures__/payments.json";
import type { PaymentsSnapshot } from "../types";

const fixture = raw as unknown as PaymentsSnapshot;
const ASOF = new Date("2026-09-11T00:00:00Z");
const NOW = new Date("2026-09-11T17:00:00Z");

function request(over: { token?: string | null; method?: string; body?: unknown; url?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (over.token !== null) headers.set("authorization", `Bearer ${over.token ?? "sess"}`);
  const method = over.method ?? "GET";
  return new Request(over.url ?? "http://127.0.0.1/api/weekly-actions", {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(over.body ?? {}),
  });
}

function deps(store = memoryWeeklyActionsStore()) {
  return {
    store,
    now: NOW,
    verifySession: async () => ({ ok: true as const, userId: "u1", email: "a@b.c" }),
    env: {},
  };
}

describe("handleWeeklyActions", () => {
  const realm = buildRealm(fixture, ASOF);
  const generated = computeWeeklyActions(realm, ASOF, "en");
  const frozen = freezeWeeklyActions(generated, NOW.toISOString(), 2027);

  it("returns 401 without a Bearer token and 200 when verify fails", async () => {
    const noTok = await handleWeeklyActions(request({ token: null }), deps());
    expect(noTok.status).toBe(401);
    const failed = await handleWeeklyActions(request(), {
      ...deps(),
      verifySession: async () => ({ ok: false as const }),
    });
    expect(failed.status).toBe(200);
    const body = (await failed.json()) as { reason: string };
    expect(body.reason).toBe("unauthorized");
  });

  it("freezes the first POST and ignores a reshuffled second POST", async () => {
    const store = memoryWeeklyActionsStore();
    const first = await handleWeeklyActions(request({ method: "POST", body: { week: frozen } }), deps(store));
    expect(first.status).toBe(200);
    const saved = (await first.json()) as { ok: true; week: { actions: { id: string }[] } };
    expect(saved.week.actions[0]?.id).toBe(frozen.actions[0]?.id);

    const shuffled = { ...frozen, actions: [...frozen.actions].reverse() };
    const second = await handleWeeklyActions(request({ method: "POST", body: { week: shuffled } }), deps(store));
    const again = (await second.json()) as { ok: true; week: { actions: { id: string }[] } };
    expect(again.week.actions.map((a) => a.id)).toEqual(saved.week.actions.map((a) => a.id));
  });

  it("patches status and requires a dismiss reason", async () => {
    const store = memoryWeeklyActionsStore();
    await handleWeeklyActions(request({ method: "POST", body: { week: frozen } }), deps(store));
    const id = frozen.actions[0]!.id;
    const bad = await handleWeeklyActions(
      request({ method: "PATCH", body: { week: frozen.week, actionId: id, status: "dismissed" } }),
      deps(store),
    );
    expect(((await bad.json()) as { ok: boolean }).ok).toBe(false);

    const ok = await handleWeeklyActions(
      request({ method: "PATCH", body: { week: frozen.week, actionId: id, status: "dismissed", reason: "Already called" } }),
      deps(store),
    );
    const body = (await ok.json()) as { ok: true; week: { actions: { id: string; status: string; dismissReason: string | null }[] } };
    expect(body.week.actions[0]?.status).toBe("dismissed");
    expect(body.week.actions[0]?.dismissReason).toBe("Already called");
  });
});
