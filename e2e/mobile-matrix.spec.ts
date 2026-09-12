import { expect, test, type Page } from "@playwright/test";
import { APP_ROUTES } from "./matrix";

/**
 * Mobile-matrix assertions that run once per device × orientation project:
 *  - document.scrollWidth === viewport width on every route (no horizontal scroll, ever)
 *  - tap targets ≥ 44×44 for interactive controls
 *  - body computed font-size ≥ 15px
 *  - inputs ≥ 16px (no iOS focus-zoom)
 */
async function waitForRealm(page: Page) {
  await expect(page.getByRole("status", { name: "Loading realm data" })).toHaveCount(0, { timeout: 45_000 });
  await page.evaluate(() => sessionStorage.setItem("quest.intro.seen", "1"));
  await page.keyboard.press("Escape").catch(() => undefined);
}

async function assertNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth, viewport } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    viewport: window.innerWidth,
  }));
  expect(scrollWidth, `scrollWidth ${scrollWidth} > viewport ${viewport}`).toBeLessThanOrEqual(Math.max(clientWidth, viewport) + 1);
}

async function assertTapTargets(page: Page) {
  const undersized = await page.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>(
        "button:not([role='radio']), a.nav-item, a.touch-link, [role='button'], input, select, textarea, summary, [data-testid='nav-menu-button']",
      ),
    );
    return els
      .filter((el) => {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        // Subpixel DPR rounding (e.g. 43.98) still counts as a 44px target.
        return Math.round(r.width) < 44 || Math.round(r.height) < 44;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          testid: el.getAttribute("data-testid"),
          aria: el.getAttribute("aria-label"),
          text: (el.textContent ?? "").trim().slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })
      .slice(0, 25);
  });
  expect(undersized, `undersized tap targets: ${JSON.stringify(undersized, null, 2)}`).toEqual([]);
}

async function assertReadableType(page: Page) {
  const sizes = await page.evaluate(() => {
    const body = Number.parseFloat(getComputedStyle(document.body).fontSize);
    const inputs = Array.from(document.querySelectorAll<HTMLElement>("input, select, textarea")).map((el) =>
      Number.parseFloat(getComputedStyle(el).fontSize),
    );
    return { body, inputs };
  });
  expect(sizes.body).toBeGreaterThanOrEqual(15);
  for (const s of sizes.inputs) expect(s).toBeGreaterThanOrEqual(16);
}

test.describe("Mobile matrix", () => {
  for (const route of APP_ROUTES) {
    test(`${route}: no horizontal scroll, readable type, 44px targets`, async ({ page }) => {
      await page.goto(route);
      await waitForRealm(page);
      // Let layout settle (fonts, charts).
      await page.waitForTimeout(400);
      await assertNoHorizontalScroll(page);
      await assertReadableType(page);
      await assertTapTargets(page);
    });
  }

  test("drawer stays inside the viewport", async ({ page }) => {
    await page.goto("/");
    await waitForRealm(page);
    await page.getByTestId("nav-menu-button").click();
    const drawer = page.getByTestId("nav-drawer");
    await expect(drawer).toBeVisible();
    // Wait for Framer Motion slide-in to finish (x ≈ 0) before measuring.
    await expect.poll(async () => {
      const box = await drawer.boundingBox();
      return box?.x ?? -999;
    }).toBeGreaterThanOrEqual(-1);
    const box = await drawer.boundingBox();
    const vp = page.viewportSize()!;
    expect(box).toBeTruthy();
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
    await assertNoHorizontalScroll(page);
  });
});
