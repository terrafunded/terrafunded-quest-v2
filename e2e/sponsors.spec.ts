import { expect, test, type Page } from "@playwright/test";

/**
 * /sponsors: the capital donut (arcs, concentration line, hover, click-to-card), the tightened
 * layout (rows of equal height, 3×2 tiles, footnote block, hostages/liberated columns) and the
 * language: a Spanish view prints no English word and no English date.
 */

const isMobile = () => test.info().project.name === "mobile";

async function waitForRealm(page: Page) {
  await expect(page.getByRole("status", { name: /Loading realm data|Cargando los datos del reino/ })).toHaveCount(0, { timeout: 30_000 });
}

async function openSponsors(page: Page, lang: "en" | "es") {
  await page.addInitScript((l) => {
    localStorage.setItem("quest.lang", l);
    sessionStorage.setItem("quest.intro.seen", "1");
    // The first visit plays the liberation fanfare for farms already freed; mark them seen.
    localStorage.setItem("quest.liberations.seen", JSON.stringify(["seen-by-e2e"]));
  }, lang);
  await page.goto("/sponsors");
  await waitForRealm(page);
  const fanfare = page.getByTestId("celebration");
  if (await fanfare.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(fanfare).toHaveCount(0);
  }
  await expect(page.getByTestId("sponsor-card").first()).toBeVisible();
}

const num = (v: string | null) => Number(v);

test.describe("Capital donut", () => {
  test("arcs sum to the capital deployed, descend by amount, and the kind ring keeps own, profit-share and fixed-interest apart", async ({ page }) => {
    await openSponsors(page, "en");
    const donut = page.getByTestId("capital-donut");
    // Sits under the intro, before the hostages and the cards.
    const donutBox = (await donut.boundingBox())!;
    const boardBox = (await page.getByTestId("liberation-board").boundingBox())!;
    const cardsBox = (await page.getByTestId("sponsor-cards").boundingBox())!;
    expect(donutBox.y).toBeLessThan(boardBox.y);
    expect(boardBox.y).toBeLessThan(cardsBox.y);

    const total = num(await donut.getAttribute("data-total"));
    expect(total).toBeGreaterThan(0);
    expect(num(await donut.getAttribute("data-arc-sum"))).toBeCloseTo(total, 2);
    const arcs = num(await donut.getAttribute("data-arcs"));
    expect(arcs).toBeGreaterThanOrEqual(2);
    expect(((await donut.getAttribute("data-kinds")) ?? "").split(",")).toEqual(expect.arrayContaining(["own_capital", "profit_share", "fixed_interest"]));

    // The cards' capital deployed, summed, is the donut's total.
    const cardTotals = await page.getByTestId("sponsor-card").evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-capital-deployed"))));
    expect(cardTotals.reduce((s, v) => s + v, 0)).toBeCloseTo(total, 2);

    await donut.scrollIntoViewIfNeeded();
    await expect(donut).toHaveAttribute("data-revealed", "true");
    await expect(donut).toHaveAttribute("data-animating", "false", { timeout: 6_000 });
    const sectors = donut.locator(".recharts-pie").first().locator(".recharts-pie-sector");
    // Outer ring = one sector per arc; inner ring = one per kind. Both pies render.
    await expect.poll(() => donut.locator(".recharts-pie-sector").count()).toBeGreaterThanOrEqual(arcs + 3);
    expect(await sectors.count()).toBeGreaterThan(0);

    if (isMobile()) {
      // Labels move to a legend below the ring; nothing is drawn beside the arcs.
      await expect(donut.getByTestId("capital-donut-label")).toHaveCount(0);
      const legend = donut.getByTestId("capital-donut-legend");
      await expect(legend.locator("li")).toHaveCount(arcs);
      await expect(legend).toContainText(/\$[\d.]+[MK] · \d+\.\d%/);
    } else {
      const labels = donut.getByTestId("capital-donut-label");
      await expect(labels).toHaveCount(arcs);
      // Every label names its sponsor, its dollars and its share, and no two overlap.
      const boxes = [];
      for (let i = 0; i < arcs; i++) {
        const label = labels.nth(i);
        await expect(label).toContainText(/\$[\d.]+[MK] · \d+\.\d%/);
        boxes.push((await label.boundingBox())!);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
          expect(overlap, `labels ${i} and ${j} overlap`).toBe(false);
        }
      }
      // Descending by amount.
      const amounts = [];
      for (let i = 0; i < arcs; i++) {
        const m = /\$([\d.]+)([MK])/.exec((await labels.nth(i).textContent()) ?? "")!;
        amounts.push(Number(m[1]) * (m[2] === "M" ? 1_000_000 : 1_000));
      }
      expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    }
  });

  test("the concentration line reads the largest sponsor and the top two, flagged past the named threshold", async ({ page }) => {
    await openSponsors(page, "en");
    const donut = page.getByTestId("capital-donut");
    const line = donut.getByTestId("capital-concentration");
    const largest = num(await line.getAttribute("data-largest-share"));
    const topTwo = num(await line.getAttribute("data-top-two-share"));
    const threshold = num(await line.getAttribute("data-threshold"));
    expect(largest).toBeGreaterThan(0);
    expect(topTwo).toBeGreaterThanOrEqual(largest);
    expect(topTwo).toBeLessThanOrEqual(100);
    await expect(line).toContainText(`${largest.toFixed(1)}%`);
    await expect(line).toContainText(`${topTwo.toFixed(1)}%`);
    const flagged = largest > threshold;
    await expect(line).toHaveAttribute("data-flagged", String(flagged));
    const cls = (await line.getAttribute("class")) ?? "";
    expect(cls.includes("text-stage-reserved")).toBe(flagged);
    await expect(line).toContainText(flagged ? /Above the \d+% concentration line/ : /Under the \d+% concentration line/);
    // The largest sponsor's share is its card's capital over the total.
    const total = num(await donut.getAttribute("data-total"));
    const name = (await donut.getAttribute("data-largest")) ?? "";
    const card = page.getByTestId("sponsor-card").filter({ hasText: name }).first();
    const deployed = num(await card.getAttribute("data-capital-deployed"));
    expect((deployed / total) * 100).toBeCloseTo(largest, 1);
  });

  test("the recovery donut shows the hostages strip's returned share", async ({ page }) => {
    await openSponsors(page, "en");
    const donut = page.getByTestId("capital-donut");
    const pctReturned = num(await donut.getAttribute("data-pct-returned"));
    const returned = num(await donut.getAttribute("data-returned"));
    const outside = num(await donut.getAttribute("data-outside-capital"));
    expect((returned / outside) * 100).toBeCloseTo(pctReturned, 1);
    await expect(donut.getByTestId("capital-recovered-pct")).toHaveText(`${pctReturned.toFixed(1)}%`);
    // Same figure the hostages header prints.
    await expect(page.getByTestId("liberation-board")).toContainText(`${pctReturned.toFixed(1)}%`);
  });

  test("hovering an arc explains the sponsor; clicking it scrolls to the card and lights it briefly", async ({ page }) => {
    test.skip(isMobile(), "hover has no meaning on a touch screen; the legend buttons cover the click");
    await openSponsors(page, "en");
    const donut = page.getByTestId("capital-donut");
    await donut.scrollIntoViewIfNeeded();
    await expect(donut).toHaveAttribute("data-animating", "false", { timeout: 6_000 });
    const outerSectors = donut.locator(".recharts-pie").nth(1).locator(".recharts-pie-sector");
    const first = outerSectors.first();
    const name = (await donut.getAttribute("data-largest")) ?? "";

    // A sector's bounding box is mostly hole; find a screen point that is actually on the arc.
    const point = await first.locator("path").first().evaluate((el) => {
      const path = el as SVGGeometryElement;
      const box = path.getBBox();
      const ctm = path.getScreenCTM()!;
      for (let fy = 0.05; fy < 1; fy += 0.05) {
        for (let fx = 0.05; fx < 1; fx += 0.05) {
          const p = new DOMPoint(box.x + box.width * fx, box.y + box.height * fy);
          if (path.isPointInFill(p)) {
            const s = p.matrixTransform(ctm);
            return { x: s.x, y: s.y };
          }
        }
      }
      return null;
    });
    expect(point).not.toBeNull();
    await page.mouse.move(point!.x, point!.y);
    const tip = donut.getByTestId("capital-donut-tooltip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(/Deployed/);
    await expect(tip).toContainText(/Returned/);
    await expect(tip).toContainText(/Outstanding/);
    await expect(tip).toContainText(/Terms/);
    await expect(tip).toContainText(/Farms/);
    const tipText = await tip.innerText();

    await page.mouse.click(point!.x, point!.y);
    const lit = page.locator("[data-testid='sponsor-card'][data-highlighted='true']");
    await expect(lit).toHaveCount(1);
    const investorId = (await lit.getAttribute("data-investor-id")) ?? "";
    const card = page.locator(`[data-testid='sponsor-card'][data-investor-id='${investorId}']`);
    await expect(card).toContainText(tipText.split("\n")[0] ?? name);
    await expect(card).toBeInViewport();
    // Briefly: the ring goes out on its own.
    await expect(card).toHaveAttribute("data-highlighted", "false", { timeout: 4_000 });
  });
});

test.describe("Sponsors layout", () => {
  test("cards in a row share their height, tiles form a 3×2 grid, and the footnote is a block", async ({ page }) => {
    await openSponsors(page, "en");
    const cards = page.getByTestId("sponsor-card");
    const n = await cards.count();
    // The cards slide in with a staggered entrance; read their geometry once it has settled.
    const readBoxes = async () => {
      const out = [];
      for (let i = 0; i < n; i++) out.push((await cards.nth(i).boundingBox())!);
      return out.map((b) => `${Math.round(b.y)}:${Math.round(b.height)}`).join(",");
    };
    await expect.poll(async () => {
      const a = await readBoxes();
      await page.waitForTimeout(150);
      return a === (await readBoxes());
    }, { timeout: 10_000 }).toBe(true);
    const boxes = [];
    for (let i = 0; i < n; i++) boxes.push((await cards.nth(i).boundingBox())!);
    if (!isMobile()) {
      // Two columns: cards with the same top share the same height.
      for (let i = 0; i + 1 < n; i += 2) {
        expect(Math.abs(boxes[i]!.y - boxes[i + 1]!.y)).toBeLessThan(2);
        expect(Math.abs(boxes[i]!.height - boxes[i + 1]!.height)).toBeLessThan(2);
      }
      // Six tiles in two rows of three, all the same height.
      const tiles = cards.first().getByTestId("sponsor-figures").locator(":scope > div");
      await expect(tiles).toHaveCount(6);
      const tb = [];
      for (let i = 0; i < 6; i++) tb.push((await tiles.nth(i).boundingBox())!);
      expect(new Set(tb.map((b) => Math.round(b.y))).size).toBe(2);
      expect(new Set(tb.map((b) => Math.round(b.height))).size).toBe(1);
      // Hostages and liberated sit side by side only from xl; at 1280 they do, and the liberated panel keeps its own height.
      const board = page.getByTestId("liberation-board");
      const panels = board.locator(":scope > section");
      const a = (await panels.nth(0).boundingBox())!;
      const b = (await panels.nth(1).boundingBox())!;
      expect(Math.abs(a.y - b.y)).toBeLessThan(2);
      expect(b.height).toBeLessThan(a.height);
    } else {
      for (let i = 0; i + 1 < n; i++) expect(boxes[i + 1]!.y).toBeGreaterThan(boxes[i]!.y + boxes[i]!.height - 1);
      const tiles = cards.first().getByTestId("sponsor-figures").locator(":scope > div");
      await expect(tiles).toHaveCount(6);
    }
    const foot = page.getByTestId("sponsors-footnote");
    if ((await foot.count()) > 0) {
      const fb = (await foot.boundingBox())!;
      const cb = (await page.getByTestId("sponsor-cards").boundingBox())!;
      expect(Math.abs(fb.x - cb.x)).toBeLessThan(2);
      expect(Math.abs(fb.width - cb.width)).toBeLessThan(2);
      const padding = await foot.evaluate((el) => getComputedStyle(el).paddingLeft);
      const cardPadding = await cards.first().evaluate((el) => getComputedStyle(el).paddingLeft);
      expect(padding).toBe(cardPadding);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe("Sponsors language", () => {
  // innerText applies CSS text-transform, so uppercase headings come back in capitals: match case-insensitively.
  const ENGLISH = /\b(Capital deployed|Capital returned|Capital outstanding|Profit share|Fixed interest|Own capital|Interest accrued|Distributions|Terms|Farm|Lots|Outstanding|returned|freed|to go|paid on top|holds|recovered|Replay liberation|Also in the investors table)\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}\b/i;
  const SPANISH = /\b(Capital desplegado|devueltos|faltan|Rehenes del reino|Términos|Finca)\b/i;

  test("in Spanish the whole page prints Spanish, dates included", async ({ page }) => {
    await openSponsors(page, "es");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sponsors");
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(ENGLISH);
    expect(text).toMatch(/Rehenes del reino/i);
    expect(text).toMatch(/Capital desplegado por sponsor/i);
    expect(text).toMatch(/tiene el \d+\.\d% del capital desplegado/);
    // Funding dates in the farm tables: "21 ago 2025", never "Aug 21, 2025".
    expect(text).toMatch(/\b\d{1,2} (ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.? \d{4}\b/);
    await expect(page.getByTestId("sponsor-card").filter({ hasText: "Reparto de utilidades" })).toHaveCount(1);
  });

  test("in English the page prints English", async ({ page }) => {
    await openSponsors(page, "en");
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(SPANISH);
    expect(text).toMatch(/Hostages of the realm/i);
    expect(text).toMatch(/Capital deployed by sponsor/i);
    expect(text).toMatch(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}\b/);
  });
});
