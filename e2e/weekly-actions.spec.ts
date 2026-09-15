import { expect, test, type Page } from "@playwright/test";

async function waitForRealm(page: Page) {
  await expect(page.getByRole("status", { name: /Loading farm and lot data|Cargando fincas y lotes/ })).toHaveCount(0, {
    timeout: 30_000,
  });
}

const frozen = {
  week: "2026-W37",
  weekOf: "2026-09-07",
  generatedAt: "2026-09-11T12:00:00.000Z",
  horizon: 2027,
  asOf: "2026-09-11",
  requiredNetProfitPerDay: 16310.13,
  belowMinimum: false,
  lever: null,
  actions: [
    {
      id: "farm_fully_reserved_no_closings:avery",
      detector: "farm_fully_reserved_no_closings",
      councilRule: null,
      daysTowardGoal: 65.72,
      daysLabel: "gained",
      urgency: 1.5,
      score: 98.58,
      dueDate: "2026-08-01",
      href: "/pipeline?farm=Avery",
      formula: {
        dollars: 1071849.4,
        requiredNetProfitPerDay: 16310.13,
        conversionPct: 100,
        lotCount: 12,
        eraNetPerLot: null,
        days: 65.72,
        expression: "Σ netProfitAtStake × resolvedConversion ÷ requiredNetProfitPerDay",
      },
      records: { farmIds: ["a"], farmNames: ["Avery"], propertyIds: ["p1"], lotNames: ["Avery — Lot 1"], qualityIds: [], amounts: [1071849.4], dates: [] },
      fingerprint: "{\"d\":\"farm_fully_reserved_no_closings\",\"farmId\":\"a\"}",
      scoreDescription: "Necesito que cierres al menos un lote de Avery.",
      titleKey: "fullyReserved",
      whyKey: "fullyReservedWhy",
      titleParams: { farm: "Avery", reserved: 12 },
      whyParams: { dollars: "$1,071,849", days: "65.72", reserved: 12, perDay: "$16,310.13" },
      status: "pending",
      dismissReason: null,
    },
    {
      id: "committed_unfunded_capital",
      detector: "committed_unfunded_capital",
      councilRule: null,
      daysTowardGoal: 50.55,
      daysLabel: "gained",
      urgency: 1,
      score: 50.55,
      dueDate: null,
      href: "/warplan",
      formula: {
        dollars: 824400,
        requiredNetProfitPerDay: 16310.13,
        conversionPct: null,
        lotCount: null,
        eraNetPerLot: null,
        days: 50.55,
        expression: "capitalCommittedUnfunded ÷ requiredNetProfitPerDay",
      },
      records: { farmIds: [], farmNames: [], propertyIds: [], lotNames: [], qualityIds: [], amounts: [824400], dates: [] },
      fingerprint: "{\"d\":\"committed_unfunded_capital\",\"amount\":824400}",
      scoreDescription: "Necesito que fondees el capital comprometido sin fondear.",
      titleKey: "unfunded",
      whyKey: "unfundedWhy",
      titleParams: { amount: "$824,400" },
      whyParams: { amount: "$824,400", days: "50.55", perDay: "$16,310.13" },
      status: "pending",
      dismissReason: null,
    },
    {
      id: "idle_farm:lakeview",
      detector: "idle_farm",
      councilRule: null,
      daysTowardGoal: 47.7,
      daysLabel: "parked",
      urgency: 1,
      score: 47.7,
      dueDate: null,
      href: "/realm?farm=Lakeview",
      formula: {
        dollars: 777983,
        requiredNetProfitPerDay: 16310.13,
        conversionPct: null,
        lotCount: 12,
        eraNetPerLot: 64831.93,
        days: 47.7,
        expression: "availableLots × eraNetPerLot ÷ requiredNetProfitPerDay",
      },
      records: { farmIds: ["l"], farmNames: ["Lakeview"], propertyIds: [], lotNames: [], qualityIds: [], amounts: [64831.93], dates: [] },
      fingerprint: "{\"d\":\"idle_farm\",\"farmId\":\"l\"}",
      scoreDescription: "Necesito que reserves lotes en Lakeview.",
      titleKey: "idleFarm",
      whyKey: "idleFarmWhy",
      titleParams: { farm: "Lakeview", lots: 12 },
      whyParams: { lots: 12, era: "$64,832", days: "47.7", perDay: "$16,310.13" },
      status: "pending",
      dismissReason: null,
    },
  ],
};

test.describe("This week freeze and status", () => {
  test("freezes the list across reload and syncs done status", async ({ page }) => {
    const store: { week: Record<string, unknown> | null } = { week: null };

    await page.route("**/api/weekly-council", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, unavailable: true, reason: "weekly_read_unavailable" }),
      });
    });

    await page.route("**/api/weekly-actions", async (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, week: store.week, previous: null, history: [] }),
        });
        return;
      }
      if (req.method() === "POST") {
        const posted = req.postDataJSON() as { week?: typeof frozen };
        if (!store.week && posted.week) store.week = JSON.parse(JSON.stringify(posted.week)) as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, week: store.week, previous: null, history: [] }),
        });
        return;
      }
      if (req.method() === "PATCH") {
        const body = req.postDataJSON() as { actionId: string; status: "done" | "pending" | "dismissed"; reason?: string };
        if (store.week) {
          const actions = (store.week.actions as Array<Record<string, unknown>>).map((a) =>
            a.id === body.actionId ? { ...a, status: body.status, dismissReason: body.reason ?? null } : a,
          );
          store.week = { ...store.week, actions };
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, week: store.week, previous: null, history: [] }),
        });
      }
    });

    await page.goto("/");
    await waitForRealm(page);
    await expect(page.getByTestId("this-week-strip")).toBeVisible();
    await expect(page.getByTestId("weekly-action-card").first()).toBeVisible();
    const firstId = await page.getByTestId("weekly-action-card").first().getAttribute("data-id");
    expect(firstId).toBeTruthy();

    await page.getByTestId("weekly-action-card").first().getByTestId("weekly-action-done").click();
    await expect(page.getByTestId("weekly-action-card").first()).toHaveAttribute("data-status", "done");

    await page.reload();
    await waitForRealm(page);
    await expect(page.getByTestId("weekly-action-card").first()).toHaveAttribute("data-id", firstId!);
    await expect(page.getByTestId("weekly-action-card").first()).toHaveAttribute("data-status", "done");

    await page.goto("/council");
    await waitForRealm(page);
    await expect(page.getByTestId("weekly-actions-detail")).toBeVisible();
    await expect(page.getByTestId("weekly-action-card").first()).toHaveAttribute("data-status", "done");
    await expect(page.getByTestId("topbar-weekly")).toBeVisible();
  });
});
