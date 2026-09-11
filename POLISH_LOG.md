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
