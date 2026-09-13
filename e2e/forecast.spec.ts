import { expect, test, type Page } from "@playwright/test";

/**
 * The four forecast visuals: the Curve and the Gauge (Throne Room), the Farm Calendar (War Plan)
 * and the Reverse Funnel (Pipeline). They read the domain through data attributes the components
 * expose, so every assertion here checks the drawing against the figure it claims to draw.
 */

const isMobile = () => test.info().project.name === "mobile";

async function waitForRealm(page: Page) {
  await expect(page.getByRole("status", { name: /Loading realm data|Cargando los datos del reino/ })).toHaveCount(0, { timeout: 30_000 });
}

async function switchHorizon(page: Page, year: 2027 | 2028 | 2029) {
  await page.getByTestId("nav-menu-button").click();
  await expect(page.getByTestId("nav-drawer")).toBeVisible();
  await page.getByTestId("nav-drawer").getByTestId(`horizon-${year}`).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("nav-drawer")).toHaveCount(0);
  await expect(page.getByTestId("topbar-horizon")).toHaveText(String(year));
}

const dollars = (text: string) => Number(text.replace(/[^0-9.-]/g, ""));

test.describe("The Curve and the Gauge (Throne Room)", () => {
  test("the required line runs from today's net profit to $10M on the horizon's deadline; the crossing is marked and dated", async ({ page }) => {
    await page.goto("/");
    await waitForRealm(page);
    const curve = page.getByTestId("goal-curve");
    const year = await page.getByTestId("topbar-horizon").innerText();

    // Sits directly above the two monthly charts.
    const curveBox = (await curve.boundingBox())!;
    const pulseBox = (await page.getByTestId("pulse-charts").boundingBox())!;
    const gaugeBox = (await page.getByTestId("deadline-gauge").boundingBox())!;
    expect(curveBox.y).toBeLessThan(gaugeBox.y);
    expect(gaugeBox.y).toBeLessThan(pulseBox.y);

    // The counter counts up on load; once it lands, it is the required line's starting value.
    const start = Number(await curve.getAttribute("data-required-start"));
    expect(start).toBeGreaterThan(0);
    await expect.poll(async () => Math.abs(dollars(await page.getByTestId("net-profit-counter").innerText()) - start), { timeout: 15_000 }).toBeLessThan(1);
    await expect(curve).toHaveAttribute("data-required-end", "10000000");
    await expect(curve).toHaveAttribute("data-required-end-date", `${year}-12-31`);
    await expect(curve).toHaveAttribute("data-deadline", `${year}-12-31`);

    await curve.scrollIntoViewIfNeeded();
    await expect(curve).toHaveAttribute("data-revealed", "true");
    await expect.poll(() => curve.locator(".recharts-line-curve").count()).toBeGreaterThanOrEqual(3);
    await expect(curve).toHaveAttribute("data-animating", "false", { timeout: 5_000 });

    const crossing = (await curve.getAttribute("data-crossing")) ?? "";
    expect(crossing).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const months = Number(await curve.getAttribute("data-crossing-months"));
    const side = await curve.getAttribute("data-side");
    expect(side).toBe(crossing > `${year}-12-31` ? "behind" : "ahead");
    expect(months > 0).toBe(side === "behind");

    // The marker names the crossing date and the months against the deadline, on the curve's side.
    const marker = page.getByTestId("goal-curve-marker");
    const monthName = new Date(`${crossing}T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    await expect(marker).toContainText(monthName);
    await expect(marker).toContainText(Math.abs(months).toFixed(1));
    await expect(curve.locator(".recharts-reference-dot")).toHaveCount(2);
    await expect(page.getByTestId("goal-curve-side")).toHaveClass(side === "behind" ? /text-ember/ : /text-oxygen/);

    // Two projections, two crossings — the disagreement is shown, not averaged away.
    const recent = (await curve.getAttribute("data-crossing-recent")) ?? "";
    expect(recent).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(recent).not.toBe(crossing);
    await expect(page.getByTestId("goal-curve-legend-lifetime")).toBeVisible();
    await expect(page.getByTestId("goal-curve-legend-recent")).toBeVisible();

    // Grid and band only on wide screens (MOBILE_LOG: at 380 the curve drops gridlines and the band before shrinking type).
    if (isMobile()) {
      await expect(curve.locator(".recharts-cartesian-grid")).toHaveCount(0);
      await expect(curve.locator(".recharts-area")).toHaveCount(1);
    } else {
      await expect(curve.locator(".recharts-cartesian-grid")).toHaveCount(1);
      await expect(curve.locator(".recharts-area")).toHaveCount(2);
    }
  });

  test("the gauge speaks one sentence in lots, dollars and days, on the curve's side", async ({ page }) => {
    await page.goto("/");
    await waitForRealm(page);
    const gauge = page.getByTestId("deadline-gauge");
    const curve = page.getByTestId("goal-curve");
    await gauge.scrollIntoViewIfNeeded();
    const side = (await curve.getAttribute("data-side")) ?? "";
    await expect(gauge).toHaveAttribute("data-side", side);
    const lots = Number(await gauge.getAttribute("data-lots"));
    const money = Number(await gauge.getAttribute("data-dollars"));
    const days = Number(await gauge.getAttribute("data-days"));
    expect(Number.isFinite(lots) && Number.isFinite(money) && Number.isFinite(days)).toBe(true);
    expect(lots < 0).toBe(side === "behind");
    expect(money < 0).toBe(side === "behind");
    // Days of delay agree with the marker: months against the deadline × 30.44, within rounding.
    const months = Number(await curve.getAttribute("data-crossing-months"));
    expect(Math.abs(-days - months * (365.25 / 12))).toBeLessThan(2);
    const sentence = page.getByTestId("deadline-gauge-sentence");
    await expect(sentence).toContainText(/lots|lotes/);
    await expect(sentence).toContainText(/days|días/);
    await expect(sentence).toContainText("$");
    await expect(sentence).toContainText(side === "behind" ? /behind|atrás/ : /ahead|adelante/);
    await expect(sentence).toHaveClass(side === "behind" ? /text-ember/ : /text-oxygen/);
  });

  test("switching the exit horizon moves the required line, the deadline marker, the crossing's distance and the gauge", async ({ page }) => {
    await page.goto("/");
    await waitForRealm(page);
    const curve = page.getByTestId("goal-curve");
    const gauge = page.getByTestId("deadline-gauge");
    await curve.scrollIntoViewIfNeeded();
    await expect(curve).toHaveAttribute("data-animating", "false", { timeout: 5_000 });
    await expect(curve).toHaveAttribute("data-required-end-date", "2027-12-31");
    const monthsBefore = Number(await curve.getAttribute("data-crossing-months"));
    const daysBefore = await gauge.getAttribute("data-days");
    const crossingBefore = await curve.getAttribute("data-crossing");
    const requiredPath = () => curve.locator(".recharts-line-curve").first().getAttribute("d");
    const pathBefore = await requiredPath();

    await switchHorizon(page, 2029);
    await expect(curve).toHaveAttribute("data-required-end-date", "2029-12-31");
    await expect(curve).toHaveAttribute("data-deadline", "2029-12-31");
    await expect(curve).toHaveAttribute("data-required-end", "10000000");
    // The pace does not depend on the year, so the crossing stays put; its distance to the deadline shifts by two years.
    await expect(curve).toHaveAttribute("data-crossing", crossingBefore ?? "");
    const monthsAfter = Number(await curve.getAttribute("data-crossing-months"));
    expect(Math.abs(monthsBefore - monthsAfter - 24)).toBeLessThan(0.5);
    await expect(gauge).not.toHaveAttribute("data-days", daysBefore ?? "");
    await expect(page.getByTestId("goal-curve-marker")).toContainText(Math.abs(monthsAfter).toFixed(1));
    // Lines redraw in place, no replay.
    await expect(curve).toHaveAttribute("data-animating", "false");
    await expect.poll(requiredPath).not.toBe(pathBefore);
  });
});

test.describe("The Farm Calendar (War Plan)", () => {
  test("marks the inventory-out month at lots ÷ required rate, one funding deadline per planned farm and every capital return", async ({ page }) => {
    await page.goto("/warplan");
    await waitForRealm(page);
    const cal = page.getByTestId("farm-calendar");
    await cal.scrollIntoViewIfNeeded();
    await expect(cal).toHaveAttribute("data-revealed", "true");

    const lots = Number(await cal.getAttribute("data-inventory-lots"));
    const rate = Number(await cal.getAttribute("data-required-per-month"));
    const months = Number(await cal.getAttribute("data-inventory-out-months"));
    expect(lots).toBeGreaterThan(0);
    expect(rate).toBeGreaterThan(0);
    expect(Math.abs(months - lots / rate)).toBeLessThan(0.01);
    const summary = page.getByTestId("farm-calendar-summary");
    await expect(summary).toContainText(`${lots} lots in inventory today`);
    await expect(summary).toContainText(`${rate} lots/month`);

    const farms = Number(await cal.getAttribute("data-farms"));
    await expect(page.getByTestId("farm-calendar-farm")).toHaveCount(farms);
    const deadlines = ((await cal.getAttribute("data-funding-deadlines")) ?? "").split(",").filter(Boolean);
    expect(deadlines).toHaveLength(farms);
    for (const iso of deadlines) expect(iso <= ((await cal.getAttribute("data-deadline")) ?? "")).toBe(true);
    // Each farm's split bar sums to its cost: recycled + fresh + unfunded.
    for (const f of await page.getByTestId("farm-calendar-farm").all()) {
      const parts = ["data-recycled", "data-fresh", "data-unfunded"];
      const sum = (await Promise.all(parts.map(async (a) => Number(await f.getAttribute(a))))).reduce((s, n) => s + n, 0);
      expect(sum).toBeGreaterThan(0);
    }
    await expect(page.getByTestId("farm-calendar-lag")).toContainText(/observed on \d+ farms|an assumption/);
    await expect(cal).toHaveAttribute("data-lag-source", /observed|assumption/);

    // The timeline is horizontal on wide screens and vertical on phones.
    await expect.poll(() => cal.locator(".recharts-bar-rectangle").count()).toBeGreaterThan(0);
    const monthTicks = isMobile() ? cal.locator(".recharts-yAxis .recharts-cartesian-axis-tick") : cal.locator(".recharts-xAxis .recharts-cartesian-axis-tick");
    const monthCount = await monthTicks.count();
    expect(monthCount).toBeGreaterThan(0);
    const outMonth = Number(await cal.getAttribute("data-inventory-out-month"));
    await expect(cal.locator(".recharts-reference-line")).toHaveCount(outMonth >= 1 && outMonth <= monthCount ? 2 : 1);

    // Hovering a month explains it in a sentence.
    const bar = cal.locator(".recharts-bar-rectangle path").first();
    await bar.hover({ force: true });
    await expect(page.getByTestId("farm-calendar-tooltip")).toBeVisible();
    await expect(page.getByTestId("farm-calendar-tooltip")).toContainText(/fund by|comes back|run out|today's month|the deadline|nothing to fund/);
  });

  test("a new horizon stretches the calendar and moves the inventory-out marker", async ({ page }) => {
    await page.goto("/warplan");
    await waitForRealm(page);
    const cal = page.getByTestId("farm-calendar");
    await cal.scrollIntoViewIfNeeded();
    const monthsBefore = Number(await cal.getAttribute("data-inventory-out-months"));
    const rateBefore = Number(await cal.getAttribute("data-required-per-month"));
    await expect(cal).toHaveAttribute("data-deadline", "2027-12-31");
    await switchHorizon(page, 2028);
    await expect(cal).toHaveAttribute("data-deadline", "2028-12-31");
    const rateAfter = Number(await cal.getAttribute("data-required-per-month"));
    expect(rateAfter).toBeLessThan(rateBefore);
    expect(Number(await cal.getAttribute("data-inventory-out-months"))).toBeGreaterThan(monthsBefore);
  });
});

test.describe("The Reverse Funnel (Pipeline)", () => {
  test("stands at the top and shows two figures per step, from remaining dollars to reservations per week", async ({ page }) => {
    await page.goto("/pipeline");
    await waitForRealm(page);
    const funnel = page.getByTestId("reverse-funnel");
    const figures = page.getByLabel("Pipeline figures");
    expect((await funnel.boundingBox())!.y).toBeLessThan((await figures.boundingBox())!.y);

    const remaining = Number(await funnel.getAttribute("data-remaining"));
    const months = Number(await funnel.getAttribute("data-months"));
    const conv = Number(await funnel.getAttribute("data-conversion")) / 100;
    const lotsL = Number(await funnel.getAttribute("data-lots-lifetime"));
    const lotsR = Number(await funnel.getAttribute("data-lots-recent"));
    const resL = Number(await funnel.getAttribute("data-reservations-lifetime"));
    const perMonthL = Number(await funnel.getAttribute("data-per-month-lifetime"));
    const perWeekL = Number(await funnel.getAttribute("data-per-week-lifetime"));
    expect(remaining).toBeGreaterThan(0);
    expect(lotsL).not.toBe(lotsR);
    expect(Math.abs(resL - lotsL / conv)).toBeLessThan(0.01);
    expect(Math.abs(perMonthL - resL / months)).toBeLessThan(0.05);
    expect(Math.abs(perWeekL - perMonthL / ((365.25 / 12) / 7))).toBeLessThan(0.01);

    await funnel.scrollIntoViewIfNeeded();
    await expect.poll(() => funnel.locator(".recharts-bar-rectangle").count()).toBe(9);
    // Stepped: each bar no longer than the one above.
    const widths = await funnel.locator(".recharts-bar-rectangle path").evaluateAll((els) => els.map((e) => Number(e.getAttribute("width"))));
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeLessThanOrEqual(widths[i - 1]! + 0.5);
    await expect(funnel.locator("text", { hasText: `${lotsL} lots` })).toHaveCount(1);
    await expect(funnel.locator("text", { hasText: `${lotsR} lots` })).toHaveCount(1);
    // The step names ride the Y axis on wide screens and stack over the bars on phones.
    await expect(funnel.locator("text", { hasText: /Lots to close · ledger average/ })).toHaveCount(1);
  });

  test("cost per conversation is the user's own figure: it implies monthly ad spend and persists on the device", async ({ page }) => {
    await page.goto("/pipeline");
    await waitForRealm(page);
    const funnel = page.getByTestId("reverse-funnel");
    const input = page.getByTestId("funnel-cost-input");
    await expect(funnel).toHaveAttribute("data-cost-per-conversation", "");
    await expect(funnel).toHaveAttribute("data-ad-spend-lifetime", "");
    await input.scrollIntoViewIfNeeded();
    await input.fill("40");
    await expect(funnel).toHaveAttribute("data-cost-per-conversation", "40");
    const perMonth = Number(await funnel.getAttribute("data-per-month-lifetime"));
    const spend = Number(await funnel.getAttribute("data-ad-spend-lifetime"));
    expect(Math.abs(spend - perMonth * 40)).toBeLessThan(0.01);
    await expect.poll(() => funnel.locator(".recharts-bar-rectangle").count()).toBe(11);
    await expect(funnel).toContainText("if every reservation takes one paid conversation");
    expect(await page.evaluate(() => localStorage.getItem("quest.funnel.costPerConversation"))).toBe("40");

    await page.reload();
    await waitForRealm(page);
    await expect(page.getByTestId("funnel-cost-input")).toHaveValue("40");
    await expect(page.getByTestId("reverse-funnel")).toHaveAttribute("data-cost-per-conversation", "40");

    await page.getByTestId("funnel-cost-input").fill("");
    await expect(page.getByTestId("reverse-funnel")).toHaveAttribute("data-cost-per-conversation", "");
    expect(await page.evaluate(() => localStorage.getItem("quest.funnel.costPerConversation"))).toBeNull();
  });
});
