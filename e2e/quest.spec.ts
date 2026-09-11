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

  test("quality groups the documented disagreements one card per lot, in Spanish by default", async ({ page }) => {
    await page.goto("/quality");
    await waitForRealm(page);
    await expect(page.getByTestId("quality-page")).toHaveAttribute("data-lang", "es");
    await expect(page.getByRole("heading", { level: 1, name: "Calidad de datos" })).toBeVisible();
    for (const lot of ["Titus — Lot 6", "Lamar — Lot 5", "Lamar — Lot 6", "Lamar — Lot 7", "Eastland — Lot 3"]) {
      const card = page.locator(`[data-testid='quality-card'][data-lot='${lot}']`);
      await expect(card).toHaveCount(1);
      await expect(card.locator("[data-kind='price_mismatch']")).toHaveCount(1);
    }
    // Every price mismatch shows the two figures side by side and says which one Quest uses.
    const lamar5 = page.locator("[data-testid='quality-card'][data-lot='Lamar — Lot 5']").locator("[data-kind='price_mismatch']");
    await expect(lamar5.getByTestId("quality-values")).toHaveAttribute("data-line", /^Expediente: \$[\d,]+\.\d{2} \/ Nota: \$[\d,]+\.\d{2}$/);
    await expect(lamar5.getByTestId("quality-fix")).toContainText("File Cases → Lamar Lot 5 → Sale price");
    await expect(lamar5.getByTestId("quality-using")).toContainText(/^Quest usa la nota/);
    await expect(lamar5.getByTestId("quality-technical").locator("summary")).toHaveText("Detalles técnicos");
    // Column names stay behind the collapsed technical toggle.
    expect(await page.getByTestId("quality-list").innerText()).not.toMatch(/file_cases|original_amount|sale_price|investor_capital|is_sold/);
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

test.describe("Data Quality for operations", () => {
  /** Captures clipboard writes in-page so the test can read what "Copiar para WhatsApp" produced. */
  async function stubClipboard(page: Page) {
    await page.addInitScript(() => {
      const copied: string[] = [];
      (window as unknown as { __copied: string[] }).__copied = copied;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: (text: string) => (copied.push(text), Promise.resolve()) },
      });
    });
  }
  const lastCopied = (page: Page) => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied.at(-1) ?? "");

  test("summary counts lots and farms with issues, the dollars moved by price mismatches and the oldest open issue", async ({ page }) => {
    await page.goto("/quality");
    await waitForRealm(page);
    const summary = page.getByTestId("quality-summary");
    // Live Payments keeps fixing cases (fixture: 18 lots, live: 15 on 2026-09-11 — OPEN_QUESTIONS #59),
    // so the lot count is checked for shape and against the card list rather than pinned.
    const lots = Number(await summary.getByTestId("quality-summary-lots").getAttribute("data-value"));
    expect(lots).toBeGreaterThan(0);
    await expect(summary.getByTestId("quality-summary-lots")).toContainText(/y \d+ fincas/);
    const farms = Number((await summary.getByTestId("quality-summary-lots").innerText()).match(/y (\d+) fincas/)?.[1]);
    await expect(page.getByTestId("quality-card")).toHaveCount(lots + farms);
    // The five price mismatches are still on file: $21,801.50 of net profit between file case and note.
    await expect(summary.getByTestId("quality-summary-dollars")).toHaveAttribute("data-value", "21801.5");
    await expect(summary.getByTestId("quality-summary-dollars")).toHaveText("$21,801.50");
    await expect(summary).toContainText("suma de las diferencias en 5 lotes; Quest usa la nota");
    await expect(summary.getByTestId("quality-summary-oldest")).toHaveText("Ben White");
    await expect(summary).toContainText(/\d+ días · desde el 30 jul 2024/);
    const benWhite = page.locator("[data-testid='quality-card'][data-lot='Ben White']");
    await expect(benWhite).toHaveCount(1);
    await expect(benWhite).toContainText("Finca");
    await expect(benWhite.locator("[data-kind='farm_capital_null']").getByTestId("quality-fix")).toContainText("Farm Acquisitions → Ben White → Investor capital");
  });

  test("Copiar para WhatsApp puts a Spanish plain-text message with the lot name on the clipboard", async ({ page }) => {
    await stubClipboard(page);
    await page.goto("/quality");
    await waitForRealm(page);
    const card = page.locator("[data-testid='quality-card'][data-lot='Lamar — Lot 5']");
    const copy = card.getByTestId("quality-copy-card");
    await expect(copy).toHaveText(/Copiar para WhatsApp/);
    await copy.click();
    await expect(copy).toHaveAttribute("data-status", "copied");
    await expect(copy).toHaveText(/Copiado/);
    const text = await lastCopied(page);
    expect(text).toContain("Lamar — Lot 5");
    expect(text.split("\n")[0]).toMatch(/^\*Lamar — Lot 5\* \(finca Lamar\) — \d+ problemas?$/);
    expect(text).toContain("Precio distinto entre expediente y nota");
    expect(text).toMatch(/Expediente: \$[\d,]+\.\d{2} \/ Nota: \$[\d,]+\.\d{2}/);
    expect(text).toContain("Corregir en Payments: File Cases → Lamar Lot 5 → Sale price");
    expect(text).not.toMatch(/<[a-z]+>|file_cases|original_amount/);

    const all = page.getByTestId("quality-copy-all");
    await all.click();
    await expect(all).toHaveAttribute("data-status", "copied");
    const everything = await lastCopied(page);
    expect(everything.split("\n")[0]).toMatch(/^\*Calidad de datos — \d{1,2} [a-z]{3} \d{4}\*$/);
    const lots = Number(await page.getByTestId("quality-summary-lots").getAttribute("data-value"));
    expect(everything.split("\n")[1]).toBe(`${lots} lotes con problemas y 3 fincas · $21,801.50 de ganancia afectada por diferencias de precio`);
    expect(everything.split("\n")[2]).toBe("");
    for (const lot of ["Titus — Lot 6", "Lamar — Lot 5", "Lamar — Lot 6", "Lamar — Lot 7", "Eastland — Lot 3", "Ben White"]) expect(everything).toContain(`*${lot}*`);
  });

  test("Revisado and Nota persist in localStorage per lot and issue kind, and reviewed issues can be hidden", async ({ page }) => {
    await page.goto("/quality");
    await waitForRealm(page);
    const card = page.locator("[data-testid='quality-card'][data-lot='Lamar — Lot 5']");
    const issue = card.locator("[data-kind='price_mismatch']");
    const reviewed = issue.getByTestId("quality-reviewed");
    await expect(reviewed).toHaveAttribute("aria-checked", "false");
    await reviewed.click();
    await expect(reviewed).toHaveAttribute("aria-checked", "true");
    await expect(issue).toHaveAttribute("data-reviewed", "true");
    await issue.getByTestId("quality-note").fill("Pedido a contabilidad");
    await issue.getByTestId("quality-note").press("Enter");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("quest.quality.review") ?? "{}") as Record<string, { reviewed: boolean; note: string }>);
    expect(stored["Lamar — Lot 5::price_mismatch"]).toMatchObject({ reviewed: true, note: "Pedido a contabilidad" });
    // The oldest-open summary and the per-card tally react to the review.
    await expect(card).toContainText("1 de");

    await page.reload();
    await waitForRealm(page);
    await expect(issue.getByTestId("quality-reviewed")).toHaveAttribute("aria-checked", "true");
    await expect(issue.getByTestId("quality-note")).toHaveValue("Pedido a contabilidad");
    // Quest never writes to Payments: the other price mismatches are untouched.
    await expect(page.locator("[data-testid='quality-issue'][data-kind='price_mismatch'][data-reviewed='true']")).toHaveCount(1);

    await page.getByTestId("quality-toggle-reviewed").click();
    await expect(card.locator("[data-kind='price_mismatch']")).toHaveCount(0);
    await expect(page.getByTestId("quality-issue").filter({ has: page.locator("[aria-checked='true']") })).toHaveCount(0);
    await page.getByTestId("quality-toggle-reviewed").click();
    await expect(card.locator("[data-kind='price_mismatch']")).toHaveCount(1);
  });

  test("the drawer language toggle switches the page to English, persists, and keeps the WhatsApp text in Spanish", async ({ page }) => {
    await stubClipboard(page);
    await page.goto("/quality");
    await waitForRealm(page);
    await openNavDrawer(page);
    const toggle = page.getByTestId("lang-toggle");
    await expect(toggle).toHaveAttribute("data-lang", "es");
    await toggle.locator("[data-lang-option='en']").click();
    await expect(toggle).toHaveAttribute("data-lang", "en");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("nav-drawer")).toHaveCount(0);

    await expect(page.getByTestId("quality-page")).toHaveAttribute("data-lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "Data Quality" })).toBeVisible();
    const card = page.locator("[data-testid='quality-card'][data-lot='Lamar — Lot 5']");
    await expect(card.getByTestId("quality-copy-card")).toHaveText(/Copy for WhatsApp/);
    await expect(card.locator("[data-kind='price_mismatch']").getByTestId("quality-values")).toHaveAttribute("data-line", /^File case: \$[\d,]+\.\d{2} \/ Note: \$[\d,]+\.\d{2}$/);
    await expect(card.locator("[data-kind='price_mismatch']").getByTestId("quality-technical").locator("summary")).toHaveText("Technical details");
    expect(await page.evaluate(() => localStorage.getItem("quest.lang"))).toBe("en");

    await card.getByTestId("quality-copy-card").click();
    expect(await lastCopied(page)).toContain("Corregir en Payments:");

    await page.reload();
    await waitForRealm(page);
    await expect(page.getByTestId("quality-page")).toHaveAttribute("data-lang", "en");
    await openNavDrawer(page);
    await page.getByTestId("lang-toggle").locator("[data-lang-option='es']").click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { level: 1, name: "Calidad de datos" })).toBeVisible();
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
    // Whether anyone is freed is live business data (Lamar sat at 100 % until its
    // investor_capital was raised on 2026-09-11), so the gallery must render either
    // the freed cards or its explicit empty state — never nothing.
    const gallery = page.getByTestId("liberated-gallery");
    await expect(gallery).toBeVisible();
    const freed = hostages.locator("xpath=self::*[@data-freed='true']");
    const freedCount = await freed.count();
    await expect(gallery).toContainText(`Liberated · ${freedCount}`);
    if (freedCount === 0) {
      await expect(gallery).toContainText("Nobody has been freed yet");
    } else {
      await expect(gallery.getByTestId("hostage")).toHaveCount(freedCount);
    }
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

  test("war plan: the verdict names a dollar amount and a farm count, and moving the deadline changes it", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/warplan");
    await waitForRealm(page);

    const verdict = page.getByTestId("warplan-verdict");
    await expect(verdict).toBeVisible();
    const before = (await verdict.textContent()) ?? "";
    expect(before).toMatch(/\$[\d.,]+[KM]?/);
    expect(before).toMatch(/\b\d+ farms?\b/);

    // Three plans side by side, the required one landing on or before the deadline.
    await expect(page.getByTestId("warplan-column")).toHaveCount(3);
    for (const id of ["current_pace", "required_plan", "required_plus_buffer"]) {
      await expect(page.locator(`[data-column='${id}']`).first()).toBeVisible();
    }
    await expect(page.locator("[data-testid='warplan-column'][data-column='required_plan']")).toHaveAttribute("data-hits", "true");
    // The month table runs to the deadline: one row per month from today to Dec 2027.
    await expect(page.getByTestId("warplan-month").first()).toBeVisible();
    await expect(page.getByTestId("warplan-month").last()).toContainText("Dec 2027");

    // A later deadline needs a slower pace and a later last purchase: the sentence changes.
    await page.getByLabel("Deadline", { exact: true }).fill("2028-12-31");
    await expect(verdict).not.toHaveText(before);
    const after = (await verdict.textContent()) ?? "";
    expect(after).toMatch(/\$[\d.,]+[KM]?/);
    expect(after).toMatch(/\b\d+ farms?\b/);
    await expect(page.getByTestId("warplan-month").last()).toContainText("Dec 2028");

    // Reset brings the real deadline back, and the original verdict with it.
    await page.getByTestId("warplan-reset").click();
    await expect(page.getByLabel("Deadline", { exact: true })).toHaveValue("2027-12-31");
    await expect(verdict).toHaveText(before);
    expect(errors).toEqual([]);
  });

  test("war plan: the investor mix funds farms in order and a scenario survives a reload", async ({ page }) => {
    await page.goto("/warplan");
    await waitForRealm(page);
    const rows = page.getByTestId("warplan-mix-row");
    expect(await rows.count()).toBeGreaterThanOrEqual(5);
    await expect(rows.nth(0)).toHaveAttribute("data-name", "Kevin Concua");
    await expect(rows.nth(1)).toHaveAttribute("data-name", "Townson Family");

    // Move Townson to the top: the required plan's first funder changes.
    const required = page.locator("[data-testid='warplan-column'][data-column='required_plan']");
    await expect(required.getByTestId("warplan-column-capital")).toHaveText(/^\$[\d,]+$/);
    await page.getByRole("button", { name: "Move Townson Family up" }).click();
    await expect(rows.nth(0)).toHaveAttribute("data-name", "Townson Family");
    await expect(required.locator("dl dt").nth(3)).toHaveText("Townson Family");

    // Save the scenario, reload, load it back.
    await page.getByLabel("Scenario name").fill("Townson first");
    await page.getByTestId("warplan-save").click();
    await page.reload();
    await waitForRealm(page);
    await expect(page.getByTestId("warplan-mix-row").nth(0)).toHaveAttribute("data-name", "Kevin Concua");
    await page.getByLabel("Saved scenarios").selectOption("Townson first");
    await expect(page.getByTestId("warplan-mix-row").nth(0)).toHaveAttribute("data-name", "Townson Family");
    await page.getByTestId("warplan-delete").click();
    await expect(page.getByLabel("Saved scenarios").locator("option")).toHaveCount(1);
  });

  test("war plan: the rotation headline renders with a turn count, the benchmark cycle and graded farms", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/warplan");
    await waitForRealm(page);

    const headline = page.getByTestId("warplan-rotation-headline");
    await expect(headline).toBeVisible();
    const text = (await headline.textContent()) ?? "";
    expect(text).toMatch(/\b\d+(\.\d)? turns?\b/);
    expect(text).toMatch(/\$[\d.,]+[KM]?/);
    expect(text).toMatch(/rotating every \d+(\.\d)? months/);
    await expect(headline).toHaveAttribute("data-turns", /^\d+(\.\d+)?$/);

    // The benchmark cycle is a real freed farm measured in days, and every other farm is graded against it.
    await expect(page.getByTestId("warplan-benchmark-cycle")).toContainText(/\d+ days/);
    await expect(page.getByTestId("warplan-turns-completed")).toHaveText(/^\d+$/);
    const grades = page.getByTestId("warplan-grade");
    expect(await grades.count()).toBeGreaterThan(0);
    for (const g of await grades.all()) {
      await expect(g).toHaveAttribute("data-verdict", /^(ahead|on_pace|behind|unrated)$/);
    }

    // Peak capital outstanding never exceeds total deployed; the cycle input carries the real figure.
    const peak = Number(((await page.getByTestId("warplan-rotation-peak").textContent()) ?? "").replace(/[^\d]/g, ""));
    const deployed = Number(((await page.getByTestId("warplan-rotation-deployed").textContent()) ?? "").replace(/[^\d]/g, ""));
    expect(peak).toBeLessThanOrEqual(deployed);
    await expect(page.getByTestId("warplan-cycle-real")).toContainText(/\d+ days/);

    // Blank the cycle: capital never rotates and the headline says so without a turn count.
    await page.getByLabel("Capital turn").fill("");
    await expect(headline).toContainText(/unknown|nothing rotating/);
    await page.getByTestId("warplan-reset").click();
    await expect(headline).toHaveText(text);
    expect(errors).toEqual([]);
  });

  test("throne room rotation strip and pipeline cancellation rate render from the same realm", async ({ page }) => {
    await page.goto("/");
    await waitForRealm(page);
    const strip = page.getByTestId("rotation-strip");
    await expect(strip).toBeVisible();
    await expect(strip.getByTestId("rotation-benchmark")).toContainText(/\d+ days/);
    await expect(strip.getByTestId("rotation-turns-completed")).toHaveText(/^\d+$/);
    await expect(strip.getByTestId("rotation-turns-needed")).toHaveText(/^(\d+(\.\d)?|—)$/);
    await expect(strip.getByTestId("rotation-outstanding")).toHaveText(/^\$[\d,]+$/);
    await expect(page.getByTestId("pipeline-cancellation-rate")).toContainText(/\d+(\.\d)?% cancelled/);

    await page.goto("/pipeline");
    await waitForRealm(page);
    await expect(page.getByTestId("pipeline-page-cancellation-rate")).toContainText(/\d+(\.\d)?%/);
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
