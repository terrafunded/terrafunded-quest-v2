import { expect, test, type Page } from "@playwright/test";

/** Ledger contract-price total verified in GOAL.md; tolerance documented in PROGRESS.md. */
const VERIFIED_LEDGER_TOTAL = "$8,986,794.30";

const ROUTES = ["/", "/realm", "/quests", "/sponsors", "/treasury", "/oracle", "/chronicle", "/trophies", "/quality"] as const;

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[console.error] ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
  return errors;
}

/** Waits until the realm query has resolved on the current page (skeletons gone). */
async function waitForRealm(page: Page) {
  await expect(page.getByRole("status", { name: "Loading realm data" })).toHaveCount(0, { timeout: 30_000 });
}

test.describe("Throne Room", () => {
  test("renders the net-profit counter as a dollar amount greater than zero", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");
    const counter = page.getByTestId("net-profit-counter");
    await expect(counter).toBeVisible();
    await expect(counter).toHaveText(/^\$[\d,]+$/);
    await expect
      .poll(async () => Number(await counter.getAttribute("data-value")), { timeout: 20_000 })
      .toBeGreaterThan(0);
    await expect(page.getByTestId("verdict")).toContainText(/lots\/month/);
    expect(errors).toEqual([]);
  });
});

test.describe("Quests ledger", () => {
  test("totals row shows the verified contract-price total", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/quests");
    await waitForRealm(page);
    const totals = page.getByTestId("ledger-totals");
    await expect(totals).toBeVisible();
    await expect(page.getByTestId("ledger-total-contract-price")).toHaveText(VERIFIED_LEDGER_TOTAL);
    await expect(page.getByTestId("ledger-row")).toHaveCount(71);
    expect(errors).toEqual([]);
  });

  test("filters and sorting change the visible rows", async ({ page }) => {
    await page.goto("/quests");
    await waitForRealm(page);
    await page.getByLabel("Filter by farm").selectOption("Lamar");
    await expect(page.getByTestId("ledger-row")).toHaveCount(9);
    await page.getByLabel("Filter by stage").selectOption("note_sold");
    await expect(page.getByTestId("ledger-row")).toHaveCount(7);
    await page.getByRole("button", { name: /^Net/ }).click();
    const first = await page.getByTestId("ledger-row").first().textContent();
    expect(first).toContain("Lamar");
  });
});

test.describe("Every route renders without console errors", () => {
  for (const route of ROUTES) {
    test(`${route}`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.goto(route);
      await waitForRealm(page);
      await expect(page.locator("main h1").first()).toBeVisible();
      // give lazy chunks and charts a moment to settle
      await page.waitForTimeout(500);
      expect(errors).toEqual([]);
    });
  }

  test("/login renders the form when signed out", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto("/login");
    await expect(page.getByRole("form", { name: "Sign in" })).toBeVisible();
    await page.goto("/quests");
    await expect(page).toHaveURL(/\/login$/);
    expect(errors).toEqual([]);
    await context.close();
  });
});

test.describe("Page specifics", () => {
  test("realm map draws one territory per farm and 109 lot tiles", async ({ page }) => {
    await page.goto("/realm");
    await waitForRealm(page);
    await expect(page.getByTestId("territory")).toHaveCount(9);
    await expect(page.getByTestId("lot-tile")).toHaveCount(109);
  });

  test("quality panel lists the documented disagreements", async ({ page }) => {
    await page.goto("/quality");
    await waitForRealm(page);
    const list = page.getByTestId("quality-list");
    for (const lot of ["Titus — Lot 6", "Lamar — Lot 5", "Lamar — Lot 6", "Lamar — Lot 7", "Eastland — Lot 3"]) {
      await expect(list.locator("[data-kind='price_mismatch']", { hasText: lot })).toHaveCount(1);
    }
  });

  test("sponsors shows Townson Family as the only profit-share card", async ({ page }) => {
    await page.goto("/sponsors");
    await waitForRealm(page);
    const cards = page.getByTestId("sponsor-card");
    await expect(cards.filter({ hasText: "Profit share" })).toHaveCount(1);
    await expect(cards.filter({ hasText: "Profit share" })).toContainText("Townson Family");
  });

  test("trophies renders at least 15 cards", async ({ page }) => {
    await page.goto("/trophies");
    await waitForRealm(page);
    expect(await page.getByTestId("trophy-card").count()).toBeGreaterThanOrEqual(15);
  });
});
