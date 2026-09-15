# Glossary — Quest bilingual terms

Canonical Spanish for every domain term. One term per concept across the whole app.
Medieval and game-flavoured words are not used in user-facing copy.

| English | Spanish | Notes |
|---|---|---|
| farm | **finca** | Never *granja*. |
| lot | **lote** | Never *terreno* or *parcela* in UI copy. |
| closing | **cierre** | Verb: *cerrar*. |
| reservation | **reserva** | Verb: *reservar*. |
| reserved | **reservó** / **reservado** | Past verb / stage. Never *pledged*. |
| sponsor | **sponsor** | Kept in English — day-to-day team term. |
| investor | **inversionista** | |
| note / promissory note | **pagaré** | |
| note sold | **pagaré vendido** | Lot stage `note_sold`. |
| net profit | **utilidad neta** | |
| gross profit | **utilidad bruta** | |
| capital outstanding | **capital pendiente** | |
| capital deployed | **capital desplegado** | |
| capital returned | **capital devuelto** | Never *liberation* / *liberated*. |
| capital still out | **capital aún afuera** | Never *hostages*. |
| turn / cycle | **ciclo** | Capital rotation: *ciclo de capital*. |
| exit horizon | **horizonte de salida** | Years 2027 / 2028 / 2029. |
| pace | **ritmo** | Days gained vs required pace. Never *oxygen*. |
| debt / capital owed | **capital adeudado** | Sponsor capital still owed. |
| available | **disponible** | Lot stage. |
| reserved | **reservado** | Lot stage. |
| closed | **cerrado** | Lot stage. |
| fixed interest | **interés fijo** | Deal type. |
| profit share | **reparto de utilidades** | Deal type. |
| own capital | **capital propio** | Deal type. |
| farm paid off | **finca pagada** | Campaign state `conquered` (id unchanged). |
| farm not yet covered | **finca por cubrir** | Campaign state `under_siege` (id unchanged). |
| closing pending | **cierre pendiente** | Campaign state. |
| no recent closings | **sin cierres recientes** | Campaign state `losing_ground` (id unchanged). |
| stuck reservations | **reservas atascadas** | Never *the stuck list*. |
| latest closing | **último cierre** | Never *latest breath*. |
| biggest impact | **mayor impacto** | Never *deepest breath*. |
| assumption | **supuesto** | Badge on inputs not from Payments. |
| closed-lot average | **promedio de lotes cerrados** | Name the figure. Never *the ledger* / *el libro*. |
| Payments | **Payments** | Source of record. Prefer this over *ledger* / *libro*. |

## Screen names (user-facing)

Routes, files and domain types keep their internal names. Only the heading / nav label changes.

| Route | English | Spanish | Do not use |
|---|---|---|---|
| `/` | **Overview** | **Resumen** | Throne Room, Sala del Trono |
| `/realm` | **Farms and lots** | **Fincas y lotes** | The Realm, El Reino |
| `/council` | **Recommendations** | **Recomendaciones** | The Council, El Consejo |
| `/engine` | **Capital projection** | **Proyección de capital** | The Engine, El Motor |
| `/warplan` | **Plan** | **Plan** | War Plan, Plan de Guerra |
| `/quests` | **Lots** | **Lotes** | Quests, Misiones |
| `/oracle` | **Simulator** | **Simulador** | Oracle, Oráculo |
| `/chronicle` | **Activity** | **Actividad** | Chronicle, Crónica |
| `/treasury` | **Cash flow** | **Flujo de efectivo** | Treasury, Tesorería |
| `/trophies` | **Milestones** | **Logros** | Trophies, Trofeos |
| `/pipeline` | **Pipeline** | **Pipeline** | Keep in both languages (not Embudo). |
| `/quality` | **Data Quality** | **Calidad de datos** | |

## Product names (keep as-is)

| Name | Reason |
|---|---|
| **Quest** | Product title. |
| **Exodus** | Founder's name for the LP capital-return plan — a proper noun, not decoration. |
| **Sponsor(s)** | Team vocabulary; Spanish copy still says *sponsor*. |

## Formatting

- Dates: `es-MX` → `19 may 2026` (never `May 19, 2026` in Spanish).
- Money: `$` prefix with locale grouping (`es-MX` / `en-US`).
- Plurals: `1 lote` / `2 lotes`; `1 lot` / `2 lots` — never mix.

## Guards

Regression guards live under `src/i18n/__tests__/` and `e2e/i18n-markers.spec.ts` (`npm run test:i18n` for the unit pair).

1. **EN/ES key parity** (`parity.test.ts`) — every `*_UI` dictionary must expose identical leaf key paths in `en` and `es` (functions count as leaves).
2. **No raw JSX English** (`no_raw_jsx_english.test.ts`) — TypeScript AST scan of `src/pages` and `src/components` flags JSX text and `aria-label` / `title` / `placeholder` / `alt` string literals that look like English prose.
3. **Banned medieval / game words** (`banned_words.test.ts`) — user-visible strings in both languages must not contain the retired vocabulary (Throne Room, Realm, pledged, conquered, Oxygen, …).
4. **Playwright bilingual markers** (`e2e/i18n-markers.spec.ts`) — each major route is loaded in `es` and `en`; body text must not contain the other language's chrome markers.

**Deliberate English keeps** (OK in Spanish UI): **Quest**, **Exodus**, **Sponsor(s)**, **Pipeline**, **Payments**. Bare **Capital** is not treated as an English leak because Spanish copy reuses it (`Capital desplegado`, `capital propio`). Payments path labels in `/quality` (`Farm Acquisitions → …`) stay English on purpose.
