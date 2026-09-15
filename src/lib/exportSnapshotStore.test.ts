import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildRealm } from "@/domain/realm";
import type { PaymentsSnapshot } from "@/domain/types";
import { memoryFrozenSnapshotStore } from "./exportSnapshotStore";
import { buildPlatformExport, type PlatformExportDocument } from "./platformExport";

const fixture = JSON.parse(
  readFileSync(new URL("../domain/__fixtures__/payments.json", import.meta.url), "utf8"),
) as PaymentsSnapshot;

const asOf = new Date("2026-09-11T00:00:00Z");

function exportOf(snapshot = fixture, snapshotAt = "2026-09-11T12:00:00.000Z"): PlatformExportDocument {
  const realm = buildRealm(snapshot, asOf, { deadline: "2028-12-31" });
  return buildPlatformExport(realm, {
    lang: "en",
    exitHorizon: 2028,
    commitSha: "abc123",
    snapshotAt,
  });
}

describe("frozen export snapshots", () => {
  it("saving twice creates two entries", async () => {
    const store = memoryFrozenSnapshotStore();
    const doc = exportOf();
    const first = await store.save("Reunión LPs octubre", doc, new Date("2026-09-11T12:00:00Z"));
    const second = await store.save("Reunión LPs octubre", doc, new Date("2026-09-11T12:01:00Z"));
    expect(first.id).not.toBe(second.id);
    const listed = await store.list();
    expect(listed).toHaveLength(2);
    expect(listed.map((s) => s.name)).toEqual(["Reunión LPs octubre", "Reunión LPs octubre"]);
  });

  it("a snapshot re-opened after the live data changes still shows the frozen figures", async () => {
    const store = memoryFrozenSnapshotStore();
    const live = exportOf();
    const profit = live.figures.find((f) => f.id === "throne.netProfitToDate");
    expect(typeof profit?.raw).toBe("number");
    const frozenRaw = profit?.raw;

    const saved = await store.save("LP meeting October", live);
    const mutated = exportOf();
    const liveProfit = mutated.figures.find((f) => f.id === "throne.netProfitToDate");
    if (!liveProfit || typeof liveProfit.raw !== "number") throw new Error("need net profit");
    liveProfit.raw = liveProfit.raw + 50_000;
    liveProfit.displayed = "MUTATED";

    const reopened = await store.get(saved.id);
    expect(reopened).toBeTruthy();
    const frozen = reopened?.figures.find((f) => f.id === "throne.netProfitToDate");
    expect(frozen?.raw).toBe(frozenRaw);
    expect(frozen?.displayed).not.toBe("MUTATED");
    expect(reopened?.meta.commitSha).toBe("abc123");
    expect(reopened?.meta.exitHorizon).toBe(2028);
    expect(reopened?.quality.length).toBe(live.quality.length);
  });

  it("never overwrites an existing id", async () => {
    const doc = exportOf();
    const store = memoryFrozenSnapshotStore([
      {
        id: "fixed-id",
        name: "first",
        createdAt: "2026-09-11T12:00:00.000Z",
        snapshotAt: doc.meta.snapshotAt,
        asOf: doc.meta.asOf,
        horizon: doc.meta.exitHorizon,
        commitSha: doc.meta.commitSha,
        document: doc,
      },
    ]);
    const again = await store.save("second", doc);
    expect(again.id).not.toBe("fixed-id");
    expect(await store.list()).toHaveLength(2);
    const original = await store.get("fixed-id");
    expect(original?.meta.snapshotAt).toBe(doc.meta.snapshotAt);
  });
});
