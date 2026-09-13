import { expect, test, type Page } from "@playwright/test";

/**
 * /realm: the lot tooltip must be stable under a still pointer (the old rect scaled itself on
 * hover, which moved its edge under the cursor and fired leave/enter tens of times a second),
 * must follow the pointer across adjacent lots without closing, and must stay inside the viewport.
 */

async function waitForRealm(page: Page) {
  await expect(page.getByRole("status", { name: /Loading realm data|Cargando los datos del reino/ })).toHaveCount(0, { timeout: 30_000 });
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
    const moved = (await last.boundingBox())!;
    await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2);
    await expect(tooltip).toBeVisible();
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
