import { expect, test, type Page } from "@playwright/test";

/** Ledger contract-price total verified in GOAL.md; tolerance documented in PROGRESS.md. */
const VERIFIED_LEDGER_TOTAL = "$8,986,794.30";

const ROUTES = ["/", "/warplan", "/realm", "/quests", "/pipeline", "/sponsors", "/treasury", "/oracle", "/chronicle", "/trophies", "/quality"] as const;

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

/** Opens the hamburger drawer (same chrome on every viewport). */
async function openNavDrawer(page: Page) {
  await page.getByTestId("nav-menu-button").click();
  await expect(page.getByTestId("nav-drawer")).toBeVisible();
}

/** Navigates via the drawer: open → click the labelled route → drawer closes. */
async function goViaDrawer(page: Page, name: string | RegExp) {
  await openNavDrawer(page);
  await page.getByTestId("nav-drawer").getByRole("link", { name }).click();
  await expect(page.getByTestId("nav-drawer")).toHaveCount(0);
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
    const netHeader = page.getByRole("button", { name: /^Net/ });
    if (await netHeader.isVisible()) await netHeader.click();
    else await page.getByTestId("mobile-sort").selectOption("netProfit");
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

test.describe("Themes", () => {
  test("the login menu switches the skin and the choice persists in localStorage", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    await page.goto("/login");
    await expect(page.getByTestId("theme-menu")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "iron-crown");

    await page.locator("[data-theme-option='neon-kingdom']").first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "neon-kingdom");
    expect(await page.evaluate(() => localStorage.getItem("quest.theme"))).toBe("neon-kingdom");
    // The HUD uses monospace numbers; the other two do not.
    const mono = await page.locator("html").evaluate((el) => el.ownerDocument.defaultView!.getComputedStyle(el).getPropertyValue("--font-numeric"));
    expect(mono).toContain("JetBrains Mono");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "neon-kingdom");

    await page.locator("[data-theme-option='gilded-realm']").first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "gilded-realm");
    await expect(page.locator("html")).toHaveClass(/light/);
    expect(errors).toEqual([]);
    await context.close();
  });

  for (const theme of ["iron-crown", "gilded-realm", "neon-kingdom"] as const) {
    test(`${theme}: the Throne Room renders its ambient layer, glowing counter and themed nav without console errors`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.addInitScript((t) => localStorage.setItem("quest.theme", t), theme);
      await page.goto("/");
      await waitForRealm(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByTestId("ambient-particles")).toBeAttached();
      await expect(page.getByTestId("net-profit-counter")).toHaveClass(/counter-glow/);
      await expect(page.getByTestId("page-transition")).toBeVisible();
      await goViaDrawer(page, "Quests");
      await expect(page).toHaveURL(/\/quests$/);
      await waitForRealm(page);
      await expect(page.getByTestId("ledger-row").first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test("reduced motion disables the ambient layer", async ({ browser }) => {
    const context = await browser.newContext({ storageState: "playwright/.auth/user.json", reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    await waitForRealm(page);
    await expect(page.getByTestId("net-profit-counter")).toBeVisible();
    await expect(page.getByTestId("ambient-particles")).toHaveCount(0);
    await context.close();
  });
});

test.describe("Pipeline layer", () => {
  test("the stuck-pipeline counter renders on the Throne Room and matches the /pipeline list", async ({ page }) => {
    await page.goto("/");
    await waitForRealm(page);
    const panel = page.getByTestId("pipeline");
    await expect(panel).toBeVisible();
    const trapped = page.getByTestId("pipeline-trapped");
    await expect(trapped).toHaveText(/^\$[\d,]+$/);
    const stuckCount = Number(await page.getByTestId("pipeline-stuck-count").getAttribute("data-value"));
    expect(stuckCount).toBeGreaterThanOrEqual(0);
    // the counter tweens toward data-target; read the target rather than a mid-flight frame
    const trappedValue = Number(await trapped.getAttribute("data-target"));
    if (stuckCount === 0) expect(trappedValue).toBe(0);
    else expect(trappedValue).toBeGreaterThan(0);
    await expect(panel.getByTestId("pipeline-reservations-per-month")).toHaveText(/^\d+(\.\d+)?$/);

    await page.goto("/pipeline");
    await waitForRealm(page);
    await expect(page.getByTestId("pipeline-farm")).toHaveCount(9);
    const rows = page.getByTestId("stuck-row");
    await expect(rows).toHaveCount(stuckCount);
    if (stuckCount > 0) {
      const days = await rows.evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-days"))));
      for (let i = 1; i < days.length; i++) expect(days[i - 1]).toBeGreaterThanOrEqual(days[i]!);
      expect(days.at(-1)).toBeGreaterThanOrEqual(60);
      const total = (await page.getByTestId("stuck-total-trapped").textContent()) ?? "";
      expect(Math.round(Number(total.replace(/[^\d.-]/g, "")))).toBe(trappedValue);
    }

    await page.goto("/quests?filter=stuck");
    await waitForRealm(page);
    await expect(page.getByTestId("ledger-row")).toHaveCount(stuckCount);
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

test.describe("Navigation drawer", () => {
  test("opens from the top bar, lists every route, and closes on route change", async ({ page }) => {
    await page.goto("/");
    await waitForRealm(page);
    await expect(page.getByTestId("topbar")).toBeVisible();
    await expect(page.getByTestId("topbar-realm-name")).toHaveText(/Exodus/i);
    await expect(page.getByTestId("nav-drawer")).toHaveCount(0);

    await openNavDrawer(page);
    const drawer = page.getByTestId("nav-drawer");
    for (const label of ["Throne Room", "War Plan", "The Realm", "Quests", "Pipeline", "Sponsors", "Treasury", "Oracle", "Chronicle", "Trophies", "Data Quality"]) {
      await expect(drawer.getByRole("link", { name: label })).toBeVisible();
    }
    await expect(drawer.getByTestId("theme-menu")).toBeVisible();
    await expect(drawer.getByTestId("nav-user-email")).not.toBeEmpty();

    await drawer.getByRole("link", { name: "Pipeline" }).click();
    await expect(page).toHaveURL(/\/pipeline$/);
    await expect(page.getByTestId("nav-drawer")).toHaveCount(0);
  });

  test("traps focus inside the drawer and returns it to the hamburger on close", async ({ page }) => {
    await page.goto("/");
    await waitForRealm(page);
    const hamburger = page.getByTestId("nav-menu-button");
    await hamburger.click();
    const drawer = page.getByTestId("nav-drawer");
    await expect(drawer).toBeVisible();

    // Focus should land inside the drawer (close button or first focusable).
    await expect.poll(async () => drawer.locator(":focus").count()).toBeGreaterThan(0);

    // Tab through many times — focus must never leave the drawer.
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="nav-drawer"]');
        return !!root && root.contains(document.activeElement);
      });
      expect(inside).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(hamburger).toBeFocused();
  });
});
