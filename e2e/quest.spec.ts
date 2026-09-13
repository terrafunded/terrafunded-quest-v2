import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

/**
 * Ledger contract-price total: $8,986,794.30 in GOAL.md until Payments re-priced Titus Lot 6's file case from $141,802 to its
 * note's $140,000 on 2026-09-11 (21:17Z); drift documented in PROGRESS.md.
 */
const VERIFIED_LEDGER_TOTAL = "$8,984,992.30";

const ROUTES = ["/", "/warplan", "/exodus", "/realm", "/quests", "/pipeline", "/sponsors", "/treasury", "/oracle", "/chronicle", "/trophies", "/quality"] as const;

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
  await expect(page.getByRole("status", { name: /Loading realm data|Cargando los datos del reino/ })).toHaveCount(0, { timeout: 30_000 });
}

type BarGeometry = { x: number; width: number; height: number };

/**
 * Geometry of every drawn bar in a Pulse chart, read once the entry animation has finished
 * (recharts grows the bars from the baseline, so two identical consecutive reads mean settled).
 */
async function settledBars(card: Locator): Promise<BarGeometry[]> {
  const read = () =>
    card.locator(".recharts-bar-rectangle path").evaluateAll((els) =>
      els.map((el) => ({ x: Number(el.getAttribute("x")), width: Number(el.getAttribute("width")), height: Number(el.getAttribute("height")) })),
    );
  let previous = JSON.stringify(await read());
  await expect
    .poll(
      async () => {
        const current = JSON.stringify(await read());
        const settled = current === previous;
        previous = current;
        return settled;
      },
      { intervals: [250, 250, 250, 500, 500, 1000], timeout: 15_000 },
    )
    .toBe(true);
  return JSON.parse(previous) as BarGeometry[];
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

/**
 * The Pulse charts mount only once they scroll into view, so bars exist only after the section has
 * been on screen (and ResponsiveContainer has measured it).
 */
async function expectChartsDrawn(page: Page) {
  await page.getByTestId("pulse-charts").scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator("[data-testid='pulse-chart-pace'] .recharts-rectangle").count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator("[data-testid='pulse-chart-profit'] .recharts-rectangle").count()).toBeGreaterThan(0);
}

/** Heights of every bar in both Pulse charts, as currently painted. */
function barHeights(page: Page): Promise<(string | null)[]> {
  return page.locator("[data-testid='pulse-charts'] .recharts-bar-rectangle path").evaluateAll((els) => els.map((el) => el.getAttribute("height")));
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
    await expect(page.getByTestId("pulse")).toBeVisible();
    await expect(page.getByTestId("pulse-producing")).toBeVisible();
    await expect(page.getByTestId("pulse-needed")).toBeVisible();
    await expect(page.getByTestId("pulse-chart-pace")).toBeVisible();
    await expect(page.getByTestId("pulse-chart-profit")).toBeVisible();
    await expectChartsDrawn(page);
    expect(errors).toEqual([]);
  });

  test("hovering a Pulse month shows that month's tick label and the value its bar encodes", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("quest.intro.seen", "1"));
    await page.goto("/");
    await waitForRealm(page);
    await page.getByTestId("pulse-charts").scrollIntoViewIfNeeded();

    for (const chartId of ["pulse-chart-profit", "pulse-chart-pace"] as const) {
      const card = page.getByTestId(chartId);
      await expect.poll(() => card.locator(".recharts-bar-rectangle path").count()).toBeGreaterThan(0);
      const bars = await settledBars(card);
      // Every month owns a tick, so the tick under a bar is that bar's month.
      const ticks = await card.locator(".recharts-xAxis .recharts-cartesian-axis-tick-value").allTextContents();
      expect(ticks.length).toBeGreaterThan(1);
      expect(new Set(ticks).size).toBe(ticks.length);
      const grid = (await card.locator(".recharts-cartesian-grid").boundingBox()) as { x: number; y: number; width: number; height: number };
      const surface = (await card.locator(".recharts-surface").boundingBox()) as { x: number };
      const bandWidth = grid.width / ticks.length;
      const bandOf = (b: BarGeometry) => Math.floor((b.x + b.width / 2 + surface.x - grid.x) / bandWidth);
      const tallest = Math.max(...bars.map((b) => b.height));
      expect(tallest).toBeGreaterThan(0);

      const hovered: { month: string; value: number; barHeight: number }[] = [];
      for (let i = 0; i < ticks.length; i++) {
        await page.mouse.move(grid.x + bandWidth * (i + 0.5), grid.y + grid.height / 2);
        const tip = card.locator(".recharts-tooltip-wrapper");
        await expect(tip.getByTestId("pulse-tooltip-month")).toHaveText(ticks[i] as string, { useInnerText: true });
        const cursor = card.locator(".recharts-tooltip-cursor");
        await expect(cursor).toHaveAttribute("fill", "hsl(var(--foreground))");
        await expect(cursor).toHaveAttribute("opacity", "0.06");

        if (chartId === "pulse-chart-profit") {
          const profit = tip.getByTestId("pulse-tooltip-profit");
          await expect(profit).toHaveText(/^-?\$[\d,]+$/);
          const value = Number(await profit.getAttribute("data-value"));
          const bar = bars.find((b) => bandOf(b) === i);
          hovered.push({ month: ticks[i] as string, value, barHeight: bar?.height ?? 0 });
          if (value === 0) await expect(profit).toHaveText("$0");
        } else {
          await expect(tip.getByTestId("pulse-tooltip-reservations")).toHaveText(/^(Reservations|Reservas) \d+$/);
          await expect(tip.getByTestId("pulse-tooltip-closings")).toHaveText(/^(Closings|Cierres) \d+$/);
        }
      }
      await page.mouse.move(0, 0);

      if (chartId === "pulse-chart-profit") {
        // A bar's height encodes its month's net profit on a linear axis from $0, so the tooltip
        // must report the value the bar was drawn from: $0 exactly when no bar is drawn, and the
        // same share of the tallest bar as the value is of the largest value.
        const maxValue = Math.max(...hovered.map((h) => h.value));
        expect(maxValue).toBeGreaterThan(0);
        for (const h of hovered) {
          if (h.barHeight === 0) {
            expect(h.value, `${h.month} has no bar but its tooltip says ${h.value}`).toBe(0);
          } else {
            expect(h.value, `${h.month} has a bar but its tooltip says $0`).toBeGreaterThan(0);
            expect(Math.abs(h.barHeight / tallest - h.value / maxValue), `${h.month}: bar height share vs tooltip value share`).toBeLessThan(0.02);
          }
        }
      }
    }
  });

  test("in Spanish, the Throne Room's realm cards carry no English copy and pluralise reserva/reservas", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("quest.lang", "es");
      sessionStorage.setItem("quest.intro.seen", "1");
    });
    await page.goto("/");
    await waitForRealm(page);
    await expect(page.getByTestId("oxygen")).toHaveAttribute("aria-label", "Oxígeno");
    await expect(page.getByTestId("debt")).toHaveAttribute("aria-label", "La Deuda");
    await expect(page.getByTestId("pulse")).toHaveAttribute("aria-label", "El Pulso");
    await expect(page.getByTestId("pulse-charts")).toHaveAttribute("aria-label", "Gráficas del Pulso");
    await expect(page.getByTestId("pipeline")).toHaveAttribute("aria-label", "Pipeline");

    // The three Oxygen lines that used to be hard-coded English, now Spanish with real plurals.
    const confirmed = (await page.getByTestId("oxygen-confirmed").textContent()) ?? "";
    expect(confirmed).toMatch(/^\d+ (cierre confirmado|cierres confirmados), cada uno puntuado el día de su propio cierre$/);
    expect(confirmed.startsWith("1 ")).toBe(confirmed.includes("cierre confirmado,"));
    await expect(page.getByTestId("oxygen-trailing")).toContainText(/días ganados en los últimos \d+$/);
    await expect(page.getByTestId("oxygen-verdict")).toHaveText(/a este ritmo la fecha de salida (se aleja \d+ días? cada \d+|se acerca \d+ días? cada \d+|no se mueve)$/);
    await expect(page.getByTestId("oxygen-cumulative")).toHaveText(/^Marcador histórico acumulado · [\d,]+ días$/);
    await expect(page.getByTestId("topbar-oxygen")).toHaveAttribute("aria-label", /^Oxígeno — \d+ días ganados en los últimos \d+\. /);
    const provisional = (await page.getByTestId("oxygen-reservations-provisional").textContent()) ?? "";
    expect(provisional).toMatch(/^\d+ (reserva provisional|reservas provisionales) al \d+(\.\d+)?% de conversión$/);
    expect(provisional.startsWith("1 ")).toBe(provisional.includes("reserva provisional al"));
    await expect(page.getByTestId("oxygen-produces")).toHaveText(/^hoy el reino produce \$[\d,]+ de utilidad neta al día$/);

    // English marker strings from every realm component that renders on the Throne Room.
    const markers = [
      "closings confirmed",
      "days gained in the last",
      "days passed",
      "Cumulative historical score",
      "closing day",
      "provisional at",
      "of net profit per day",
      "Latest breath",
      "Deepest breath",
      "per lot in the ledger",
      "Capital still owed to sponsors",
      "Days left",
      "Net profit required per day",
      "actual pace per day",
      "you have averaged",
      "of interest accrues",
      "the deadline has passed",
      "Producing",
      "Needed",
      "at the trailing pace",
      "remaining ÷ days left",
      "of the pace the",
      "Reservations lead, closings pay",
      "Net profit per month",
      "Fainter bars",
      "Profit trapped in reservations",
      "the stuck list",
      "the only pace that counts",
      "Median to close",
      "Reservations / mo",
      "Closings / mo",
      "reservations waiting",
      "incl. cancellations",
      "still waiting",
    ];
    // textContent, not innerText: `.stat-label` is CSS-uppercased, which would hide "Latest breath" as "LATEST BREATH".
    const text = await page.locator("[data-testid='oxygen'], [data-testid='debt'], [data-testid='pulse'], [data-testid='pulse-charts'], [data-testid='pipeline']").allTextContents();
    const rendered = text.join("\n");
    expect(rendered.length).toBeGreaterThan(200);
    const found = markers.filter((m) => rendered.includes(m));
    expect(found, `English copy rendered in Spanish mode: ${found.join(" | ")}`).toEqual([]);
  });

  test("Key figures Capital outstanding equals Debt/Rotation sponsor-owed and discloses own capital", async ({ page }) => {
    await page.goto("/");
    await waitForRealm(page);
    const stat = page.getByTestId("key-capital-outstanding");
    const debt = page.getByTestId("debt-capital-owed");
    const rotation = page.getByTestId("rotation-outstanding");
    await expect(stat).toBeVisible();
    const owed = Number(await stat.getAttribute("data-value"));
    const debtOwed = Number(await debt.getAttribute("data-target"));
    expect(Math.round(owed)).toBe(debtOwed);
    expect(owed).toBeGreaterThan(0);
    // Same dollars the Rotation strip shows (whole-dollar label) — never the blended goal figure.
    await expect(stat).toHaveText((await rotation.textContent()) ?? "");
    await expect(page.getByTestId("key-capital-outstanding-hint")).toContainText("Still owed to sponsors");
    await expect(page.getByTestId("key-own-capital")).toHaveText(/^\s*· \+ \$[\d,]+ own capital tied up$/);
  });

  test("the Debt counter shows capital owed, days left and a required net profit per day, all > 0", async ({ page }) => {
    await page.goto("/");
    await waitForRealm(page);
    const debt = page.getByTestId("debt");
    await expect(debt).toBeVisible();

    const owed = page.getByTestId("debt-capital-owed");
    await owed.scrollIntoViewIfNeeded();
    await expect(owed).toHaveText(/^\$[\d,]+$/);
    await expect.poll(async () => Number(await owed.getAttribute("data-value"))).toBeGreaterThan(0);

    const daysLeft = Number(await page.getByTestId("debt-days-left").getAttribute("data-value"));
    expect(daysLeft).toBeGreaterThan(0);
    // Deadline is 2027-12-31; whatever "today" is, the count must be consistent with it.
    const today = new Date();
    const expectedDays = Math.round((Date.UTC(2027, 11, 31) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000);
    expect(daysLeft).toBe(expectedDays);

    const perDay = page.getByTestId("debt-per-day");
    await perDay.scrollIntoViewIfNeeded();
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

    // Reservations earn provisional days in a separate figure: the ledger's lighter "~+Nd" cells sum to it.
    const provisional = await cells.evaluateAll((els) => els.map((el) => el.getAttribute("data-provisional")).filter((v): v is string => v !== null));
    const provisionalSum = provisional.reduce((acc, v) => acc + Number(v), 0);

    await page.goto("/");
    await waitForRealm(page);
    const score = page.getByTestId("oxygen-score");
    await expect(score).toBeVisible();
    await score.scrollIntoViewIfNeeded();
    await expect.poll(async () => Number(await score.getAttribute("data-value")), { timeout: 20_000 }).toBe(ledgerSum);
    expect(ledgerSum).toBeGreaterThanOrEqual(0);
    const provisionalScore = page.getByTestId("oxygen-provisional");
    await expect(provisionalScore).toBeVisible();
    await expect(provisionalScore).toHaveAttribute("data-value", String(provisionalSum));
    await expect(provisionalScore).toHaveText(/^\+[\d,]+$/);
    await expect(page.getByTestId("oxygen")).toContainText(/\d+ (reservations? provisional at|reservas? provisionales? al) \d+(\.\d+)?% (conversion|de conversión)/);
    // The cumulative total is a demoted line and still excludes the provisional days.
    await expect(page.getByTestId("oxygen-cumulative")).toContainText(ledgerSum.toLocaleString("en-US"));
  });

  test("the Oxygen headline reads days gained in the trailing window against the window, states the difference and colours by band", async ({ page }) => {
    await page.goto("/");
    await waitForRealm(page);
    const card = page.getByTestId("oxygen");
    const headline = page.getByTestId("oxygen-trailing");
    await headline.scrollIntoViewIfNeeded();
    const gained = Number(await headline.getAttribute("data-value"));
    const windowDays = Number(await headline.getAttribute("data-window"));
    expect(windowDays).toBeGreaterThan(0);
    expect(gained).toBeGreaterThanOrEqual(0);
    await expect(page.getByTestId("oxygen-trailing-counter")).toHaveAttribute("data-target", String(gained));
    await expect(headline).toContainText(new RegExp(`(days gained in the last|días ganados en los últimos) ${windowDays}$`));

    // The arithmetic is explicit: |gained − window| days per window, direction by sign.
    const diff = Math.abs(gained - windowDays);
    const band = gained > windowDays ? "ahead" : gained < windowDays ? "behind" : "even";
    await expect(card).toHaveAttribute("data-band", band);
    const verdict = page.getByTestId("oxygen-verdict");
    await expect(verdict).toHaveAttribute("data-diff", String(diff));
    if (band === "behind") {
      await expect(verdict).toHaveText(new RegExp(`^${windowDays} (days passed|días transcurridos) − ${gained} (gained|ganados): .*(moves away by|se aleja) ${diff} (days?|días?) (every|cada) ${windowDays}$`));
      await expect(verdict).toHaveClass(/text-ember/);
      await expect(headline).toHaveClass(/text-ember/);
    } else if (band === "ahead") {
      await expect(verdict).toHaveText(new RegExp(`^${gained} (gained|ganados) − ${windowDays} (days passed|días transcurridos): .*(comes ${diff} (days?) closer|se acerca ${diff} días?) (every|cada) ${windowDays}$`));
      await expect(verdict).toHaveClass(/text-oxygen/);
      await expect(headline).toHaveClass(/text-oxygen/);
    } else {
      await expect(verdict).toHaveText(/holds still|no se mueve/);
    }

    // The cumulative score is a small labelled line under it, with the per-lot method on hover.
    const cumulative = page.getByTestId("oxygen-cumulative");
    await expect(cumulative).toHaveText(/^(Cumulative historical score|Marcador histórico acumulado) · [\d,]+ (days|días)$/);
    await expect(cumulative).toHaveAttribute("title", /(closing day|día de su propio cierre)/);
    await expect(page.getByTestId("oxygen-deepest")).toHaveAttribute("title", /(bought more days when the realm was slower|compraba más días cuando el reino iba más lento)/);

    // The topbar pill carries the same reading and the same band.
    const pill = page.getByTestId("topbar-oxygen");
    await expect(pill).toHaveText(`${gained}/${windowDays}d`);
    await expect(pill).toHaveAttribute("data-band", band);
    await expect(pill).toHaveAttribute("title", new RegExp(`${gained} (days gained in the last|días ganados en los últimos) ${windowDays}`));
  });

  test("the Committed counter shows the expected net profit from live reservations, when it lands, both paces and the This month strip", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");
    await waitForRealm(page);

    const committed = page.getByTestId("committed");
    await expect(committed).toBeVisible();
    const counter = page.getByTestId("committed-counter");
    await expect(counter).toHaveText(/^\$[\d,]+$|^\$[\d.]+[KM]$/);
    await expect.poll(async () => Number(await counter.getAttribute("data-value")), { timeout: 20_000 }).toBeGreaterThan(0);
    const committedValue = Number(await counter.getAttribute("data-value"));
    // Committed is what is at stake weighted by the conversion: never more than the stake, never the realized figure.
    const when = page.getByTestId("committed-when");
    await expect(when).toContainText(/\$[\d,]+ at stake × \d+% conversion = this figure/);
    const atStake = Number(((await when.textContent()) ?? "").match(/\$([\d,]+) at stake/)?.[1]?.replace(/,/g, ""));
    expect(committedValue).toBeLessThanOrEqual(atStake);
    await expect(page.getByTestId("committed-lands-by")).toHaveText(/^[A-Z][a-z]{2} \d{4}$/);
    const netProfit = Number(await page.getByTestId("net-profit-counter").getAttribute("data-value"));
    expect(committedValue).not.toBe(netProfit);

    // Two pace lines: reserving X/month, closing Y/month, need Z reservations/month.
    await expect(page.getByTestId("pace-line-reservations")).toHaveText(/^Reserving [\d.]+\/month, closing [\d.]+\/month · trailing \d+ days$/);
    await expect(page.getByTestId("pace-line-required")).toHaveText(
      /^Need [\d.]+ reservations\/month · [\d.]+ closings\/month at \d+% conversion from the ledger average$/,
    );
    const reserving = Number(((await page.getByTestId("pace-line-reservations").textContent()) ?? "").match(/Reserving ([\d.]+)/)?.[1]);
    const closing = Number(((await page.getByTestId("pace-line-reservations").textContent()) ?? "").match(/closing ([\d.]+)/)?.[1]);
    const needRes = Number(((await page.getByTestId("pace-line-required").textContent()) ?? "").match(/Need ([\d.]+)/)?.[1]);
    const needClose = Number(((await page.getByTestId("pace-line-required").textContent()) ?? "").match(/· ([\d.]+) closings/)?.[1]);
    expect(reserving).toBeGreaterThanOrEqual(closing);
    expect(needRes).toBeGreaterThanOrEqual(needClose);
    // The verdict still speaks in closings per month, and names the ledger-average model when it is a required pace.
    const verdict = (await page.getByTestId("verdict").textContent()) ?? "";
    await expect(page.getByTestId("verdict")).toContainText(/lots\/month/);
    if (verdict.startsWith("You need")) expect(verdict).toContain("from the ledger average");

    // This month: reservations, closings, and closings expected next month from reservations already made.
    const strip = page.getByTestId("this-month");
    await expect(strip).toBeVisible();
    for (const id of ["this-month-reservations", "this-month-closings", "next-month-expected"]) {
      const cell = strip.getByTestId(id);
      await expect(cell).toHaveAttribute("data-value", /^\d+(\.\d+)?$/);
      expect(Number(await cell.getAttribute("data-value"))).toBeGreaterThanOrEqual(0);
    }
    await expect(strip).toContainText(/from \d+ reservations? already made/);
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
    const netHeader = page.getByRole("button", { name: /^Net/ });
    if (await netHeader.isVisible()) await netHeader.click();
    else await page.getByTestId("mobile-sort").selectOption("netProfit");
    const first = await page.getByTestId("ledger-row").first().textContent();
    expect(first).toContain("Lamar");
  });

  test("every live reservation carries an expected close, and 'Expected this month' keeps only the ones due this month", async ({ page }) => {
    await page.goto("/quests");
    await waitForRealm(page);
    await page.getByLabel("Filter by stage").selectOption("reserved");
    const rows = page.getByTestId("ledger-row");
    const reserved = await rows.count();
    expect(reserved).toBeGreaterThan(0);
    const expected = page.getByTestId("ledger-expected");
    await expect(expected).toHaveCount(reserved);
    const dates = await expected.evaluateAll((els) => els.map((el) => el.getAttribute("data-value") ?? ""));
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(expected.first()).toContainText(/(in \d+d|\d+d late|today) · (farm|realm) median [\d.]+d/);
    // Reservations promise provisional oxygen, closings confirm it: a reserved row never carries a confirmed value.
    const oxygen = page.getByTestId("ledger-oxygen");
    const confirmed = await oxygen.evaluateAll((els) => els.map((el) => el.getAttribute("data-value")));
    for (const v of confirmed) expect(v).toBe("");

    const option = page.getByLabel("Filter by stage").locator("option[value='expected']");
    const due = Number(((await option.textContent()) ?? "").match(/\((\d+)\)/)?.[1]);
    const thisMonth = new Date().toISOString().slice(0, 7);
    await page.getByLabel("Filter by stage").selectOption("expected");
    if (due === 0) {
      await expect(page.getByText("No quests match")).toBeVisible();
    } else {
      await expect(rows).toHaveCount(due);
      const months = await page.getByTestId("ledger-expected").evaluateAll((els) => els.map((el) => el.getAttribute("data-month")));
      for (const m of months) expect(m).toBe(thisMonth);
    }

    await page.goto("/quests?filter=expected");
    await waitForRealm(page);
    await expect(page.getByLabel("Filter by stage")).toHaveValue("expected");
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

/**
 * Quest is for Payments staff: after sign-in the app reads the user's own `profiles` row and admits
 * only `role = 'admin'` — plus, by e-mail, the questbot `viewer` these tests sign in with
 * (`QUEST_ALLOWED_TEST_EMAIL`). The only credentials available here are that questbot's, so a
 * non-admin is staged on the wire: the Supabase token response is fetched for real and its
 * `user.email` rewritten to an address the gate does not know; for the `investor` / `note_buyer`
 * cases the `profiles` row is fetched for real and its `role` rewritten too. The app then sees
 * exactly what it would see for such a user, and must sign it out at once.
 */
test.describe("Access — Payments staff only", () => {
  const REFUSAL = "Quest is for the TerraFunded team only.";
  const STRANGER = "not.the.questbot@example.com";

  /** Re-serves a real upstream response with a rewritten JSON body (stale length/encoding headers dropped). */
  async function rewriteJson(route: Route, edit: (body: unknown) => unknown) {
    const response = await route.fetch();
    const body: unknown = await response.json();
    const headers = Object.fromEntries(
      Object.entries(response.headers()).filter(([k]) => !["content-length", "content-encoding", "transfer-encoding"].includes(k.toLowerCase())),
    );
    await route.fulfill({ status: response.status(), headers, json: edit(body) });
  }

  async function stageNonAdmin(page: Page, role: "viewer" | "investor" | "note_buyer") {
    await page.route("**/auth/v1/token**", (route) =>
      rewriteJson(route, (body) => {
        const b = body as { user?: { email?: string } };
        if (b.user) b.user.email = STRANGER;
        return b;
      }),
    );
    if (role !== "viewer") {
      // The questbot really is a viewer; investor / note_buyer are staged on its own row.
      await page.route("**/rest/v1/profiles**", (route) =>
        rewriteJson(route, (body) => (Array.isArray(body) ? body.map((r) => ({ ...(r as object), role })) : body)),
      );
    }
  }

  test("the login footer says who may enter", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/login");
    await expect(page.getByTestId("login-footer")).toContainText("for the TerraFunded team only");
    await expect(page.getByTestId("login-footer")).toContainText("admin");
    await context.close();
  });

  for (const role of ["viewer", "investor", "note_buyer"] as const) {
    test(`${/^[aeiou]/.test(role) ? "an" : "a"} ${role} is signed out immediately with "${REFUSAL}"`, async ({ browser }) => {
      const email = process.env.QUEST_TEST_EMAIL;
      const password = process.env.QUEST_TEST_PASSWORD;
      if (!email || !password) throw new Error("QUEST_TEST_EMAIL / QUEST_TEST_PASSWORD must be set");

      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const page = await context.newPage();
      const errors = collectConsoleErrors(page);
      const restTables: string[] = [];
      page.on("request", (req) => {
        const m = /\/rest\/v1\/([^/?]+)/.exec(req.url());
        if (m?.[1]) restTables.push(m[1]);
      });
      await stageNonAdmin(page, role);

      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Enter" }).click();

      const refused = page.getByTestId("access-refused");
      await expect(refused).toHaveText(REFUSAL);
      await expect(refused).toHaveRole("alert");
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("form", { name: "Sign in" })).toBeVisible();
      await expect(page.getByTestId("net-profit-counter")).toHaveCount(0);

      // Signed out: no Supabase session left in this browser …
      await expect
        .poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))))
        .toEqual([]);
      // … and a deep link still bounces to /login.
      await page.goto("/quests");
      await expect(page).toHaveURL(/\/login$/);

      // The only table read was the user's own profiles row; no realm table was touched.
      expect(restTables.length).toBeGreaterThan(0);
      expect(new Set(restTables)).toEqual(new Set(["profiles"]));
      expect(errors).toEqual([]);
      await context.close();
    });
  }

  test("the allowed test account (a viewer) still enters and sees the Throne Room", async ({ page }) => {
    await page.goto("/");
    await waitForRealm(page);
    await expect(page.getByTestId("net-profit-counter")).toBeVisible();
  });

  test("a signed-in reload of a deep link waits for the check and never passes through /login", async ({ page }) => {
    const visited: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
    });
    await page.goto("/trophies");
    await waitForRealm(page);
    await expect(page).toHaveURL(/\/trophies$/);
    await expect(page.getByTestId("trophy-card").first()).toBeVisible();
    expect(visited).not.toContain("/login");
    await expect(page.getByRole("form", { name: "Sign in" })).toHaveCount(0);
  });
});

test.describe("Page specifics", () => {
  test("realm map draws one territory per farm and 121 lot tiles", async ({ page }) => {
    await page.goto("/realm");
    await waitForRealm(page);
    // 9 farms / 109 lots until Lakeview (12 lots) was added to Payments on 2026-09-11 21:15Z
    await expect(page.getByTestId("territory")).toHaveCount(10);
    await expect(page.getByTestId("lot-tile")).toHaveCount(121);
  });

  test("quality groups the documented disagreements one card per lot, in Spanish by default", async ({ page }) => {
    await page.goto("/quality");
    await waitForRealm(page);
    await expect(page.getByTestId("quality-page")).toHaveAttribute("data-lang", "es");
    await expect(page.getByRole("heading", { level: 1, name: "Calidad de datos" })).toBeVisible();
    // Titus Lot 6 left the list on 2026-09-11 when its file case was corrected to the note's $140,000
    for (const lot of ["Lamar — Lot 5", "Lamar — Lot 6", "Lamar — Lot 7", "Eastland — Lot 3"]) {
      const card = page.locator(`[data-testid='quality-card'][data-lot='${lot}']`);
      await expect(card).toHaveCount(1);
      await expect(card.locator("[data-kind='price_mismatch']")).toHaveCount(1);
    }
    await expect(page.locator("[data-testid='quality-card'][data-lot='Titus — Lot 6']")).toHaveCount(0);
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
    await expect(cards.filter({ hasText: /Profit share|Reparto de utilidades/ })).toHaveCount(1);
    await expect(cards.filter({ hasText: /Profit share|Reparto de utilidades/ })).toContainText("Townson Family");
  });

  test("trophies renders at least 15 cards with rarity badges and both streak panels", async ({ page }) => {
    await page.goto("/trophies");
    await waitForRealm(page);
    expect(await page.getByTestId("trophy-card").count()).toBeGreaterThanOrEqual(15);
    expect(await page.locator("[data-rarity='legendary']").count()).toBeGreaterThan(0);
    await expect(page.getByTestId("streaks")).toBeVisible();
    await expect(page.getByTestId("streak-current")).toContainText(/\d+ (weeks?|semanas?)/);
    // Reservation streaks sit beside the closing streaks, with trophies of their own.
    const pledges = page.getByTestId("reservation-streaks");
    await expect(pledges).toBeVisible();
    await expect(pledges.getByTestId("reservation-streak-current")).toContainText(/\d+ (weeks?|semanas?)/);
    await expect(pledges).toContainText(/\d+ (reservations?|reservas?)/);
    await expect(page.getByTestId("trophy-card").filter({ hasText: /Steady Pledges|Pledge After Pledge|The Long Line|Market Day/ }).first()).toBeVisible();
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
    // Four price mismatches remain on file (Titus Lot 6 was corrected on 2026-09-11): $19,999.50 of net profit between file case and note.
    await expect(summary.getByTestId("quality-summary-dollars")).toHaveAttribute("data-value", "19999.5");
    await expect(summary.getByTestId("quality-summary-dollars")).toHaveText("$19,999.50");
    await expect(summary).toContainText("suma de las diferencias en 4 lotes; Quest usa la nota");
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
    expect(everything.split("\n")[1]).toBe(`${lots} lotes con problemas y 3 fincas · $19,999.50 de ganancia afectada por diferencias de precio`);
    expect(everything.split("\n")[2]).toBe("");
    for (const lot of ["Lamar — Lot 5", "Lamar — Lot 6", "Lamar — Lot 7", "Eastland — Lot 3", "Ben White"]) expect(everything).toContain(`*${lot}*`);
    expect(everything).not.toContain("*Titus — Lot 6*");
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
  test("the login page no longer offers a skin, and a stored skin is overridden before the first paint", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem("quest.theme", "neon-kingdom"));

    // First paint: with the bundle blocked only index.html's boot script runs, and it must already
    // ignore the stored skin — otherwise the page flashes Neon Kingdom until React mounts.
    await page.route(/\.(js|mjs|tsx?)(\?.*)?$/, (route) => route.abort());
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "iron-crown");
    expect(await page.evaluate(() => localStorage.getItem("quest.theme"))).toBe("neon-kingdom");
    await page.unroute(/\.(js|mjs|tsx?)(\?.*)?$/);
    const errors = collectConsoleErrors(page);

    // Full app: no selector anywhere on the login page, Iron Crown applied, storage rewritten.
    await page.goto("/login");
    await expect(page.getByTestId("login-footer")).toBeVisible();
    await expect(page.getByTestId("theme-menu")).toHaveCount(0);
    await expect(page.getByTestId("theme-menu-compact")).toHaveCount(0);
    await expect(page.locator("[data-theme-option]")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "iron-crown");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("quest.theme"))).toBe("iron-crown");
    expect(errors).toEqual([]);
    await context.close();
  });

  // The skin selector is hidden and everyone is held to Iron Crown; the other skins stay in the
  // code. A browser that saved another skin before the control went away must not be stuck in it.
  for (const stored of ["iron-crown", "gilded-realm", "neon-kingdom", "not-a-theme"] as const) {
    test(`stored skin "${stored}" resolves to Iron Crown, is written back, and the Throne Room renders without console errors`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.addInitScript((t) => localStorage.setItem("quest.theme", t), stored);
      await page.goto("/");
      await waitForRealm(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "iron-crown");
      await expect(page.locator("html")).toHaveClass(/dark/);
      expect(await page.evaluate(() => localStorage.getItem("quest.theme"))).toBe("iron-crown");
      await expect(page.getByTestId("ambient-particles")).toBeAttached();
      await expect(page.getByTestId("net-profit-counter")).toHaveClass(/counter-glow/);
      await expect(page.getByTestId("page-transition")).toHaveAttribute("data-preset", "rise");
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

  test("below-the-fold counters and charts reveal once, when scrolled to, and do not replay on a horizon change", async ({ page }) => {
    await page.goto("/");
    await waitForRealm(page);
    const viewportHeight = page.viewportSize()?.height ?? 0;
    const owed = page.getByTestId("debt-capital-owed");
    const perDay = page.getByTestId("debt-per-day");
    const paceChart = page.getByTestId("pulse-chart-pace");
    const target = Number(await owed.getAttribute("data-target"));
    expect(target).toBeGreaterThan(0);

    // Not yet seen: the counter holds at zero and the charts have not mounted.
    expect((await owed.boundingBox())?.y ?? 0).toBeGreaterThan(viewportHeight);
    await expect(owed).toHaveAttribute("data-value", "0");
    await expect(owed).toHaveText("$0");
    await expect(paceChart).toHaveAttribute("data-revealed", "false");
    expect(await paceChart.locator(".recharts-rectangle").count()).toBe(0);
    await expect(page.locator("[data-revealed='true']")).toHaveCount(0);

    // The observer fires as the element arrives: the count runs to its final value.
    await owed.scrollIntoViewIfNeeded();
    await expect(owed).toHaveAttribute("data-value", String(target), { timeout: 10_000 });
    await expect(owed).toHaveText((await owed.getAttribute("data-final")) ?? "");
    await expect(perDay).toHaveAttribute("data-value", (await perDay.getAttribute("data-target")) ?? "", { timeout: 10_000 });

    // Each chart mounts on arrival, grows its bars once (under ~800ms) and then switches series
    // animation off for good.
    await expect(page.locator("[data-testid^='pulse-chart-'][data-animating='true']")).toHaveCount(2);
    for (const chart of [paceChart, page.getByTestId("pulse-chart-profit")]) {
      await chart.scrollIntoViewIfNeeded();
      await expect(chart).toHaveAttribute("data-revealed", "true");
      await expect.poll(() => chart.locator(".recharts-rectangle").count()).toBeGreaterThan(0);
      await settledBars(chart);
      await expect(chart).toHaveAttribute("data-animating", "false", { timeout: 1_000 });
    }

    // A new horizon changes the daily requirement and the pace chart's required lines; the figure
    // snaps rather than counting up again, and the bars redraw in place (a replay would have them
    // still moving a beat later).
    const perDayBefore = Number(await perDay.getAttribute("data-target"));
    const requiredBefore = await paceChart.getAttribute("data-required-closings");
    await openNavDrawer(page);
    await page.getByTestId("nav-drawer").getByTestId("horizon-2029").click();
    await page.keyboard.press("Escape");
    await expect(perDay).not.toHaveAttribute("data-target", String(perDayBefore));
    await expect(paceChart).not.toHaveAttribute("data-required-closings", requiredBefore ?? "");
    const barsRightAfter = await barHeights(page);
    const perDayAfter = (await perDay.getAttribute("data-target")) ?? "";
    await expect(perDay).toHaveAttribute("data-value", perDayAfter, { timeout: 500 });
    await page.waitForTimeout(400);
    expect(barsRightAfter.length).toBeGreaterThan(0);
    expect(await barHeights(page)).toEqual(barsRightAfter);
  });

  test("reduced motion shows every counter at its final value immediately, without scrolling", async ({ browser }) => {
    const context = await browser.newContext({ storageState: "playwright/.auth/user.json", reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    await waitForRealm(page);
    const owed = page.getByTestId("debt-capital-owed");
    const target = (await owed.getAttribute("data-target")) ?? "";
    expect(Number(target)).toBeGreaterThan(0);
    // Well inside any count-up duration (>= 1.2s on the fastest skin): the value must be there already.
    await expect(owed).toHaveAttribute("data-value", target, { timeout: 500 });
    await expect(owed).toHaveText((await owed.getAttribute("data-final")) ?? "");
    await expect(page.locator("[data-revealed='false']")).toHaveCount(0);
    await expect(page.locator("[data-animating='true']")).toHaveCount(0);
    await expect.poll(() => page.locator("[data-testid='pulse-chart-pace'] .recharts-rectangle").count()).toBeGreaterThan(0);
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
    await expect(page.getByTestId("pipeline-farm")).toHaveCount(10);
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
    await expect(territories).toHaveCount(10);
    const states = await territories.evaluateAll((els) => els.map((el) => el.getAttribute("data-campaign")));
    for (const s of states) expect(["conquered", "under_siege", "closing_pending", "losing_ground"]).toContain(s);
    await territories.first().click();
    const panel = page.getByTestId("campaign");
    await expect(panel).toBeVisible();
    expect(states).toContain(await panel.getAttribute("data-state"));
    // A farm with reservations waiting is never losing ground: its panel counts them and calls the closing pending.
    await expect(panel.getByTestId("campaign-reserved")).toHaveAttribute("data-value", /^\d+$/);
    const state = await panel.getAttribute("data-state");
    const waiting = Number(await panel.getByTestId("campaign-reserved").getAttribute("data-value"));
    if (state === "losing_ground") expect(waiting).toBe(0);
    if (state === "closing_pending") {
      expect(waiting).toBeGreaterThan(0);
      await expect(panel).toContainText(new RegExp(`${waiting} reservations? waiting to close`));
    }
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
    await expect(gallery).toContainText(new RegExp(`(Liberated|Liberados) · ${freedCount}`));
    if (freedCount === 0) {
      await expect(gallery).toContainText(/Nobody has been freed yet|Nadie ha sido liberado aún/);
    } else {
      await expect(gallery.getByTestId("hostage")).toHaveCount(freedCount);
    }
  });

  test("oracle shows four futures — the current pace schedules the live reservations — and the required pace lands on or before the deadline", async ({ page }) => {
    await page.goto("/oracle");
    await waitForRealm(page);
    const futures = page.getByTestId("future");
    await expect(futures).toHaveCount(4);
    for (const id of ["current_pace", "required_pace", "one_more_farm", "closings_only"]) {
      await expect(page.locator(`[data-future='${id}']`)).toBeVisible();
    }
    await expect(page.locator("[data-future='required_pace']").getByTestId("future-exit")).toHaveText(/(2026|2027)/);
    await expect(page.locator("[data-future='required_pace']")).toContainText("replaying today's mix");
    // The current pace carries every live reservation as a scheduled closing; the comparison line carries none.
    const current = page.locator("[data-future='current_pace']");
    const scheduled = Number(await current.getAttribute("data-scheduled"));
    expect(scheduled).toBeGreaterThan(0);
    await expect(current.getByTestId("future-scheduled")).toHaveText(new RegExp(`^${scheduled} → [\\d.]+ closings$`));
    await expect(page.locator("[data-future='closings_only']")).toHaveAttribute("data-scheduled", "0");
    await expect(page.locator("[data-future='closings_only']")).toContainText("If no reservation ever closed");
    // The sliders start from the reservation-aware future; the toggle drops back to closings only.
    const toggle = page.getByTestId("oracle-with-reservations");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).toHaveText(new RegExp(`With the ${scheduled} live reservations`));
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toggle).toHaveText("Closings only");
  });

  test("war plan: the verdict names a dollar amount and a farm count, and moving the deadline changes it", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/warplan");
    await waitForRealm(page);

    const verdict = page.getByTestId("warplan-verdict");
    await expect(verdict).toBeVisible();
    await expect(verdict).toContainText("per the War Plan's real deal terms");
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

  test("exodus: the verdict names a dollar amount; moving the slider from 30 to 0 changes it and the discount saved reads $0", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/exodus");
    await waitForRealm(page);

    const verdict = page.getByTestId("exodus-verdict");
    await expect(verdict).toBeVisible();
    await expect(verdict).toHaveAttribute("data-notes-pct", "30");
    const before = (await verdict.textContent()) ?? "";
    expect(before).toMatch(/\$[\d.,]+[KM]?/);
    expect(before).toMatch(/30%/);
    // With notes in the package the discount saved is a positive dollar amount.
    const discount = page.getByTestId("exodus-discount-saved");
    await expect(discount).toHaveText(/^\$[\d,]+$/);
    expect(Number(await discount.getAttribute("data-value"))).toBeGreaterThan(0);
    // The max mark sits on the track and names a percent within the slider's range.
    const max = Number(await page.getByTestId("exodus-max-mark").getAttribute("data-max"));
    expect(max).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(60);
    await expect(verdict).toHaveAttribute("data-max-notes-pct", String(max));

    // 0 %: everything in cash — the sentence changes and nothing is saved on discounts.
    const slider = page.getByTestId("exodus-notes-pct");
    await expect(slider).toHaveValue("30");
    await slider.fill("0");
    await expect(slider).toHaveValue("0");
    await expect(verdict).toHaveAttribute("data-notes-pct", "0");
    await expect(verdict).not.toHaveText(before);
    const after = (await verdict.textContent()) ?? "";
    expect(after).toMatch(/\$[\d.,]+[KM]?/);
    expect(after).toMatch(/0%/);
    await expect(discount).toHaveText("$0");
    await expect(discount).toHaveAttribute("data-value", "0");
    await expect(page.getByTestId("exodus-package")).toContainText(/nothing is delivered|no se entrega nada/i);

    // Reset brings 30 % back, and the original verdict with it.
    await page.getByTestId("exodus-reset").click();
    await expect(slider).toHaveValue("30");
    await expect(verdict).toHaveText(before);
    expect(errors).toEqual([]);
  });

  test("exodus: the month table runs to the deadline, today's inventory is listed by status, and a scenario survives a reload", async ({ page }) => {
    await page.goto("/exodus");
    await waitForRealm(page);

    // One row per month from now to the deadline; the last one is December 2027 and carries the cumulative total.
    const months = page.getByTestId("exodus-month");
    await expect(months.first()).toBeVisible();
    await expect(months.last()).toContainText(/(Dec|dic) 2027/);
    expect(await months.count()).toBeGreaterThanOrEqual(12);

    // Today's notes, one row per note, with a chip per status.
    const chips = page.getByTestId("exodus-inventory-chip");
    await expect(chips).toHaveCount(5);
    for (const status of ["free", "needs_release", "profit_share", "excluded", "no_farm"]) {
      await expect(page.locator(`[data-testid='exodus-inventory-chip'][data-status='${status}']`)).toBeVisible();
    }
    const notes = page.getByTestId("exodus-note");
    expect(await notes.count()).toBeGreaterThan(10);
    await expect(page.locator("[data-testid='exodus-note'][data-status='free']").first()).toBeVisible();
    await expect(page.locator("[data-testid='exodus-note'][data-status='profit_share']").first()).toBeVisible();
    // The default exclusion is on the list as excluded.
    await expect(page.locator("[data-testid='exodus-note'][data-code='EAS-L04']")).toHaveAttribute("data-status", "excluded");
    // The delivered package reports a UPB-weighted rate and term.
    await expect(page.getByTestId("exodus-package-rate")).toHaveText(/\d+(\.\d+)?%/);
    await expect(page.getByTestId("exodus-package-term")).toHaveText(/\d+/);

    // Save a 45 % scenario, reload, load it back, delete it.
    await page.getByTestId("exodus-notes-pct").fill("45");
    await expect(page.getByTestId("exodus-notes-pct-value")).toHaveText("45%");
    await page.locator("#ex-scenario-name").fill("Forty-five");
    await page.getByTestId("exodus-save").click();
    await page.reload();
    await waitForRealm(page);
    await expect(page.getByTestId("exodus-notes-pct")).toHaveValue("30");
    await page.locator("#ex-scenario-load").selectOption("Forty-five");
    await expect(page.getByTestId("exodus-notes-pct")).toHaveValue("45");
    await expect(page.getByTestId("exodus-verdict")).toHaveAttribute("data-notes-pct", "45");
    await page.getByTestId("exodus-delete").click();
    await expect(page.locator("#ex-scenario-load option")).toHaveCount(1);
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
    await expect(page.getByTestId("pipeline-cancellation-rate")).toContainText(/\d+(\.\d)?% (cancelled|canceladas)/);

    await page.goto("/pipeline");
    await waitForRealm(page);
    await expect(page.getByTestId("pipeline-page-cancellation-rate")).toContainText(/\d+(\.\d)?%/);
  });

  test("the era: every rate carries 'since Mar 2026', seasonality says it lacks history, and totals keep the full history", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    // Throne Room: the Debt's actual pace is measured from March 2026 while the counter and capital owed keep every closing.
    await page.goto("/");
    await waitForRealm(page);
    await expect(page.getByTestId("debt-actual-pace-label")).toContainText("since Mar 2026");
    await expect(page.getByTestId("debt-actual-pace-hint")).toContainText(/since Mar 2026 \(\d+ (days|días)\)/);
    await expect(page.getByTestId("debt-actual-pace-hint")).toContainText(/over the full history|en toda la historia/);
    await expect(page.getByTestId("rotation-benchmark-hint")).toContainText("farms funded since Mar 2026");
    // 90-day windows sit inside the era today, so the pace line is not clipped.
    await expect(page.getByTestId("pace-window")).toContainText("trailing 90 days");

    // Oracle: the farm cadence only counts fundings since the era start, and the current pace says so.
    await page.goto("/oracle");
    await waitForRealm(page);
    await expect(page.getByTestId("slider-hint-newFarmEveryMonths")).toContainText("Mean gap between fundings since Mar 2026");
    await expect(page.locator("[data-future='current_pace']")).toContainText("(since Mar 2026)");
    await expect(page.locator("[data-future='current_pace']").getByTestId("future-cadence")).toContainText("since Mar 2026");

    // War Plan: land cost and cycle are era figures; the seasonal shape is unavailable with under 12 months of history.
    await page.goto("/warplan");
    await waitForRealm(page);
    await expect(page.getByTestId("warplan-farm-cost-real")).toContainText("since Mar 2026");
    await expect(page.getByTestId("warplan-cycle-real")).toContainText("funded since Mar 2026");
    await expect(page.getByTestId("warplan-seasonality-real")).toContainText("not enough history for seasonality");
    await expect(page.getByTestId("warplan-seasonal-on")).toBeDisabled();
    await expect(page.getByTestId("warplan-seasonal-off")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("warplan-benchmark-scope")).toContainText("farms funded since Mar 2026");
    await expect(page.locator("[data-testid='warplan-column'][data-column='current_pace']")).toContainText("(since Mar 2026)");
    // No seasonal column in the month table while the profile is not applied.
    await expect(page.getByRole("columnheader", { name: "Flat average" })).toHaveCount(0);

    // Trophies: best week and best month are measured since the era start; runs keep the full history.
    await page.goto("/trophies");
    await waitForRealm(page);
    await expect(page.getByTestId("streak-best-week")).toContainText("since Mar 2026");
    await expect(page.getByTestId("streak-best-month")).toContainText("since Mar 2026");
    expect(errors).toEqual([]);
  });

  test("chronicle narrates every event in prose", async ({ page }) => {
    await page.goto("/chronicle");
    await waitForRealm(page);
    const prose = page.getByTestId("chronicle-prose");
    expect(await prose.count()).toBeGreaterThan(10);
    await expect(prose.filter({ hasText: /claimed Lot \d+ of/ }).first()).toBeVisible();
    await expect(prose.filter({ hasText: /The realm gained \d+ days?\./ }).first()).toBeVisible();
    // Reservations are narrated with their expected closing; the closing points back to the reservation.
    await expect(prose.filter({ hasText: /pledged for Lot \d+ of .+ — the closing (is|was) expected around/ }).first()).toBeVisible();
    await expect(prose.filter({ hasText: /\d+ days? after (\w+'s|the) reservation\./ }).first()).toBeVisible();
    // The Cancelled filter exists; whether any cancellation is on file is live data, so only the empty state or cancellation prose may follow.
    await page.locator("[data-testid='chronicle-filter'][data-kind='cancellation']").click();
    const cancellations = page.locator("[data-testid='chronicle-event'][data-kind='cancellation']");
    if ((await cancellations.count()) > 0) await expect(cancellations.first().getByTestId("chronicle-prose")).toContainText(/withdrew the pledge/);
    else await expect(page.locator("[data-testid='chronicle-event']:not([data-kind='milestone'])")).toHaveCount(0);
  });
});

test.describe("Navigation drawer", () => {
  test("opens from the top bar, lists every route, and closes on route change", async ({ page }) => {
    await page.goto("/");
    await waitForRealm(page);
    await expect(page.getByTestId("topbar")).toBeVisible();
    await expect(page.getByTestId("topbar-realm-name")).toHaveText(/Quest/i);
    await expect(page.getByTestId("nav-drawer")).toHaveCount(0);

    await openNavDrawer(page);
    const drawer = page.getByTestId("nav-drawer");
    for (const label of ["Throne Room", "War Plan", "Exodus", "The Realm", "Quests", "Pipeline", "Sponsors", "Treasury", "Oracle", "Chronicle", "Trophies", "Data Quality"]) {
      await expect(drawer.getByRole("link", { name: label })).toBeVisible();
    }
    // The skin selector is hidden (everyone is held to Iron Crown); the footer keeps language + account.
    await expect(drawer.getByTestId("theme-menu")).toHaveCount(0);
    await expect(drawer.getByText("Skin", { exact: true })).toHaveCount(0);
    await expect(drawer.getByTestId("lang-toggle")).toBeVisible();
    await expect(drawer.getByTestId("horizon-toggle")).toBeVisible();
    await expect(drawer.getByTestId("nav-user-email")).not.toBeEmpty();

    await drawer.getByRole("link", { name: "Pipeline" }).click();
    await expect(page).toHaveURL(/\/pipeline$/);
    await expect(page.getByTestId("nav-drawer")).toHaveCount(0);
  });

  test("wordmark returns to the Throne Room from the War Plan", async ({ page }) => {
    await page.goto("/warplan");
    await waitForRealm(page);
    await expect(page.getByTestId("warplan-deadline")).toBeVisible();
    const wordmark = page.getByTestId("topbar-realm-name");
    await expect(wordmark).toBeVisible();
    const box = await wordmark.boundingBox();
    expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);
    await wordmark.click();
    await expect(page).toHaveURL("/");
    await waitForRealm(page);
    await expect(page.getByTestId("net-profit-counter")).toBeVisible();
    await expect(page.getByTestId("verdict")).toBeVisible();
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

  test("picking 2029 updates every deadline-derived surface and survives reload and logout", async ({ page }) => {
    const email = process.env.QUEST_TEST_EMAIL;
    const password = process.env.QUEST_TEST_PASSWORD;
    if (!email || !password) throw new Error("QUEST_TEST_EMAIL / QUEST_TEST_PASSWORD must be set");

    await page.goto("/");
    await waitForRealm(page);
    const requiredClosingsBefore = await page.getByTestId("pulse-chart-pace").getAttribute("data-required-closings");
    const requiredProfitBefore = await page.getByTestId("pulse-chart-profit").getAttribute("data-required-profit");
    expect(Number(requiredClosingsBefore)).toBeGreaterThan(0);
    expect(Number(requiredProfitBefore)).toBeGreaterThan(0);

    await openNavDrawer(page);
    const drawer = page.getByTestId("nav-drawer");
    await expect(drawer.getByTestId("horizon-toggle")).toBeVisible();
    await drawer.getByTestId("horizon-2029").click();
    await expect(drawer.getByTestId("horizon-2029")).toHaveAttribute("aria-checked", "true");
    // Selecting a year must not close the drawer.
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("topbar-horizon")).toHaveText("2029");
    await expect(page.getByTestId("days-to-deadline")).toContainText("Dec 31, 2029");
    await expect(page.getByTestId("pulse-ratio")).toContainText(/2029 horizon|horizonte 2029/);
    await expect(page.getByTestId("debt-per-day")).toBeVisible();
    await expect(page.getByTestId("pulse-chart-pace")).not.toHaveAttribute("data-required-closings", requiredClosingsBefore ?? "");
    await expect(page.getByTestId("pulse-chart-profit")).not.toHaveAttribute("data-required-profit", requiredProfitBefore ?? "");
    expect(Number(await page.getByTestId("pulse-chart-pace").getAttribute("data-required-closings"))).toBeLessThan(Number(requiredClosingsBefore));
    await expectChartsDrawn(page);

    await page.goto("/warplan");
    await waitForRealm(page);
    await expect(page.getByTestId("warplan-deadline")).toHaveValue("2029-12-31");

    await page.goto("/exodus");
    await waitForRealm(page);
    await expect(page.getByTestId("exodus-deadline")).toHaveValue("2029-12-31");

    await page.reload();
    await waitForRealm(page);
    await expect(page.getByTestId("topbar-horizon")).toHaveText("2029");
    await expect(page.getByTestId("exodus-deadline")).toHaveValue("2029-12-31");

    await openNavDrawer(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Enter" }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto("/");
    await waitForRealm(page);
    await expect(page.getByTestId("topbar-horizon")).toHaveText("2029");
    await expect(page.getByTestId("days-to-deadline")).toContainText("Dec 31, 2029");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("quest.v2.exitHorizon")))
      .toBe("2029");
  });
});
