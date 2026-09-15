import { expect, test, type Page } from "@playwright/test";

async function waitForRealm(page: Page) {
  await expect(page.getByRole("status", { name: "Loading farm and lot data" })).toHaveCount(0, { timeout: 30_000 });
}

const MOCK_READ = {
  ok: true,
  cached: false,
  generatedAt: "2026-09-12T23:40:00.000Z",
  week: "2026-W37",
  weekOf: "2026-09-07",
  horizon: 2027,
  lang: "en",
  tokenCount: 180,
  read: {
    week_of: "2026-09-07",
    headline: "Close the stuck reservations this week.",
    actions: [
      { action: "Call every stuck buyer.", why: "Trapped profit is sitting in reservations.", worth: "the trapped dollars" },
      { action: "Keep the closings moving.", why: "Daily pace is below the horizon.", worth: "days left" },
      { action: "Do not raise a farm this week.", why: "Inventory already covers some of what remains.", worth: "lots available" },
    ],
    watch_out: "The binding constraint is the close, not a new farm.",
  },
};

test.describe("Council", () => {
  test("renders the ledger cards when the weekly read is unavailable", async ({ page }) => {
    await page.route("**/api/weekly-council", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, unavailable: true, reason: "weekly_read_unavailable" }),
      });
    });
    await page.goto("/council");
    await waitForRealm(page);
    await expect(page.getByTestId("council-page")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /Recommendations|Recomendaciones/ })).toBeVisible();
    await expect(page.getByTestId("weekly-read")).toBeVisible();
    await expect(page.getByTestId("weekly-read-unavailable")).toBeVisible();
    await expect(page.getByTestId("weekly-read-body")).toHaveCount(0);
    await expect(page.getByTestId("council-insights")).toBeVisible();
    await expect(page.getByTestId("council-insight")).toHaveCount(9);
    await expect(page.getByTestId("weekly-read")).toHaveAttribute("data-source", "written");
    await expect(page.getByTestId("council-insights")).toHaveAttribute("data-source", "ledger");
  });

  test("shows the written weekly read above the computed cards", async ({ page }) => {
    await page.route("**/api/weekly-council", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_READ) });
    });
    await page.goto("/council");
    await waitForRealm(page);
    await expect(page.getByTestId("weekly-read-headline")).toHaveText("Close the stuck reservations this week.");
    await expect(page.getByTestId("weekly-read-action")).toHaveCount(3);
    await expect(page.getByTestId("weekly-read-watch")).toContainText("binding constraint");
    await expect(page.getByTestId("weekly-read-generated")).toContainText(/generated|generada/i);
    await expect(page.getByTestId("weekly-read-disclaimer")).toBeVisible();
    await expect(page.getByTestId("council-insight")).toHaveCount(9);
    const weeklyBox = await page.getByTestId("weekly-read").boundingBox();
    const ledgerBox = await page.getByTestId("council-insights").boundingBox();
    expect(weeklyBox && ledgerBox && weeklyBox.y < ledgerBox.y).toBe(true);
  });

  test("Regenerate disables the button and shows a spinner while in flight", async ({ page }) => {
    const gate = { resolve: () => undefined as void };
    const held = new Promise<void>((resolve) => {
      gate.resolve = resolve;
    });
    await page.route("**/api/weekly-council", async (route) => {
      const posted = route.request().postDataJSON() as { force?: boolean };
      if (posted.force) {
        await held;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...MOCK_READ, read: { ...MOCK_READ.read, headline: "Fresh read." } }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_READ) });
    });
    await page.goto("/council");
    await waitForRealm(page);
    const button = page.getByTestId("weekly-read-regenerate");
    await expect(button).toBeEnabled();
    await button.click();
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(button.locator("svg.animate-spin")).toBeVisible();
    gate.resolve();
    await expect(page.getByTestId("weekly-read-headline")).toHaveText("Fresh read.");
    await expect(button).toBeEnabled();
  });

  test("Spanish chrome does not use the English weekly labels", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("quest.lang", "es"));
    await page.route("**/api/weekly-council", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, unavailable: true, reason: "weekly_read_unavailable" }),
      });
    });
    await page.goto("/council");
    await waitForRealm(page);
    await expect(page.getByRole("heading", { level: 1, name: "Recomendaciones" })).toBeVisible();
    await expect(page.getByTestId("weekly-read-label")).toContainText("Lectura semanal");
    await expect(page.getByTestId("weekly-read-unavailable")).toContainText("no disponible");
    await expect(page.getByTestId("council-insights-label")).toHaveText("De los registros");
  });
});
