import { expect, test, type Page } from "@playwright/test";

/**
 * /realm: the lot tooltip must be stable under a still pointer (the old rect scaled itself on
 * hover, which moved its edge under the cursor and fired leave/enter tens of times a second),
 * must follow the pointer across adjacent lots without closing, and must stay inside the viewport.
 */

async function waitForRealm(page: Page) {
  await expect(page.getByRole("status", { name: /Loading farm and lot data|Cargando fincas y lotes/ })).toHaveCount(0, { timeout: 30_000 });
}

async function openRealm(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("quest.lang", "en");
    sessionStorage.setItem("quest.intro.seen", "1");
  });
  await page.goto("/realm");
  await waitForRealm(page);
  await expect(page.getByTestId("lot-tile").first()).toBeVisible();
}

/** Counts how many times the tooltip appeared or disappeared while the pointer sits still. */
async function countTooltipToggles(page: Page, ms: number): Promise<{ toggles: number; present: boolean }> {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const query = () => document.querySelector("[data-testid='lot-tooltip']") !== null;
        let last = query();
        let toggles = 0;
        const observer = new MutationObserver(() => {
          const now = query();
          if (now !== last) {
            toggles += 1;
            last = now;
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
          observer.disconnect();
          resolve({ toggles, present: query() });
        }, duration);
      }),
    ms,
  );
}

test.describe("Realm lot tooltip", () => {
  test.skip(({ isMobile }) => !!isMobile, "hover has no meaning on a touch viewport");

  test("stays open, without a single toggle, while the cursor rests on a lot for two seconds", async ({ page }) => {
    await openRealm(page);
    const tile = page.getByTestId("lot-tile").first();
    await tile.scrollIntoViewIfNeeded();
    const box = (await tile.boundingBox())!;
    const before = { w: box.width, h: box.height };
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId("lot-tooltip")).toBeVisible();

    const { toggles, present } = await countTooltipToggles(page, 2000);
    expect(toggles).toBe(0);
    expect(present).toBe(true);
    // The hovered element kept its geometry: no scale, so nothing moved under the cursor.
    const after = (await tile.boundingBox())!;
    expect(Math.abs(after.width - before.w)).toBeLessThan(0.5);
    expect(Math.abs(after.height - before.h)).toBeLessThan(0.5);
    await expect(tile).toHaveAttribute("data-hovered", "true");
  });

  test("crossing into the neighbouring lot retargets the tooltip instead of closing it", async ({ page }) => {
    await openRealm(page);
    const tiles = page.getByTestId("lot-tile");
    const a = (await tiles.nth(0).boundingBox())!;
    const b = (await tiles.nth(1).boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    const tooltip = page.getByTestId("lot-tooltip");
    await expect(tooltip).toBeVisible();
    const firstName = await tooltip.locator(".font-heading").first().innerText();

    // Watch the DOM while the pointer slides from the centre of A to the centre of B in small steps.
    const watch = countTooltipToggles(page, 900);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    const { toggles, present } = await watch;
    expect(toggles).toBe(0);
    expect(present).toBe(true);
    await expect(tooltip.locator(".font-heading").first()).not.toHaveText(firstName);
  });

  test("the tooltip is placed inside the viewport wherever the lot is, and re-placed after a resize", async ({ page }) => {
    await openRealm(page);
    const tiles = page.getByTestId("lot-tile");
    const last = tiles.last();
    await last.scrollIntoViewIfNeeded();
    const box = (await last.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const tooltip = page.getByTestId("lot-tooltip");
    await expect(tooltip).toBeVisible();
    const inside = async () => {
      const r = (await tooltip.boundingBox())!;
      const vp = page.viewportSize()!;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(vp.width + 0.5);
      expect(r.y + r.height).toBeLessThanOrEqual(vp.height + 0.5);
    };
    await inside();
    // Shrink the window under the open tooltip: it must re-place itself, not keep the stale numbers.
    await page.setViewportSize({ width: 700, height: 500 });
    await last.scrollIntoViewIfNeeded();
    // The grid reflows for a while after the resize; re-aim at the tile until the hover lands.
    await expect(async () => {
      const moved = (await last.boundingBox())!;
      await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2);
      await expect(tooltip).toBeVisible({ timeout: 1000 });
    }).toPass();
    await inside();
  });

  test("leaving the map closes the tooltip", async ({ page }) => {
    await openRealm(page);
    const tile = page.getByTestId("lot-tile").first();
    const box = (await tile.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId("lot-tooltip")).toBeVisible();
    await page.mouse.move(5, 5);
    await expect(page.getByTestId("lot-tooltip")).toHaveCount(0);
  });
});

/**
 * Which farms Payments has a survey drawing for that agrees with the ledger (as of 2026-09-13):
 * Eastland's drawing has 10 parcels against 11 lot rows (an "Eastland County" row with no lot
 * number), Lakeview and Franklin 2 have no drawing at all. Live business data; if Payments adds a
 * drawing or fixes the row, update these lists together with PROGRESS.md.
 */
const REAL_MAPS = ["Wichita", "Promised Valley", "Avery", "Lamar", "Freestone", "Titus", "Franklin"];
const FALLBACKS: Record<string, "no_geometry" | "mismatch"> = { Lakeview: "no_geometry", "Franklin 2": "no_geometry", Eastland: "mismatch" };

const card = (page: Page, farm: string) => page.locator(`[data-testid='territory'][data-farm='${farm}']`);

/** Scrolls every card into view so lazy imagery and the in-view reveal have fired everywhere. */
async function revealAll(page: Page) {
  const cards = page.getByTestId("territory");
  const n = await cards.count();
  for (let i = 0; i < n; i++) await cards.nth(i).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
}

test.describe("Realm parcel maps", () => {
  test("seven farms draw Payments' surveyed parcels, three fall back to the schematic with a stated reason", async ({ page }) => {
    await openRealm(page);
    await expect(page.locator("[data-testid='territory'][data-map='loading']")).toHaveCount(0, { timeout: 20_000 });
    for (const farm of REAL_MAPS) {
      await expect(card(page, farm), farm).toHaveAttribute("data-map", "parcels");
      await expect(card(page, farm).getByTestId("map-fallback-reason")).toHaveCount(0);
    }
    for (const [farm, reason] of Object.entries(FALLBACKS)) {
      await expect(card(page, farm), farm).toHaveAttribute("data-map", "grid");
      await expect(card(page, farm).getByTestId("map-fallback-reason")).toHaveAttribute("data-reason", reason);
    }
    await expect(card(page, "Eastland").getByTestId("map-fallback-reason")).toContainText("10 parcels, the ledger 11 lots");
    await expect(card(page, "Eastland").getByRole("link", { name: /Data Quality/ })).toHaveAttribute("href", "/quality");
    // The whole realm is still there: one card per farm, one shape per lot.
    await expect(page.getByTestId("territory")).toHaveCount(10);
    await expect(page.getByTestId("lot-tile")).toHaveCount(121);
  });

  test("on every real map the polygon count equals the farm's lot count, each polygon carries the Payments lot number and a Quest stage tint", async ({ page }) => {
    await openRealm(page);
    await expect(page.locator("[data-testid='territory'][data-map='loading']")).toHaveCount(0, { timeout: 20_000 });
    for (const farm of REAL_MAPS) {
      const c = card(page, farm);
      const svg = c.getByTestId("farm-parcel-map");
      const polygons = Number(await svg.getAttribute("data-polygons"));
      const [closed, total] = (await c.locator("header p").innerText()).match(/(\d+)\/(\d+) closed/)!.slice(1).map(Number);
      expect(polygons, farm).toBe(total);
      await expect(c.getByTestId("lot-tile"), farm).toHaveCount(polygons);
      await expect(c.getByTestId("lot-number"), farm).toHaveCount(polygons);
      const numbers = await c.getByTestId("lot-tile").evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-lot-number"))));
      expect(new Set(numbers).size, farm).toBe(polygons);
      // textContent, not innerText: SVG <text> has no innerText.
      const labels = await c.getByTestId("lot-number").evaluateAll((els) => els.map((el) => el.textContent ?? ""));
      expect(labels.map(Number).sort((a, b) => a - b), farm).toEqual([...numbers].sort((a, b) => a - b));
      // Tints are the theme's stage tokens, never a literal colour (Payments' light palette would be a hex).
      const fills = await c.getByTestId("lot-tile").evaluateAll((els) => els.map((el) => `${el.getAttribute("data-stage")}=${el.getAttribute("fill")}`));
      for (const f of fills) {
        const [stage, fill] = f.split("=");
        expect(fill, farm).toBe(`hsl(var(--stage-${stage!.replace("_", "-")}))`);
      }
      const closedTiles = fills.filter((f) => f.startsWith("closed=") || f.startsWith("note_sold=")).length;
      expect(closedTiles, `${farm} closed tiles`).toBe(closed);
    }
  });

  test("imagery is lazy: a card below the fold has no aerial tiles until it scrolls into view, and the map box never changes size", async ({ page }) => {
    await openRealm(page);
    await expect(page.locator("[data-testid='territory'][data-map='loading']")).toHaveCount(0, { timeout: 20_000 });
    // Last real-map card in the grid — well below the fold at 1280×800.
    const c = card(page, "Franklin");
    const box = c.getByTestId("map-box");
    const before = (await box.boundingBox())!;
    expect(before.y).toBeGreaterThan(800);
    await expect(c.locator("image")).toHaveCount(0);
    await c.scrollIntoViewIfNeeded();
    await expect(c.locator("image")).toHaveCount(Number(await c.getByTestId("farm-parcel-map").getAttribute("data-polygons")));
    await expect.poll(async () => c.locator("image").evaluateAll((els) => els.every((el) => getComputedStyle(el).opacity === "1"))).toBe(true);
    const after = (await box.boundingBox())!;
    expect(Math.abs(after.width - before.width)).toBeLessThan(1);
    expect(Math.abs(after.height - before.height)).toBeLessThan(1);
    expect(after.width / after.height).toBeCloseTo(4 / 3, 1);
  });

  test("every map box shares one aspect so rows align, and tiles come from Payments, not through Quest", async ({ page }) => {
    await openRealm(page);
    await revealAll(page);
    const boxes = await page.getByTestId("map-box").evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; }));
    for (const b of boxes) expect(b.w / b.h).toBeCloseTo(4 / 3, 1);
    const hrefs = await page.locator("[data-testid='farm-parcel-map'] image").evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) expect(h).toMatch(/^https:\/\/payments\.terrafunded\.com\/lots\//);
  });

  test("hovering a parcel shows that lot's economics; clicking it opens the farm sheet with its campaign", async ({ page }) => {
    await openRealm(page);
    await expect(page.locator("[data-testid='territory'][data-map='loading']")).toHaveCount(0, { timeout: 20_000 });
    const c = card(page, "Lamar");
    await c.scrollIntoViewIfNeeded();
    const parcel = c.getByTestId("lot-tile").nth(3);
    const number = await parcel.getAttribute("data-lot-number");
    await parcel.hover();
    const tooltip = page.getByTestId("lot-tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(`Lamar — Lot ${number}`);
    await expect(c.getByTestId("lot-hover-outline")).toHaveCount(1);
    await parcel.click();
    const panel = page.getByTestId("campaign");
    await expect(panel).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("Lamar");
  });

  test("the schematic keeps the hit-area rule: sliding across a gutter never closes the tooltip", async ({ page }) => {
    await openRealm(page);
    const c = card(page, "Lakeview");
    await c.scrollIntoViewIfNeeded();
    const tiles = c.getByTestId("lot-tile");
    const a = (await tiles.nth(0).boundingBox())!;
    const b = (await tiles.nth(1).boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await expect(page.getByTestId("lot-tooltip")).toBeVisible();
    const watch = countTooltipToggles(page, 800);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
    const { toggles, present } = await watch;
    expect(toggles).toBe(0);
    expect(present).toBe(true);
  });
});

test.describe("Data Quality receives the parcel mismatch", () => {
  test("Eastland gets a farm-level card explaining 10 parcels against 11 lots, in Spanish by default", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("quest.intro.seen", "1"));
    await page.goto("/quality");
    await waitForRealm(page);
    const c = page.locator("[data-testid='quality-card'][data-lot='Eastland']");
    await expect(c).toHaveCount(1, { timeout: 20_000 });
    const issue = c.locator("[data-kind='parcel_geometry_mismatch']");
    await expect(issue).toHaveCount(1);
    await expect(issue).toContainText("El mapa de parcelas no coincide con los lotes");
    await expect(issue.getByTestId("quality-values")).toHaveAttribute("data-line", "Mapa: 10 parcelas / Libro: 11 lotes");
    await expect(issue).toContainText("Eastland County");
  });
});
