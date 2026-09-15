import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { PaymentsSnapshot } from "@/domain/types";
import { handleNightlyExport } from "../../api/_nightlyExport/handle";
import { memoryNightlyExportStore } from "./nightlyExport";

const fixture = JSON.parse(
  readFileSync(new URL("../domain/__fixtures__/payments.json", import.meta.url), "utf8"),
) as PaymentsSnapshot;

describe("nightly-export HTTP handler", () => {
  it("POST twice on the same snapshot returns no sent alert", async () => {
    const store = memoryNightlyExportStore();
    const sent: string[] = [];
    const deps = {
      store,
      storeKind: "memory" as const,
      sender: { send: async (text: string) => { sent.push(text); } },
      fetchSnapshot: async () => fixture,
      verifySession: async () => ({ ok: true as const, userId: "u", email: "quest@test" }),
      commitSha: "abc123",
      publicBaseUrl: "https://quest.example",
      env: {},
    };
    const post = (now: Date) =>
      handleNightlyExport(
        new Request("https://quest.example/api/nightly-export?horizon=2028", {
          method: "POST",
          headers: { authorization: "Bearer test" },
        }),
        { ...deps, now },
      );

    const first = await post(new Date("2026-09-11T06:00:00Z"));
    const second = await post(new Date("2026-09-11T06:01:00Z"));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const body = (await second.json()) as { sent: boolean; runs: { alertCount: number }[] };
    expect(body.sent).toBe(false);
    expect(body.runs.every((r) => r.alertCount === 0)).toBe(true);
    expect(sent).toEqual([]);
  });
});
