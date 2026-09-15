import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildRealm } from "@/domain/realm";
import type { PaymentsSnapshot } from "@/domain/types";
import { NIGHTLY_KEEP_RUNS, memoryNightlyExportStore, recordNightlyRun, runNightlyHorizon } from "./nightlyExport";
import { buildPlatformExport, type PlatformExportDocument } from "./platformExport";

const fixture = JSON.parse(
  readFileSync(new URL("../domain/__fixtures__/payments.json", import.meta.url), "utf8"),
) as PaymentsSnapshot;

const asOf = new Date("2026-09-11T12:00:00Z");

function fixtureExport(): PlatformExportDocument {
  const realm = buildRealm(fixture, asOf, { deadline: "2028-12-31" });
  return buildPlatformExport(realm, {
    lang: "en",
    exitHorizon: 2028,
    commitSha: "abc123",
    snapshotAt: "2026-09-11T12:00:00.000Z",
  });
}

describe("nightly export", () => {
  it("running twice on the same snapshot sends no alert", async () => {
    const store = memoryNightlyExportStore();
    const sent: string[] = [];
    const doc = fixtureExport();
    const base = {
      document: doc,
      store,
      sender: { send: async (text: string) => { sent.push(text); } },
      publicBaseUrl: "https://quest.example",
    };
    await recordNightlyRun({ ...base, now: asOf });
    const second = await recordNightlyRun({ ...base, now: new Date(asOf.getTime() + 60_000) });
    expect(second.alerts).toEqual([]);
    expect(second.sent).toBe(false);
    expect(sent).toEqual([]);
  });

  it("injecting one failing reconciliation sends exactly one alert", async () => {
    const store = memoryNightlyExportStore();
    const sent: string[] = [];
    const sender = { send: async (text: string) => { sent.push(text); } };
    const doc = fixtureExport();
    await recordNightlyRun({
      document: doc,
      now: asOf,
      store,
      sender,
      publicBaseUrl: "https://quest.example",
    });

    const broken = JSON.parse(JSON.stringify(doc)) as PlatformExportDocument;
    const check = broken.reconciliations.find((c) => c.pass);
    expect(check).toBeTruthy();
    if (!check) throw new Error("need a passing check");
    check.pass = false;

    const result = await recordNightlyRun({
      document: broken,
      now: new Date(asOf.getTime() + 60_000),
      store,
      sender,
      publicBaseUrl: "https://quest.example",
    });

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.kind).toBe("reconciliation_flip");
    expect(result.alerts[0]?.id).toBe(check.id);
    expect(result.sent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("old: pass");
    expect(sent[0]).toContain("new: fail");
    expect(sent[0]).toContain("/quality?nightlyDate=");
  });

  it("runNightlyHorizon uses the same export builder as /quality", async () => {
    const store = memoryNightlyExportStore();
    const result = await runNightlyHorizon({
      snapshot: fixture,
      horizon: 2028,
      commitSha: "abc123",
      now: asOf,
      store,
      publicBaseUrl: "https://quest.example",
    });
    const button = fixtureExport();
    expect(result.run.document.figures.map((f) => f.id)).toEqual(button.figures.map((f) => f.id));
    expect(result.run.document.reconciliations.map((c) => c.id)).toEqual(button.reconciliations.map((c) => c.id));
    expect(result.alerts).toEqual([]);
    expect(result.sent).toBe(false);
  });

  it("rolls runs older than 90 into a monthly summary", async () => {
    const store = memoryNightlyExportStore();
    const document = fixtureExport();
    for (let i = 0; i < NIGHTLY_KEEP_RUNS + 3; i += 1) {
      const createdAt = new Date(Date.UTC(2026, 0, 1 + i, 6, 0, 0)).toISOString();
      await store.put({
        runId: `run-${i}`,
        date: createdAt.slice(0, 10),
        horizon: 2028,
        commitSha: "old",
        createdAt,
        asOf: document.meta.asOf,
        snapshotAt: createdAt,
        alertCount: 0,
        document,
        alerts: [],
      });
    }
    const monthly = await store.prune(NIGHTLY_KEEP_RUNS);
    expect((await store.list()).length).toBe(NIGHTLY_KEEP_RUNS);
    expect(monthly.some((m) => m.yearMonth === "2026-01" && m.runCount === 3)).toBe(true);
  });
});
