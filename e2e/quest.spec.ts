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

  test("the Debt counter shows capital owed, days left and a required net profit per day, all > 0", async ({ page }) => {
    await page.goto("/");
    await waitForRealm(page);
    const debt = page.getByTestId("debt");
    await expect(debt).toBeVisible();

    const owed = page.getByTestId("debt-capital-owed");
    await expect(owed).toHaveText(/^\$[\d,]+$/);
    await expect.poll(async () => Number(await owed.getAttribute("data-value"))).toBeGreaterThan(0);

    const daysLeft = Number(await page.getByTestId("debt-days-left").getAttribute("data-value"));
    expect(daysLeft).toBeGreaterThan(0);
    // Deadline is 2027-12-31; whatever "today" is, the count must be consistent with it.
    const today = new Date();
    const expectedDays = Math.round((Date.UTC(2027, 11, 31) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000);
    expect(daysLeft).toBe(expectedDays);

    const perDay = page.getByTestId("debt-per-day");
    await expect.poll(async () => Number(await perDay.getAttribute("data-value"))).toBeGreaterThan(0);
    // The daily requirement is a fraction of what is owed, never the whole sum.
    await expect
      .poll(async () => Number(await perDay.getAttribute("data-value")) < Number(await owed.getAttribute("data-value")))
      .toBe(true);
  });

  test("the Oxygen score equals the sum of days gained in the ledger", async ({ page }) => {
    await page.goto("/quests");
    await waitForRealm(page);
    const cells = page.getByTestId("ledger-oxygen");
    await expect(cells).toHaveCount(71);
    const values = await cells.evaluateAll((els) => els.map((el) => el.getAttribute("data-value") ?? ""));
    const dated = values.filter((v) => v !== "");
    expect(dated.length).toBeGreaterThan(0);
    const ledgerSum = dated.reduce((acc, v) => acc + Number(v), 0);
    expect(Number(await page.getByTestId("ledger-total-oxygen").getAttribute("data-value"))).toBe(ledgerSum);

    await page.goto("/");
    await waitForRealm(page);
    const score = page.getByTestId("oxygen-score");
    await expect(score).toBeVisible();
    await expect.poll(async () => Number(await score.getAttribute("data-value")), { timeout: 20_000 }).toBe(ledgerSum);
    expect(ledgerSum).toBeGreaterThanOrEqual(0);
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

  test("trophies renders at least 15 cards with rarity badges and the streaks panel", async ({ page }) => {
    await page.goto("/trophies");
    await waitForRealm(page);
    expect(await page.getByTestId("trophy-card").count()).toBeGreaterThanOrEqual(15);
    expect(await page.locator("[data-rarity='legendary']").count()).toBeGreaterThan(0);
    await expect(page.getByTestId("streaks")).toBeVisible();
    await expect(page.getByTestId("streak-current")).toContainText(/\d+ weeks?/);
  });
});

test.describe("Phase 2: Epic", () => {
  test("every territory carries a campaign state and the detail panel explains it", async ({ page }) => {
    await page.goto("/realm");
    await waitForRealm(page);
    const territories = page.getByTestId("territory");
    await expect(territories).toHaveCount(9);
    const states = await territories.evaluateAll((els) => els.map((el) => el.getAttribute("data-campaign")));
    for (const s of states) expect(["conquered", "under_siege", "losing_ground"]).toContain(s);
    await territories.first().click();
    const panel = page.getByTestId("campaign");
    await expect(panel).toBeVisible();
    expect(states).toContain(await panel.getAttribute("data-state"));
  });

  test("sponsors shows hostages with capital-returned bars and a liberated gallery", async ({ page }) => {
    await page.goto("/sponsors");
    await waitForRealm(page);
    // First visit to /sponsors plays the liberation fanfare for farms already freed; dismiss it.
    const fanfare = page.getByTestId("celebration");
    if (await fanfare.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await expect(fanfare).toHaveCount(0);
    }
    const hostages = page.getByTestId("hostage");
    expect(await hostages.count()).toBeGreaterThan(0);
    const freed = hostages.locator("xpath=self::*[@data-freed='true']");
    expect(await freed.count()).toBeGreaterThan(0);
    await expect(page.getByTestId("liberated-gallery")).toBeVisible();
  });

  test("oracle shows three futures, and the required pace lands on or before the deadline", async ({ page }) => {
    await page.goto("/oracle");
    await waitForRealm(page);
    const futures = page.getByTestId("future");
    await expect(futures).toHaveCount(3);
    for (const id of ["current_pace", "required_pace", "one_more_farm"]) {
      await expect(page.locator(`[data-future='${id}']`)).toBeVisible();
    }
    await expect(page.locator("[data-future='required_pace']").getByTestId("future-exit")).toHaveText(/(2026|2027)/);
  });

  test("chronicle narrates every event in prose", async ({ page }) => {
    await page.goto("/chronicle");
    await waitForRealm(page);
    const prose = page.getByTestId("chronicle-prose");
    expect(await prose.count()).toBeGreaterThan(10);
    await expect(prose.filter({ hasText: /claimed Lot \d+ of/ }).first()).toBeVisible();
    await expect(prose.filter({ hasText: /The realm gained \d+ days?\./ }).first()).toBeVisible();
  });
});
