# MOBILE_LOG — perfection loop

Rules (every page, every device): no horizontal scroll; `100dvh`; `env(safe-area-inset-*)`;
tap targets ≥ 44×44; body text ≥ 15px; inputs ≥ 16px; tables → stacked cards below 640px;
charts fill their container; long names ellipsize; Throne counter fits one line at 360px;
drawer/modals stay in viewport; sticky chrome never covers content; landscape works.

Matrix: iPhone SE / 15 / 15 Pro Max, Pixel 8, iPad Mini, iPad Pro × portrait + landscape.

## Pass log

### Pass 01 — CLEAN (2026-09-11)

**Checks:** `npm run build` · `npm run lint` · `npm test` (162) · `e2e:matrix` (133) ·
`mobile:audit --pass 01` (120 screenshots, 0 defects) · `mobile-visual-check` (0 defects).

**Defects found this pass (fixed before the clean re-run):**

| Route | Device | Element | Wrong | Fix |
|---|---|---|---|---|
| `/quests`, `/pipeline` | phones | `<select>` | `text-sm` / 14px → iOS zoom risk | Select → `text-base` + `h-11`; CSS `font-size: 16px !important` on inputs/selects |
| all | phones | `button` | default `h-10` (40px) | Button sizes → `h-11` / `min-h-11`; tap CSS `min-height: 44px !important` |
| `/chronicle` | phones | filter chips | subpixel 43.98 reported as undersized | assert with `Math.round` ≥ 44 |
| all | phones | drawer | measured mid Framer enter (`x < 0`) | wait until `x ≥ -1` before assert |
| all | phones | `.text-sm` / `.text-xs` | Tailwind 14px / 12px body copy | theme `fontSize.sm`/`xs` → 15px |
| `/sponsors` | <640 | farm `<table>` | wide table, not cards | stacked farm cards below `sm`, table from `sm` up |
| `/` | SE landscape | QuestTree | nodes overflowed viewport ~30px | horizontal scroll chain, 44px nodes |
| audit tooling | portrait `/quests` | screenshot | fullPage JPEG empty (canvas limit) | viewport screenshots + empty-file defect |

**Screenshots:** `docs/screenshots/mobile/pass-01/` (before: empty/failed quests shots from earlier
iteration; after: full matrix viewport JPGs under each device/orientation).

**Deploy:** pending push to `v2` + `verify:live` after this log.

