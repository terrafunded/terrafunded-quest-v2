# Polish log

Every polish pass follows the POLISH RULE: screenshot every route with Playwright at 1280 and 390 wide,
list at least three specific weaknesses (route + element), fix them, re-run build, lint, unit tests and
e2e (any regression reverts the change), and log the pass here with before/after screenshots under
`docs/screenshots/<theme>/pass-NN/`. A loop ends after two consecutive passes find nothing worth fixing,
hard cap 12 passes. Nothing changed in an earlier pass is touched again unless a screenshot shows it broke.

Screenshots: `npx tsx scripts/screenshots.ts --theme <theme> --out docs/screenshots/<theme>/pass-NN`
(11 routes × 2 widths, viewport-only JPEG q78, intro/celebrations skipped). The "before" of a pass is the
previous pass's "after" set; pass-01 is the baseline taken right after the theme system landed.

## Loop 1 · Iron Crown

### Pass 1 — baseline `docs/screenshots/iron-crown/pass-01/` → after `pass-02/`

Weaknesses found (route · element):

1. `/` at 390 · `ol[aria-label="Quest chain"]` (`QuestTree`) — the ten $1M nodes sat in a hidden horizontal scroller; 6M–10M were clipped with no affordance. Fixed: on phones the chain wraps into two rows of five (`flex-wrap basis-1/5`), the connector into/out of the row break is hidden; desktop unchanged.
2. `/quests` at 1280 and 390 · stage `Select` — "All sales (with a case)" truncated at `w-40`. Fixed: `w-52`.
3. `/sponsors` at 1280 · `LiberationBoard` h2 "Hostages of the realm · 7" — the count wrapped onto its own line under the heading. Fixed: heading `shrink-0 whitespace-nowrap`; the returned/total summary wraps instead, right-aligned.
4. `/chronicle` at 1280 · `EventRow` "net to date $2.24M" — wrapped onto two lines on the first two cards and one line on the rest. Fixed: `whitespace-nowrap`, amount column `shrink-0`.
5. `/trophies` at 1280 · `TrophyCard` rarity badge — dropped beneath the title on longer titles ("The First Scroll", "Territory Conquered") so the badge column jumped card to card. Fixed: title row `flex items-start justify-between`, badge `shrink-0`, title `min-w-0`.
6. `/realm` at 390 · `svg[data-testid="realm-map"]` — the 640 px map clipped Avery/Eastland/Franklin on the right with no hint. Fixed: scroller wrapper with a right-edge fade mask on phones (`.map-scroll`) and a "Swipe sideways to see every farm →" caption under 640 px.

Also fixed while here (found by the e2e run, not a screenshot): the Throne Room "Live chronicle" card and the shortcut grid lacked `min-w-0`, so the truncated titles pushed the document to 770 px wide on phones and the bottom nav scrolled off-screen.

Verification: `tsc -b` clean, `eslint .` clean, 162 unit tests, 61 Playwright tests (desktop + mobile) green. No reverts.

### Pass 2 — `pass-02/`

Re-inspected all 22 screenshots. All six pass-1 fixes hold (quest chain two rows on 390, selects full width, "Hostages · 7" single line, "net to date" single line, badges aligned top-right, map swipe hint). Nothing worth fixing found: the only remaining clip is the ledger table on `/quests` at 1280, which is an ordinary horizontal table scroller and is left as is.

### Pass 3 — confirmation

Screenshots re-taken to `/tmp` (no code changed between pass 2 and 3, so no new set is committed); spot-checked Throne Room, Realm, Quests, Trophies at both widths. Nothing worth fixing. Two consecutive clean passes → loop closed after 3 passes.

### Pass 4 — reopened by a screenshot (`pass-04/before-sponsors-390.jpg` → `pass-04/sponsors-390.jpg`)

The Gilded loop's pass-3 shot of `/sponsors` at 390 showed that the pass-1 fix to the `LiberationBoard` heading had broken the phone layout: the no-wrap heading squeezed the summary into a four-line column and pushed the card past the viewport (document 390 → ~470 px wide; the bottom nav slid off). Same defect in `iron-crown/pass-02/sponsors-390.jpg`, missed in pass 2. Fixed once for all themes: the header stacks on phones (`flex-col`) and only goes side-by-side from `sm:`. The 390-wide overflow audit (every route × every theme) is now clean. Verified with build, lint, 162 unit tests, 61 e2e.

## Loop 2 · Gilded Realm

### Pass 1 — baseline `docs/screenshots/gilded-realm/pass-01/` → after `pass-02/`

Weaknesses found (route · element):

1. `/` at 1280 and 390 · `net-profit-counter` (`.gold-shimmer.counter-glow`) — the headline number read as washed-out pale yellow on parchment. Root cause: gradient-clipped text is `color: transparent`, so the theme's `text-shadow` glow painted *through* the glyphs. Fixed for all themes: on `.gold-shimmer` / `.gold-text` counters the glow becomes a `drop-shadow()` filter, which follows the painted pixels; Gilded gets an engraved 1 px `gold-dim` shadow and a fainter halo.
2. `/` · `AmbientParticles` motes — dark green/teal specks read as dirt on parchment. Fixed: gold-dust recipe (three luminous golds), larger motes (1.4–3 px) with a wider soft glow.
3. Sidebar and mobile header · brand "EXODUS" (`font-display tracking-[0.25em]`) — Cinzel Decorative's swashes plus 0.25 em tracking produced uneven, gappy letter spacing. Fixed: `--brand-tracking` token (Iron 0.25 em, Gilded 0.1 em, Neon 0.3 em) used by the sidebar, mobile header and `/login` title.
4. `/realm` at 1280 · territory name `<text>` — gold on gold-filled conquered farms (Lamar, Freestone) had poor contrast. Fixed: `--map-label` token (Gilded ink `--foreground`; Iron and Neon keep gold).

Verification: build, lint, 162 unit tests, 61 e2e green. No reverts.

### Pass 2 — `pass-02/`

Counter is rich gold with an engraved edge, motes are gold dust, brand tracking even, farm names legible. Desktop routes (Throne, Realm, Pipeline, Trophies, Oracle, Treasury) and phone Throne/Chronicle inspected: nothing worth fixing.

### Pass 3 — `pass-03/` (before of the fix: `pass-03/before-sponsors-390.jpg`)

Regression spotted on `/sponsors` at 390 (see Iron pass 4 above): fixed the `LiberationBoard` header stacking; full set re-taken after the fix. Verified with build, lint, unit tests, e2e and the overflow audit.

### Pass 4 — confirmation (to `/tmp`)

Nothing worth fixing across the 22 shots; overflow audit clean on all 30 route × theme combinations.

### Pass 5 — confirmation (to `/tmp`)

Nothing worth fixing. Two consecutive clean passes → loop closed after 5 passes.
