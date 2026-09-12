/**
 * Extra visual/layout checks beyond the matrix e2e assertions.
 */
import { chromium } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";
import { APP_ROUTES, MATRIX_DEVICES } from "../e2e/matrix";

loadDotenv();

type Defect = { route: string; device: string; element: string; detail: string };

async function main() {
  const email = process.env.QUEST_TEST_EMAIL!;
  const password = process.env.QUEST_TEST_PASSWORD!;
  const BASE = process.env.MOBILE_BASE ?? "http://localhost:4173";
  const browser = await chromium.launch();
  const boot = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bp = await boot.newPage();
  await bp.goto(`${BASE}/login`);
  await bp.getByLabel("Email").fill(email);
  await bp.getByLabel("Password").fill(password);
  await bp.getByRole("button", { name: "Enter" }).click();
  await bp.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  const storage = await boot.storageState();
  await boot.close();

  const defects: Defect[] = [];
  // Focus phones portrait + SE landscape + one tablet — full matrix is covered by e2e.
  const sample = MATRIX_DEVICES.filter(
    (d) =>
      d.project === "iphone-se-portrait" ||
      d.project === "iphone-se-landscape" ||
      d.project === "iphone-15-portrait" ||
      d.project === "pixel-8-portrait" ||
      d.project === "ipad-mini-portrait",
  );

  for (const device of sample) {
    const ctx = await browser.newContext({
      storageState: storage,
      viewport: device.viewport,
      deviceScaleFactor: device.deviceScaleFactor,
      isMobile: device.isMobile,
      hasTouch: device.hasTouch,
    });
    const page = await ctx.newPage();
    for (const route of APP_ROUTES) {
      await page.goto(`${BASE}${route}`);
      await page
        .getByRole("status", { name: "Loading realm data" })
        .waitFor({ state: "detached", timeout: 45_000 })
        .catch(() => undefined);
      await page.evaluate(() => sessionStorage.setItem("quest.intro.seen", "1"));
      await page.keyboard.press("Escape").catch(() => undefined);
      // Let FitMoney / counters settle.
      await page.waitForTimeout(1200);

      const found = await page.evaluate(({ vw, routeName }) => {
        const out: { element: string; detail: string }[] = [];
        const docSw = document.documentElement.scrollWidth;
        if (docSw > window.innerWidth + 1) {
          out.push({ element: "document", detail: `h-scroll scrollWidth=${docSw} vw=${window.innerWidth}` });
        }

        // Overflowing children past viewport (ignore absolute decorative).
        const all = Array.from(document.querySelectorAll<HTMLElement>("main *, [data-testid='nav-drawer'] *"));
        for (const el of all.slice(0, 800)) {
          const st = getComputedStyle(el);
          if (st.display === "none" || st.visibility === "hidden" || st.position === "fixed") continue;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          if (r.right > window.innerWidth + 2 && st.overflowX !== "auto" && st.overflowX !== "scroll") {
            // Parent scroller OK
            let p: HTMLElement | null = el.parentElement;
            let scrolled = false;
            while (p) {
              const ps = getComputedStyle(p);
              if (ps.overflowX === "auto" || ps.overflowX === "scroll" || ps.overflow === "auto") {
                scrolled = true;
                break;
              }
              p = p.parentElement;
            }
            if (!scrolled && r.right - window.innerWidth > 8) {
              out.push({
                element: el.getAttribute("data-testid") ?? el.className?.toString().slice(0, 40) ?? el.tagName,
                detail: `overflows right by ${(r.right - window.innerWidth).toFixed(1)}px`,
              });
              if (out.length > 15) break;
            }
          }
        }

        // Tables below 640 must be card mode (skip desktop-only / hidden tables).
        if (vw < 640) {
          for (const t of Array.from(document.querySelectorAll("table"))) {
            const st = getComputedStyle(t);
            if (st.display === "none" || st.visibility === "hidden") continue;
            const mobile = t.getAttribute("data-mobile");
            const firstRow = t.querySelector("tbody tr");
            const display = firstRow ? getComputedStyle(firstRow).display : "";
            if (mobile !== "cards" || (firstRow && display !== "block")) {
              out.push({
                element: t.getAttribute("data-testid") ?? "table",
                detail: `not stacked cards below 640 (data-mobile=${mobile} rowDisplay=${display})`,
              });
            }
          }
        }

        // Throne counter one line
        const counter = document.querySelector<HTMLElement>('[data-testid="net-profit-counter"]');
        if (counter && routeName === "/") {
          const r = counter.getBoundingClientRect();
          const fs = parseFloat(getComputedStyle(counter).fontSize);
          const lines = r.height / fs;
          if (lines > 1.35) {
            out.push({ element: "net-profit-counter", detail: `wraps (~${lines.toFixed(2)} lines) text=${counter.textContent}` });
          }
          // mid-value wrap: no soft hyphen / break in digits
          const text = counter.textContent ?? "";
          if (/\d\s+\d/.test(text.replace(/,/g, ""))) {
            out.push({ element: "net-profit-counter", detail: `number appears split: ${text}` });
          }
        }

        // Charts: svg should not exceed container
        for (const svg of Array.from(document.querySelectorAll(".recharts-responsive-container svg, .recharts-wrapper svg"))) {
          const box = svg.getBoundingClientRect();
          const parent = svg.closest(".recharts-responsive-container, .recharts-wrapper") as HTMLElement | null;
          if (parent) {
            const pb = parent.getBoundingClientRect();
            if (box.width > pb.width + 4) {
              out.push({ element: "chart-svg", detail: `svg ${box.width.toFixed(0)} > container ${pb.width.toFixed(0)}` });
            }
          }
          if (box.right > window.innerWidth + 2) {
            out.push({ element: "chart-svg", detail: `svg overflows viewport` });
          }
        }

        // Body / paragraph font floor (skip chart chrome — ticks/tooltips are deliberately small).
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("main p, main li"))) {
          if (el.closest(".recharts-wrapper, .recharts-responsive-container, .recharts-tooltip-wrapper")) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs > 0 && fs < 14.5) {
            out.push({
              element: el.tagName.toLowerCase(),
              detail: `body-ish font ${fs}px < 15 class=${(el.className || "").toString().slice(0, 60)} text=${(el.textContent || "").trim().slice(0, 40)}`,
            });
            break;
          }
        }

        return out;
      }, { vw: device.viewport.width, routeName: route });

      for (const f of found) {
        defects.push({ route, device: device.project, element: f.element, detail: f.detail });
      }
      process.stdout.write(`${device.project} ${route}: +${found.length}\n`);
    }
    await ctx.close();
  }

  await browser.close();
  mkdirSync("docs/screenshots/mobile", { recursive: true });
  writeFileSync("docs/screenshots/mobile/visual-defects.json", JSON.stringify({ defects }, null, 2));
  console.log(`\n${defects.length} visual defect(s)`);
  for (const d of defects.slice(0, 40)) console.log(`- [${d.device}] ${d.route} · ${d.element}: ${d.detail}`);
  if (defects.length) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
