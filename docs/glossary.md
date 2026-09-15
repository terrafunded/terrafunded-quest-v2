# Glossary — Quest bilingual terms

Canonical Spanish for every domain term. One term per concept across the whole app.

| English | Spanish | Notes |
|---|---|---|
| farm | **finca** | Never *granja*. |
| lot | **lote** | Never *terreno* or *parcela* in UI copy. |
| closing | **cierre** | Verb: *cerrar*. |
| reservation | **reserva** | Verb: *reservar*. |
| sponsor | **sponsor** | Kept in English — day-to-day team term. |
| note / promissory note | **pagaré** | |
| note sold | **pagaré vendido** | Lot stage `note_sold`. |
| net profit | **utilidad neta** | |
| gross profit | **utilidad bruta** | |
| capital outstanding | **capital pendiente** | |
| capital deployed | **capital desplegado** | |
| capital returned | **capital devuelto** | |
| turn / cycle | **ciclo** | Capital rotation: *ciclo de capital*. |
| exit horizon | **horizonte de salida** | Years 2027 / 2028 / 2029. |
| oxygen | **oxígeno** | Days gained vs required pace. |
| debt | **deuda** | Sponsor capital still owed. |
| liberation | **liberación** | Sponsor position repaid in full. |
| available | **disponible** | Lot stage. |
| reserved | **reservado** | Lot stage. |
| closed | **cerrado** | Lot stage. |
| fixed interest | **interés fijo** | Deal type. |
| profit share | **reparto de utilidades** | Deal type. |
| own capital | **capital propio** | Deal type. |
| conquered | **conquistada** | Campaign state (finca). |
| under siege | **bajo asedio** | Campaign state. |
| closing pending | **cierre pendiente** | Campaign state. |
| losing ground | **perdiendo terreno** | Campaign state. |
| assumption | **supuesto** | Badge on inputs not from Payments. |

## Product names (keep as-is)

| Name | Reason |
|---|---|
| **Quest** | Product title. |
| **Exodus** | Product / screen name used daily in English. |
| **Sponsor(s)** | Team vocabulary; Spanish copy still says *sponsor*. |
| **Throne Room** → **Sala del Trono** | Translated in nav and page chrome. |
| **War Plan** → **Plan de Guerra** | |
| **The Realm** → **El Reino** | |
| **Quests** → **Misiones** | Ledger of lot sales. |
| **Pipeline** → **Embudo** | |
| **Treasury** → **Tesorería** | |
| **Oracle** → **Oráculo** | |
| **Council** → **Consejo** | |
| **The Engine** → **El Motor** | |
| **Chronicle** → **Crónica** | |
| **Trophies** → **Trofeos** | |
| **Data Quality** → **Calidad de datos** | |

## Formatting

- Dates: `es-MX` → `19 may 2026` (never `May 19, 2026` in Spanish).
- Money: `$` prefix with locale grouping (`es-MX` / `en-US`).
- Plurals: `1 lote` / `2 lotes`; `1 lot` / `2 lots` — never mix.

## Guards

Regression guards live under `src/i18n/__tests__/` and `e2e/i18n-markers.spec.ts` (`npm run test:i18n` for the unit pair).

1. **EN/ES key parity** (`parity.test.ts`) — every `*_UI` dictionary must expose identical leaf key paths in `en` and `es` (functions count as leaves).
2. **No raw JSX English** (`no_raw_jsx_english.test.ts`) — TypeScript AST scan of `src/pages` and `src/components` flags JSX text and `aria-label` / `title` / `placeholder` / `alt` string literals that look like English prose (space + Latin letter, length > 3). Brand tokens without spaces (`Quest`, `Exodus`, `Sponsors`), pure numbers, testids, classNames, technical codes, `data-*`, and hrefs are out of scope. Remaining migration debt is listed in `I18N_LITERAL_ALLOWLIST` (full-string match); shrink that set, do not grow it for new copy. The suite includes a self-check that `<span>Hello Farm Capital Terms</span>` is flagged.
3. **Playwright bilingual markers** (`e2e/i18n-markers.spec.ts`) — each major route is loaded in `es` and `en`; body text must not contain the other language's chrome markers (stage labels `Available`/`Disponible`, `Terms`/`requerido`, English short dates `May 19, 2026` vs Spanish `19 may 2026`, etc.).

**Deliberate English keeps** (OK in Spanish UI): **Quest**, **Exodus**, **Sponsor(s)**. Bare **Capital** is not treated as an English leak because Spanish copy reuses it (`Capital desplegado`, `capital propio`). Payments path labels in `/quality` (`Farm Acquisitions → …`) stay English on purpose. Chronicle narrative prose is still English-only in the domain — full month names there are not e2e-flagged; the JSX allowlist and short-date shape cover UI chrome instead.
